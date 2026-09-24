--
-- Quotes -- notifications in the reader's language (proposal §13.6 #18,
-- Phase 11). Closes the one gap Phase 11 shipped open.
--
-- THE PROBLEM. `quote_portal_events_notify()` and `sweep_expired_quotes()` built
-- their text with `format()`, in English, and wrote it into
-- `task_notifications.title` / `.body`. A Spanish or French installation got
-- English sentences in the bell -- in an interface that is otherwise fully
-- translated, and for the one module whose whole point is being told something
-- in time.
--
-- WHAT WAS PLANNED, AND WHY IT IS NOT WHAT WAS BUILT. §13.6 #18 prescribed "a
-- locale column on `sales` or `notification_preferences`, plus a payload the
-- bell translates". The locale column turned out to be unnecessary and worse:
-- the bell already renders inside an i18nProvider that knows the language the
-- user is looking at RIGHT NOW. A stored locale would be a second source of
-- truth for the same question, and it would be the stale one the first time
-- somebody switches language. So: no locale column. The database says WHAT
-- happened; the client, which alone knows the language, says it.
--
-- THE SHAPE. Two nullable columns rather than one jsonb blob: `message_key` is
-- greppable, indexable and its null has an exact meaning -- "this row has no
-- translatable form, render `title` / `body`", which is every task-reminder row
-- ever written and every row written before this migration. No backfill.
--
-- `title` and `body` are still written, in English, and are still the truth for
-- any reader with no catalogue -- the `task-notification-worker` edge function
-- above all, which composes email outside React. Email therefore stays English
-- until somebody gives that worker a catalogue; it is also `skipped` for want of
-- an outbound provider in this stack (§12), so no message a user can actually
-- receive is affected. The in-app bell -- the surface that exists and that
-- people read -- is translated.
--

alter table public.task_notifications
    add column if not exists message_key    text,
    add column if not exists message_params jsonb;

comment on column public.task_notifications.message_key is
    'Translation key for the client to render, e.g. crm.notifications.quote.accepted. Null means this row has no translatable form and title/body are the text. The database never stores a translated sentence: it does not know the reader.';

--
-- The notifier, taught to carry a key beside the English fallback.
--
-- A drop and create rather than a replace: adding defaulted parameters to an
-- existing function OVERLOADS it instead of replacing it, and two candidates
-- differing only in trailing defaults make every call ambiguous. Dropping takes
-- the grants with it, so they are restated below.
--
drop function if exists public.notify_quote_event(bigint, text, text, text, text, bigint);

create or replace function public.notify_quote_event(
    p_quote_id        bigint,
    p_event           text,
    p_title           text,
    p_body            text    default null,
    p_dedupe_suffix   text    default null,
    p_extra_recipient bigint  default null,
    -- What the client renders. `p_title` / `p_body` remain the English
    -- fallback for a reader with no catalogue.
    p_message_key     text    default null,
    p_message_params  jsonb   default null
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
                scheduled_for, title, body, message_key, message_params,
                dedupe_key, status, sent_at, delivered_at, error)
            values (
                null, 'quote', p_quote_id, v_recipient, v_channel,
                v_send_at, p_title, p_body, p_message_key, p_message_params,
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

revoke all on function public.notify_quote_event(bigint, text, text, text, text, bigint, text, jsonb)
    from public, anon, authenticated;
grant all on function public.notify_quote_event(bigint, text, text, text, text, bigint, text, jsonb)
    to service_role;

--
-- What the customer did, said in a way the reader's client can translate.
--
-- Every `format()` below is now a PAIR: the English sentence, which stays the
-- fallback, and the key plus its parameters, which is what the bell renders.
-- The two must say the same thing -- `notificationText.test.ts` pins the keys
-- against the catalogue, and `quotes_notifications.test.sql` pins the
-- parameters against what the trigger knows.
--
-- The customer's own words (a comment's excerpt) stay in `body` and are NEVER
-- given a key: they are data, not a message, and translating them would be a
-- lie about who wrote them.
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
            new.version_id::text,
            null,
            'crm.notifications.quote.viewed',
            jsonb_build_object('number', v_number));
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
            new.id::text,
            null,
            'crm.notifications.quote.commented',
            -- `actor` is left NULL rather than defaulted to a word: "The
            -- customer" is itself a sentence needing translation, and the
            -- client has the catalogue. The English fallback above keeps it.
            jsonb_build_object(
                'number', v_number,
                'actor',  nullif(btrim(coalesce(new.actor_name, '')), '')));
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
        v_deal_owner,
        case when new.event_type = 'accepted'
             then 'crm.notifications.quote.accepted'
             else 'crm.notifications.quote.rejected' end,
        jsonb_build_object(
            'number',      v_number,
            'actor',       v_actor,
            'version',     new.payload ->> 'version_number',
            -- The CODE, never a label: `price` is a value from a check
            -- constraint, and the words for it live in the catalogue beside
            -- the dialog that offered them.
            'reason_code', new.payload ->> 'reason_code'));

    return new;
end;
$$;

--
-- The validity sweep, same treatment.
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
            (current_date + 3)::text,
            null,
            'crm.notifications.quote.expiring',
            jsonb_build_object('number', v_number));
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
            null,
            null,
            'crm.notifications.quote.expired',
            jsonb_build_object('number', v_number));

        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;
