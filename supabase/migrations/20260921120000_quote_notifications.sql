--
-- Quotes -- the notification outbox, widened to carry a subject that is not a
-- task (proposal §8, Phase 11). Closes §13.6 #14: until now nobody was told
-- when a customer opened, wrote on, accepted or declined a quotation.
--
-- WHY THE EXISTING OUTBOX AND NOT A SECOND ONE. `task_notifications` already
-- owns everything a second inbox would have had to rebuild: the
-- `supabase_realtime` publication and its `replica identity full`, the claim /
-- settle pair with `for update skip locked`, the worker's drain loop, quiet
-- hours, digest mode, `max_per_hour`, the dedupe window, the `dedupe_key`
-- idempotency, the inbox partial index and the bell's Realtime filter. A
-- `quote_notifications` table would have duplicated all of it AND left quiet
-- hours and the hourly ceiling UNENFORCED for quotes -- which is precisely the
-- fatigue `notification_preferences` exists to prevent. §8 weighs the three
-- options; this is Option A.
--
-- THE RISK, NAMED. The worker is live infrastructure firing every minute via
-- pg_cron, and a regression here stops task reminders for every user SILENTLY
-- -- silently is the problem, because nobody reports a notification they never
-- expected. Three mitigations, all in this migration:
--   1. `task_module_notification_worker.test.sql` was extended FIRST, and shown
--      red against the pre-change functions, so the task path is pinned by
--      assertions written before the code moved.
--   2. The check constraint refuses a malformed row at INSERT rather than
--      mis-delivering it later.
--   3. The claim's change is `join` -> `left join` plus one `coalesce`, with no
--      control-flow change, so the task path is provably unaffected.
--
-- The table's name becomes a mild lie. That is addressed with `comment on
-- table` and NOT a rename: renaming touches the worker, the hook, the
-- publication, three grants and two pgTAP files, and is a separate mechanical
-- change (§12).
--

--
-- 1. The subject, widened additively.
--
-- One nullable column and two new ones. No backfill: every existing row keeps
-- its `task_id` and gets a null `entity_type`, which the constraint accepts.
--
alter table public.task_notifications
    alter column task_id drop not null;

alter table public.task_notifications
    add column if not exists entity_type public.task_entity,
    add column if not exists entity_id   bigint;

-- Exactly one subject, never two and never none. A row with both would be
-- filed under a task AND a quote and read differently by each; a row with
-- neither is a notification about nothing.
alter table public.task_notifications
    drop constraint if exists task_notifications_subject;
alter table public.task_notifications
    add constraint task_notifications_subject check (
        (task_id is not null and entity_type is null and entity_id is null)
     or (task_id is null and entity_type is not null and entity_id is not null));

-- The mirror of `task_notifications_task`: "everything ever sent about this
-- quote", which is what the module's own history reads.
create index if not exists task_notifications_entity
    on public.task_notifications (entity_type, entity_id, created_at desc)
    where entity_type is not null;

comment on table public.task_notifications is
    'The notification outbox. Named for the task module that introduced it; since the quotes module (proposal §8) a row subject is EITHER task_id OR the (entity_type, entity_id) pair, never both -- see task_notifications_subject. Renaming the table is a separate mechanical change (§12), not a rename hidden inside a feature.';

--
-- 2. The claim, taught that a subject may not be a task.
--
-- `returns table` is part of the signature, so this is a drop and create rather
-- than a replace -- and therefore the grants have to be restated below, because
-- dropping a function drops its privileges with it.
--
drop function if exists public.claim_task_notifications(public.reminder_channel[], integer);

create or replace function public.claim_task_notifications(
    p_channels public.reminder_channel[] default
        array['email', 'push', 'whatsapp', 'sms', 'webhook']::public.reminder_channel[],
    p_limit integer default 50
)
returns table (
    id            bigint,
    task_id       bigint,
    channel       public.reminder_channel,
    recipient_id  bigint,
    recipient_email text,
    recipient_name  text,
    recipient_digest boolean,
    title         text,
    body          text,
    scheduled_for timestamp with time zone,
    attempt       smallint,
    task_title    text,
    task_due_date timestamp with time zone,
    -- Appended, never inserted mid-list: the worker reads these by name, and a
    -- reordered `returns table` is the kind of change that compiles and then
    -- delivers the wrong field.
    entity_type   public.task_entity,
    entity_id     bigint
)
    language plpgsql security definer
    set search_path to ''
as $$
begin
    return query
    with claimed as (
        update public.task_notifications n
           set status  = 'sending',
               attempt = n.attempt + 1
         where n.id in (
                   select c.id
                     from public.task_notifications c
                    where c.status = 'queued'
                      and c.channel = any (p_channels)
                      and c.scheduled_for <= now()
                      and (select count(*)
                             from public.task_notifications s
                            where s.recipient_id = c.recipient_id
                              and s.status in ('sent', 'delivered')
                              and s.sent_at > now() - interval '1 hour')
                          < (public.notification_prefs_for(c.recipient_id)).max_per_hour
                    order by c.scheduled_for
                    limit p_limit
                      for update skip locked)
        returning n.*
    )
    select c.id, c.task_id, c.channel, c.recipient_id,
           -- `sales.email` is citext; the declared return type is text, and
           -- Postgres compares those structurally, not by implicit cast.
           s.email::text,
           nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
           (public.notification_prefs_for(c.recipient_id)).digest_mode,
           -- The row's own title wins. A task row that left it null falls back
           -- to the task's, exactly as before; a quote row always writes one,
           -- because there is no second place to take it from.
           coalesce(c.title, t.title),
           c.body, c.scheduled_for, c.attempt,
           t.title, t.due_date,
           c.entity_type, c.entity_id
      from claimed c
      join public.sales s on s.id = c.recipient_id
      -- LEFT, so a row whose subject is not a task is claimed instead of
      -- silently dropped. This one word is the whole risk of the widening.
      left join public.tasks t on t.id = c.task_id;
end;
$$;

revoke all on function public.claim_task_notifications(public.reminder_channel[], integer)
    from public, anon, authenticated;
grant all on function public.claim_task_notifications(public.reminder_channel[], integer)
    to service_role;

--
-- 3. The audit trigger, taught the same thing.
--
-- It writes into the TASK's timeline. A quote row has no task timeline, and
-- `emit_task_event(null, ...)` would raise -- taking the settlement down with
-- it, so a failed quote email would leave its row stuck at `sending` forever.
-- The quote's own trail is `quote_portal_events` and `quote_status_changes`; a
-- delivery failure is not a commercial act and does not belong on it.
--
create or replace function public.task_notifications_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if new.task_id is null then
        return new;
    end if;

    if new.status in ('failed', 'bounced') and old.status is distinct from new.status then
        perform public.emit_task_event(
            new.task_id, 'reminder.failed', null, null, null,
            jsonb_build_object('notification_id', new.id,
                               'channel', new.channel,
                               'recipient_id', new.recipient_id,
                               'attempt', new.attempt,
                               'error', new.error),
            null, 'system');
    elsif new.acknowledged_at is not null and old.acknowledged_at is null then
        perform public.emit_task_event(
            new.task_id, 'reminder.acknowledged', new.recipient_id, null, null,
            jsonb_build_object('notification_id', new.id, 'channel', new.channel),
            null, 'user');
    end if;

    return new;
end;
$$;

--
-- 4. The quote notifier.
--
-- One writer for every quote notification, so quiet hours, the mute list and
-- the dedupe window have ONE implementation rather than one per call site.
-- Modelled on the body of `dispatch_due_reminders()` and deliberately not
-- extracted from it: that loop also advances reminder schedules and fires task
-- events, and a shared helper would have to be passed a task or a quote and
-- branch internally -- which is the parallel system §8 Option C was rejected
-- for, arriving by another road.
--
-- CHANNELS. `in_app` always: the row IS the delivery, Realtime streams it to
-- the bell, and it costs nothing. `email` only for the four events a rep
-- cannot afford to miss while out of the app -- an answer, and the two
-- validity notices. A `viewed` or a customer comment is in-app only, because
-- an email per customer open is the fatigue this module's preferences exist to
-- prevent, and because those two are the high-frequency events.
--
-- A recipient with no `sales` row, or a disabled one, is skipped -- never
-- silently attributed to somebody else.
--
create or replace function public.notify_quote_event(
    p_quote_id       bigint,
    p_event          text,
    p_title          text,
    p_body           text     default null,
    p_dedupe_suffix  text     default null,
    p_extra_recipient bigint  default null
)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote     public.quotes;
    v_recipient bigint;
    v_prefs     public.notification_preferences;
    v_channel   public.reminder_channel;
    v_channels  public.reminder_channel[];
    v_send_at   timestamp with time zone;
    v_status    text;
    v_error     text;
    v_written   integer := 0;
begin
    select * into v_quote from public.quotes q where q.id = p_quote_id;
    if v_quote.id is null then
        return 0;
    end if;

    -- The events worth an email are the terminal ones and the two that carry a
    -- deadline. The rest stay in the bell.
    v_channels := case
        when p_event in ('accepted', 'rejected', 'expired', 'expiring')
            then array['in_app', 'email']::public.reminder_channel[]
        else array['in_app']::public.reminder_channel[]
    end;

    for v_recipient in
        select s.id
          from public.sales s
         where s.disabled is not true
           and s.id in (v_quote.sales_id, p_extra_recipient)
    loop
        v_prefs := public.notification_prefs_for(v_recipient);

        foreach v_channel in array v_channels loop
            v_send_at := now();
            v_status  := 'queued';
            v_error   := null;

            if v_channel = any (v_prefs.muted_channels) then
                -- The row still exists, marked, so the suppression is auditable
                -- rather than a gap somebody has to explain.
                v_status := 'skipped';
                v_error  := format('channel %s muted by recipient', v_channel);

            elsif v_channel <> 'in_app' then
                -- Several acts on one quote inside the window are one ping.
                -- Scoped to the quote, exactly as the task path scopes it to
                -- the task.
                if v_prefs.dedupe_window_minutes > 0
                   and exists (select 1 from public.task_notifications n
                                where n.entity_type = 'quote'
                                  and n.entity_id = p_quote_id
                                  and n.recipient_id = v_recipient
                                  and n.channel = v_channel
                                  and n.status <> 'skipped'
                                  and n.created_at > now()
                                      - make_interval(mins => v_prefs.dedupe_window_minutes))
                then
                    v_status := 'skipped';
                    v_error  := 'deduplicated: same quote already notified in this window';
                else
                    v_send_at := public.next_allowed_send_at(
                        v_send_at, v_prefs.timezone,
                        v_prefs.quiet_hours_start, v_prefs.quiet_hours_end);

                    if v_prefs.digest_mode then
                        v_send_at := greatest(
                            v_send_at,
                            public.next_digest_at(v_send_at, v_prefs.timezone,
                                                  v_prefs.digest_at));
                    end if;
                end if;
            end if;

            insert into public.task_notifications (
                task_id, entity_type, entity_id, recipient_id, channel,
                scheduled_for, title, body, dedupe_key, status,
                sent_at, delivered_at, error)
            values (
                null, 'quote', p_quote_id, v_recipient, v_channel,
                v_send_at, p_title, p_body,
                -- `quote:<id>:<event>:<suffix>:<recipient>:<channel>`. The
                -- suffix is what makes "first view of version 3" distinct from
                -- "first view of version 4" while both stay idempotent: a
                -- replayed call is a no-op, not a second ping.
                format('quote:%s:%s:%s:%s:%s', p_quote_id, p_event,
                       coalesce(p_dedupe_suffix, ''), v_recipient, v_channel),
                case when v_status <> 'queued' then v_status
                     when v_channel = 'in_app' then 'delivered'
                     else 'queued' end,
                case when v_status = 'queued' and v_channel = 'in_app' then now() end,
                case when v_status = 'queued' and v_channel = 'in_app' then now() end,
                v_error)
            on conflict (dedupe_key) do nothing;

            if found then
                v_written := v_written + 1;
            end if;
        end loop;
    end loop;

    return v_written;
end;
$$;

revoke all on function public.notify_quote_event(bigint, text, text, text, text, bigint)
    from public, anon, authenticated;
grant all on function public.notify_quote_event(bigint, text, text, text, text, bigint)
    to service_role;

--
-- 5. What the customer did, turned into a notification.
--
-- A TRIGGER on the trail rather than a call in each portal function, and the
-- reason is §5's: the event row IS the record of what happened. Deriving the
-- notification from it means a portal path added later cannot forget to notify,
-- and "the first view of this version" is a count on the table the trigger is
-- already sitting on. The alternative -- four `perform notify_quote_event(...)`
-- lines inside four functions -- is four places to keep in step.
--
-- Only four of the seven event types notify. `token_invalid` and `throttled`
-- are security noise, not news about the document, and `downloaded` is a second
-- look at what `viewed` already reported. `sent` notifies nobody at all,
-- because the rep just did it (§8).
--
-- §8 calls the comment event `comment_added`; the column's check constraint
-- calls it `commented`, and the constraint is what exists.
--
create or replace function public.quote_portal_events_notify() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote   public.quotes;
    v_number  text;
    v_deal_owner bigint;
    v_actor   text;
    v_excerpt text;
begin
    if new.event_type not in ('viewed', 'accepted', 'rejected', 'commented') then
        return new;
    end if;

    select * into v_quote from public.quotes q where q.id = new.quote_id;
    if v_quote.id is null then
        return new;
    end if;
    v_number := v_quote.quote_number;

    -- A view is news the FIRST time a version is opened. Every later open is
    -- the same customer re-reading the same document, and a ping for each one
    -- is how a bell gets ignored.
    --
    -- "First time" is enforced by the `dedupe_key` ALONE -- the version id is
    -- the dedupe suffix, so every later view of that version computes the same
    -- key and `on conflict do nothing` drops it. An earlier draft also counted
    -- prior `viewed` events here and returned early; a mutation check could not
    -- make that guard matter, because the key had already done the work. Two
    -- mechanisms for one rule is the drift this module keeps refusing (§6.4):
    -- the one that is testable stays.
    if new.event_type = 'viewed' then
        perform public.notify_quote_event(
            new.quote_id, 'viewed',
            format('%s was opened by the customer', v_number),
            null,
            new.version_id::text);
        return new;
    end if;

    if new.event_type = 'commented' then
        v_actor := coalesce(nullif(btrim(coalesce(new.actor_name, '')), ''),
                            'The customer');

        -- The preview is read from the comment rather than copied into the
        -- event's payload: the trail would then hold a second copy of words
        -- that already have a home, and the two could only ever disagree.
        -- `quote_portal_comment()` writes the comment immediately before the
        -- event, in this transaction, so the newest customer comment on this
        -- version is the one that just arrived.
        select left(c.body, 140) into v_excerpt
          from public.quote_comments c
         where c.version_id = new.version_id
           and c.author_kind = 'customer'
           and c.deleted_at is null
         order by c.id desc
         limit 1;

        perform public.notify_quote_event(
            new.quote_id, 'commented',
            format('%s: %s wrote on the quotation', v_number, v_actor),
            v_excerpt,
            new.id::text);
        return new;
    end if;

    -- An answer reaches the deal owner as well, when the quote was raised
    -- against somebody else's opportunity -- they are the one who has to act on
    -- it. `notify_quote_event()` resolves the pair, so one recipient named
    -- twice is still one notification.
    select d.sales_id into v_deal_owner
      from public.deals d where d.id = v_quote.deal_id;

    v_actor := nullif(btrim(coalesce(new.actor_name, '')), '');

    perform public.notify_quote_event(
        new.quote_id, new.event_type,
        case when new.event_type = 'accepted'
             then format('%s was accepted', v_number)
             else format('%s was declined', v_number) end,
        case when new.event_type = 'accepted'
             then nullif(btrim(concat_ws(' ', v_actor, 'accepted version',
                                         new.payload ->> 'version_number')), '')
             else nullif(btrim(concat_ws(' ',
                      coalesce(v_actor, 'The customer'), 'declined:',
                      coalesce(new.payload ->> 'reason_code', 'no reason given'))), '')
        end,
        new.version_id::text,
        v_deal_owner);

    return new;
end;
$$;

-- `alter default privileges` grants execute on every new function in `public`,
-- `anon` included. Every function this module adds is revoked from it
-- explicitly -- the trap `quotes_anon_grants.test.sql` exists to catch (§7).
revoke all on function public.quote_portal_events_notify()
    from public, anon, authenticated;
grant execute on function public.quote_portal_events_notify() to service_role;

-- AFTER INSERT: the notification is a consequence of the event, so it must not
-- be able to stop the event being recorded. The trail is the record either way
-- (§5).
drop trigger if exists quote_portal_events_notify on public.quote_portal_events;
create trigger quote_portal_events_notify
    after insert on public.quote_portal_events
    for each row execute function public.quote_portal_events_notify();

--
-- 6. The validity sweep, and the notice before it (§13.6 #9).
--
-- `sweep_expired_quotes()` existed and was never scheduled, which made it a
-- function that could only ever be run by hand -- so in practice an offer
-- nobody answered stayed `sent` forever. The daily job is added below; this
-- replaces the body so that the same pass ALSO warns before the date, because
-- a notification that an offer has already lapsed arrives too late to act on.
--
-- Both loops run on `quotes_expiring_idx`, so the cost stays the size of the
-- pending work rather than the size of the quote history. The return value is
-- unchanged -- the number EXPIRED -- so the signature, and therefore every
-- caller and grant, is untouched.
--
create or replace function public.sweep_expired_quotes()
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_id     bigint;
    v_number text;
    v_count  integer := 0;
begin
    -- The warning first: a quote expiring in exactly three days (§8). Keyed on
    -- the date rather than a range, so a sweep that ran twice in one day does
    -- not warn twice -- and `dedupe_key` catches it even if it does.
    for v_id, v_number in
        select q.id, q.quote_number from public.quotes q
         where q.valid_until = current_date + 3
           and q.status_key in ('sent', 'viewed', 'under_review')
         order by q.valid_until
    loop
        perform public.notify_quote_event(
            v_id, 'expiring',
            format('%s expires in 3 days', v_number),
            'The customer has not answered yet.',
            (current_date + 3)::text);
    end loop;

    for v_id, v_number in
        select q.id, q.quote_number from public.quotes q
         where q.valid_until is not null
           and q.valid_until < current_date
           and q.status_key in ('sent', 'viewed', 'under_review')
         order by q.valid_until
    loop
        perform public.apply_quote_status(
            v_id, 'expired', 'validity elapsed', 'system', null, null, null);

        -- After the transition, not before: a notification for a move that
        -- then failed is worse than none, because it is believed.
        perform public.notify_quote_event(
            v_id, 'expired',
            format('%s has expired', v_number),
            'The offer lapsed without an answer.',
            null);

        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;
