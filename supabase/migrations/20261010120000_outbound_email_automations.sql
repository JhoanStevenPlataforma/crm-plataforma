--
-- Outbound email, phase 3: automations (docs/proposals/outbound-email.md).
--
-- Mail the CRM sends by itself, as rules an administrator switches on: a
-- confirmation when a quotation is accepted, and a follow-up some days after a
-- quotation was sent and not answered. Both are seeded DISABLED: applying this
-- migration sends nothing.
--
-- Also: an in-app notification to the sender when a message bounces or fails
-- for good, the timeline saying "automation" for a message nobody pressed Send
-- on, and the schedule the team's own notification emails never had.
--

--
-- Outbound email, automations (phase 3)
--

-- Mail the CRM sends by itself, as RULES an administrator switches on -- one
-- row per rule, seeded `disabled`, so applying the migration sends nothing and
-- no automatic message is ever a surprise.
--
--   * `quote_accepted`: a confirmation to the customer when a quotation is
--     accepted (and its deal, if it has one, is in the stage acceptance moves
--     it to).
--   * `quote_followup`: a reminder `delay_days` after a quotation was sent by
--     mail and not answered, at most `max_sends` times per version.
--
-- `state` is three-valued on purpose. `disabled`: nothing is produced, and
-- what was already waiting is canceled. `paused`: nothing is produced and
-- nothing leaves, but what was waiting waits -- resuming sends it. `enabled`:
-- the rule runs.
--
-- The set of rules is the code's (`key` is checked): a rule is behaviour, and
-- a row nobody implemented would be a switch connected to nothing.
create table public.email_automations (
    key          text primary key
        check (key in ('quote_accepted', 'quote_followup')),
    state        text not null default 'disabled'
        check (state in ('disabled', 'paused', 'enabled')),
    -- Which template the rule sends, by key: the language is the one the
    -- quotation was last written to its customer in.
    template_key text not null,
    -- Only the follow-up waits.
    delay_days   integer check (delay_days is null or delay_days between 1 and 90),
    max_sends    integer not null default 1 check (max_sends between 1 and 3),
    updated_at   timestamp with time zone not null default now(),
    updated_by   bigint references public.sales(id) on delete set null,
    constraint email_automations_followup_delay
        check (key <> 'quote_followup' or delay_days is not null)
);

--
-- Automations (phase 3)
--

create or replace function public.email_automations_guard() returns trigger
    language plpgsql
    set search_path to ''
as $$
begin
    if new.key is distinct from old.key then
        raise exception 'the key of an email automation is fixed'
            using errcode = 'check_violation', detail = 'email_automation_locked';
    end if;
    if not exists (select 1 from public.email_templates t
                    where t.key = new.template_key and t.scope = 'quote') then
        raise exception 'unknown quotation template %', new.template_key
            using errcode = 'check_violation', detail = 'email_template_invalid';
    end if;
    new.updated_at := now();
    new.updated_by := public.current_sale_id();
    return new;
end;
$$;

-- Queue one automatic message about a quotation, once.
--
-- Internal, and the ONE writer of automatic mail. Returns what it did as a
-- word -- 'queued', or the reason nothing was queued -- so the sweep and the
-- tests can tell "not due" from "refused" from "already sent".
--
-- The text is the template's, unfilled: the dispatcher fills it from
-- `variables`, with the same function the compose dialog uses, so an automatic
-- message and a hand-written one format a total and a date identically.
create or replace function public.email_automation_enqueue(
    p_key        text,
    p_quote_id   bigint,
    p_version_id bigint,
    p_to_email   text,
    p_to_name    text,
    p_step       integer,
    p_language   text default null,
    p_variables  jsonb default null
) returns text
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_rule      public.email_automations;
    v_settings  public.email_settings;
    v_quote     public.quotes;
    v_template  public.email_templates;
    v_owner     public.sales;
    v_email     text := lower(btrim(coalesce(p_to_email, '')));
    v_name      text := nullif(btrim(coalesce(p_to_name, '')), '');
    v_language  text := coalesce(nullif(btrim(p_language), ''), 'es');
    v_variables jsonb;
    v_id        bigint;
begin
    select * into v_rule from public.email_automations a where a.key = p_key;
    if not found or v_rule.state <> 'enabled' then
        return 'rule_not_enabled';
    end if;

    select * into v_settings from public.email_settings s where s.id = 1;
    if not found or not v_settings.is_enabled then
        return 'email_disabled';
    end if;

    select * into v_quote from public.quotes q where q.id = p_quote_id;
    if not found then
        return 'quote_not_found';
    end if;

    if not public.is_valid_email(v_email) then
        return 'no_recipient';
    end if;
    if public.email_is_suppressed(v_email) then
        return 'recipient_suppressed';
    end if;
    if v_name is not null and (char_length(v_name) > 120 or v_name ~ '[[:cntrl:]"<>]') then
        v_name := null;
    end if;

    -- The same ceiling a person is held to: an automation is not a way to
    -- write to somebody more often than the team may.
    perform pg_advisory_xact_lock(hashtextextended('email:to:' || v_email, 0));
    if (select count(*) from public.email_messages m
         where m.to_email = v_email
           and m.created_at > now() - interval '1 day'
           and m.status not in ('canceled', 'failed')) >= v_settings.max_per_recipient_day then
        return 'rate_limited';
    end if;

    select * into v_template
      from public.email_templates t
     where t.key = v_rule.template_key and t.scope = 'quote' and t.is_active
     order by (t.language = v_language) desc, t.language
     limit 1;
    if not found then
        return 'no_template';
    end if;

    -- Signed by the quotation's owner: there is no "current user" in a sweep.
    select * into v_owner from public.sales s where s.id = v_quote.sales_id;
    v_variables := coalesce(p_variables,
                            public.email_entity_variables('quote', p_quote_id, p_version_id))
        || jsonb_build_object(
               'sender_name', coalesce(
                   nullif(btrim(concat_ws(' ', v_owner.first_name, v_owner.last_name)), ''), ''),
               'sender_email', coalesce(v_owner.email::text, ''));

    insert into public.email_messages
        (sales_id, origin, automation_key, category, language, to_email, to_name,
         subject, body_text, template_id, template_key, variables,
         entity_type, entity_id, quote_id, quote_version_id,
         idempotency_key, dedupe_key)
    values
        (v_quote.sales_id, 'automation', p_key, v_template.category,
         v_template.language, v_email, v_name,
         v_template.subject, v_template.body, v_template.id, v_template.key,
         v_variables, 'quote', p_quote_id, p_quote_id, p_version_id,
         gen_random_uuid(),
         -- "This rule, this version, this step, once."
         format('auto:%s:%s:%s', p_key, p_version_id, p_step))
    on conflict (dedupe_key) do nothing
    returning id into v_id;

    return case when v_id is null then 'already_sent' else 'queued' end;
end;
$$;

-- The confirmation of an acceptance.
--
-- To the address the customer signed with, or the document's contact. When the
-- quotation was raised against a deal and the pipeline has a rule for
-- "accepted", the confirmation waits for the deal to BE in that stage: a
-- customer is not congratulated on a sale the pipeline has not recorded.
create or replace function public.email_automation_quote_accepted(p_quote_id bigint)
returns text
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote   public.quotes;
    v_version public.quote_versions;
    v_stage   text;
    v_last    public.email_messages;
begin
    select * into v_quote from public.quotes q where q.id = p_quote_id;
    if not found or v_quote.status_key <> 'accepted' then
        return 'not_accepted';
    end if;

    select * into v_version
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.accepted_at is not null
     order by v.version_number desc
     limit 1;
    if not found then
        return 'not_accepted';
    end if;

    if v_quote.deal_id is not null then
        select r.to_stage into v_stage
          from public.deal_quote_stage_rules r where r.trigger_key = 'accepted';
        if v_stage is not null and not exists (
            select 1 from public.deals d
             where d.id = v_quote.deal_id and d.stage = v_stage) then
            return 'deal_not_won';
        end if;
    end if;

    -- The language, and the date as the sender read it, of what the customer
    -- was last sent about this version.
    select * into v_last
      from public.email_messages m
     where m.quote_version_id = v_version.id and m.origin = 'manual'
     order by m.created_at desc
     limit 1;

    return public.email_automation_enqueue(
        'quote_accepted', p_quote_id, v_version.id,
        coalesce(v_version.accepted_by_email::text,
                 v_version.party_snapshot -> 'contact' ->> 'email'),
        coalesce(v_version.accepted_by_name,
                 nullif(btrim(concat_ws(' ',
                     v_version.party_snapshot -> 'contact' ->> 'first_name',
                     v_version.party_snapshot -> 'contact' ->> 'last_name')), '')),
        1, v_last.language, v_last.variables);
end;
$$;

-- An acceptance happens in the CUSTOMER's transaction (`quote_portal_accept`).
-- Whatever goes wrong with a courtesy email must never undo it: the failure
-- becomes a warning, the acceptance stands.
--
-- On the VERSION, not on the quotation: `quote_portal_accept()` moves the
-- status first and stamps `accepted_at` after, so a trigger on
-- `quotes.status_key` would look for an accepted version before one exists.
-- By the time the stamp lands the deal has already been moved too.
create or replace function public.quote_versions_email_automation() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    begin
        perform public.email_automation_quote_accepted(new.quote_id);
    exception when others then
        raise warning 'acceptance confirmation for quote % not queued: %',
            new.quote_id, sqlerrm;
    end;
    return null;
end;
$$;

-- The follow-up sweep (hourly).
--
-- A reminder goes ONLY to an address somebody already sent this version to, and
-- counts its days from that message -- so nobody is written to who was not
-- chosen by a person first. Before queueing it checks, again, everything a
-- person's send checks: the version is still the live offer
-- (`email_quote_share_block()`), the customer has not answered or started
-- negotiating, the address is not suppressed, the step was not already sent.
create or replace function public.email_automation_followups() returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_rule      public.email_automations;
    v_candidate record;
    v_sent      integer;
    v_queued    integer := 0;
begin
    select * into v_rule from public.email_automations a where a.key = 'quote_followup';
    if not found or v_rule.state <> 'enabled' then
        return 0;
    end if;

    for v_candidate in
        select distinct on (m.quote_version_id)
               m.quote_id, m.quote_version_id, m.to_email::text as to_email,
               m.to_name, m.created_at, m.language, m.variables
          from public.email_messages m
          join public.quotes q on q.id = m.quote_id
         where m.origin = 'manual'
           and m.quote_version_id is not null
           and m.status in ('accepted', 'delivered', 'simulated')
           -- Waiting for an answer: not answered, not being negotiated.
           and q.status_key in ('sent', 'viewed', 'under_review')
         order by m.quote_version_id, m.created_at desc
    loop
        if public.email_quote_share_block(v_candidate.quote_id, v_candidate.quote_version_id)
               is not null then
            continue;
        end if;

        select count(*) into v_sent
          from public.email_messages a
         where a.origin = 'automation'
           and a.automation_key = 'quote_followup'
           and a.quote_version_id = v_candidate.quote_version_id;

        if v_sent >= v_rule.max_sends
           or now() < v_candidate.created_at
                      + make_interval(days => (v_sent + 1) * v_rule.delay_days) then
            continue;
        end if;

        if public.email_automation_enqueue(
               'quote_followup', v_candidate.quote_id, v_candidate.quote_version_id,
               v_candidate.to_email, v_candidate.to_name, v_sent + 1,
               v_candidate.language, v_candidate.variables) = 'queued' then
            v_queued := v_queued + 1;
        end if;
    end loop;

    return v_queued;
end;
$$;

-- A message that bounced or failed for good is news for whoever sent it: one
-- in-app notification, on the record the message was written from. The
-- database writes the KEY and its parameters, never a sentence
-- (`notificationText.ts` renders them in the reader's language).
--
-- The body is the message's subject -- data, not a sentence. An automation's
-- subject is still its template (the dispatcher fills it), so for those the
-- body is the quotation's number instead: nobody is shown `{{braces}}`.
create or replace function public.email_messages_notify() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if new.status not in ('bounced', 'failed')
       or new.status is not distinct from old.status
       or new.sales_id is null
       or new.entity_type is null then
        return null;
    end if;

    begin
        insert into public.task_notifications (
            task_id, entity_type, entity_id, recipient_id, channel,
            scheduled_for, title, body, message_key, message_params,
            dedupe_key, status, sent_at, delivered_at)
        select null, new.entity_type, new.entity_id, s.id, 'in_app',
               now(),
               format('An email to %s %s', new.to_email,
                      case new.status when 'bounced' then 'bounced' else 'could not be sent' end),
               case when new.origin = 'automation'
                    then new.variables ->> 'quote_number'
                    else new.subject end,
               'crm.notifications.email.' || new.status,
               jsonb_build_object('to', new.to_email),
               format('email:%s:%s', new.id, new.status),
               'delivered', now(), now()
          from public.sales s
         where s.id = new.sales_id and s.disabled is not true
        on conflict (dedupe_key) do nothing;
    exception when others then
        -- A notification is a courtesy; the delivery record is the fact.
        raise warning 'email % status notification not written: %', new.id, sqlerrm;
    end;
    return null;
end;
$$;

-- The scheduled tick of the team's own notification emails
-- (`task-notification-worker`), which nothing called until now: posts to the
-- worker with the URL and key held in Vault (`task_worker_url`,
-- `task_worker_service_key`). A no-op until both exist, and when nothing waits.
create or replace function public.task_notification_worker_tick() returns bigint
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_url text;
    v_key text;
begin
    if not exists (select 1 from public.task_notifications n
                    where n.status = 'queued'
                      and n.channel <> 'in_app'
                      and n.scheduled_for <= now()) then
        return null;
    end if;

    select d.decrypted_secret into v_url
      from vault.decrypted_secrets d where d.name = 'task_worker_url';
    select d.decrypted_secret into v_key
      from vault.decrypted_secrets d where d.name = 'task_worker_service_key';
    if v_url is null or v_key is null then
        return null;
    end if;

    return net.http_post(
        url                  := v_url,
        body                 := jsonb_build_object('trigger', 'cron'),
        headers              := jsonb_build_object(
                                    'Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
        timeout_milliseconds := 60000);
end;
$$;

--
-- The dispatcher's claim, redefined: a paused rule's messages wait, a
-- disabled rule's are canceled, and a confirmation is not asked whether its
-- version can still be answered.
--
-- Claim what is due, or one message by id (the sender's own press of "Send",
-- which should not wait for the next tick).
--
-- Each row comes back as everything the dispatcher needs and nothing it does
-- not: the sender identity is resolved here, from the settings, so the
-- function holding the provider key never chooses a From address itself.
create or replace function public.claim_email_messages(
    p_limit      integer default 20,
    p_message_id bigint default null
) returns setof jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_settings public.email_settings;
    v_row      public.email_messages;
    v_block    text;
    v_state    text;
    v_sender   public.sales;
    v_issuer   text;
    v_logo     text;
begin
    select * into v_settings from public.email_settings s where s.id = 1;
    if not found or not v_settings.is_enabled
       or (v_settings.provider_key <> 'mock'
           and (v_settings.from_email is null
                or v_settings.credentials_secret_id is null)) then
        -- Left pending: switching the provider back on sends them.
        return;
    end if;

    select nullif(btrim(c.config ->> 'title'), ''),
           nullif(case jsonb_typeof(c.config -> 'lightModeLogo')
                      when 'string' then c.config ->> 'lightModeLogo'
                      when 'object' then c.config -> 'lightModeLogo' ->> 'src'
                  end, '')
      into v_issuer, v_logo
      from public.configuration c where c.id = 1;

    for v_row in
        select m.*
          from public.email_messages m
         where m.status = 'pending'
           and m.scheduled_for <= now()
           and (p_message_id is null or m.id = p_message_id)
           -- A paused rule's messages wait where they are. Excluded here,
           -- not skipped in the loop: skipped rows would fill the LIMIT
           -- and starve everything behind them.
           and not exists (select 1 from public.email_automations a
                            where a.key = m.automation_key and a.state = 'paused')
         order by m.scheduled_for, m.id
         limit greatest(1, least(coalesce(p_limit, 20), 100))
           for update skip locked
    loop
        -- A rule switched off after it queued a message takes the message
        -- with it.
        if v_row.origin = 'automation' then
            select a.state into v_state
              from public.email_automations a where a.key = v_row.automation_key;
            if v_state is distinct from 'enabled' then
                update public.email_messages
                   set status = 'canceled', error_code = 'email_automation_disabled',
                       error = 'the automation was switched off'
                 where id = v_row.id;
                continue;
            end if;
        end if;

        -- A confirmation is about an acceptance that must still stand.
        if v_row.automation_key = 'quote_accepted' and not exists (
            select 1 from public.quote_versions v
             where v.id = v_row.quote_version_id and v.accepted_at is not null) then
            update public.email_messages
               set status = 'canceled', error_code = 'email_quote_not_shareable',
                   error = 'quote_not_accepted'
             where id = v_row.id;
            continue;
        end if;

        -- Between the press of "Send" and now the quotation may have been
        -- revised, answered or closed. Then the message does not leave.
        -- (Not asked of a confirmation: its version IS answered.)
        if v_row.quote_version_id is not null
           and v_row.automation_key is distinct from 'quote_accepted' then
            v_block := public.email_quote_share_block(v_row.quote_id, v_row.quote_version_id);
            if v_block is not null then
                update public.email_messages
                   set status = 'canceled', error_code = 'email_quote_not_shareable',
                       error = v_block
                 where id = v_row.id;
                continue;
            end if;
        end if;

        -- The address may have bounced since the message was queued.
        if public.email_is_suppressed(v_row.to_email::text) then
            update public.email_messages
               set status = 'canceled', error_code = 'email_recipient_suppressed',
                   error = 'the address is on the suppression list'
             where id = v_row.id;
            continue;
        end if;

        update public.email_messages
           set status = 'processing', attempt = attempt + 1, claimed_at = now(),
               provider_key = v_settings.provider_key
         where id = v_row.id
        returning * into v_row;

        v_sender := null;
        select * into v_sender from public.sales s where s.id = v_row.sales_id;

        return next jsonb_build_object(
            'id',               v_row.id,
            'attempt',          v_row.attempt,
            'provider_key',     v_row.provider_key,
            'category',         v_row.category,
            'language',         v_row.language,
            'to_email',         v_row.to_email,
            'to_name',          v_row.to_name,
            'subject',          v_row.subject,
            'body_text',        v_row.body_text,
            'variables',        v_row.variables,
            'quote_id',         v_row.quote_id,
            'quote_version_id', v_row.quote_version_id,
            'from_email',       v_settings.from_email,
            'from_name',        coalesce(v_settings.from_name, v_issuer),
            'reply_to',         case when v_settings.reply_to_mode = 'sender'
                                     then v_sender.email::text end,
            'message_stream',   case when v_row.category = 'commercial'
                                     then v_settings.commercial_stream
                                     else v_settings.transactional_stream end,
            'issuer_name',      v_issuer,
            'logo_url',         v_logo);
    end loop;
end;
$$;

--
-- Outbound email, automations (phase 3)
--
create or replace trigger email_automations_guard
    before update on public.email_automations
    for each row execute function public.email_automations_guard();

-- When the acceptance is STAMPED on the version, which is after the status
-- moved and `quotes_sync_deal` moved the deal: the confirmation looks at both.
create or replace trigger quote_versions_email_automation
    after update of accepted_at on public.quote_versions
    for each row
    when (new.accepted_at is not null and old.accepted_at is null)
    execute function public.quote_versions_email_automation();

create or replace trigger email_messages_notify
    after update of status on public.email_messages
    for each row execute function public.email_messages_notify();

--
-- Outbound email, automations (phase 3)
--
-- What the CRM sends by itself is read by managers and switched by
-- administrators. No insert or delete policy: the rules are seeded.
alter table public.email_automations enable row level security;

create policy "Email automations are readable by managers"
    on public.email_automations for select to authenticated
    using ((select public.can_manage_all()));

create policy "Email automations can be updated by admins"
    on public.email_automations for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

--
-- The timeline, with the automation actor.
--
create or replace view public.timeline_events with (security_invoker = on) as
select
    'task_event:' || e.id            as id,
    e.occurred_at                    as occurred_at,
    e.event_type::text               as event_type,
    'task'                           as source,
    e.task_id                        as task_id,
    e.actor_sales_id                 as actor_sales_id,
    e.actor_kind                     as actor_kind,
    -- The entity the event hangs off, so a contact or deal page can filter
    -- without joining task_links itself.
    pl.entity_type::text             as entity_type,
    pl.entity_id                     as entity_id,
    jsonb_build_object('field', e.field, 'old', e.old_value,
                       'new', e.new_value, 'meta', e.metadata,
                       'note', e.note)  as payload
from public.task_events e
    left join lateral (
        select l.entity_type, l.entity_id
        from public.task_links l
        where l.task_id = e.task_id
          and l.is_primary
          and l.unlinked_at is null
        limit 1
    ) pl on true

union all

select
    'contact_note:' || n.id, n.date, 'note.created', 'contact_note',
    null::bigint, n.sales_id, 'user',
    'contact', n.contact_id,
    jsonb_build_object('text', n.text, 'status', n.status,
                       'contact_id', n.contact_id)
from public.contact_notes n

union all

select
    'deal_note:' || dn.id, dn.date, 'note.created', 'deal_note',
    null::bigint, dn.sales_id, 'user',
    'deal', dn.deal_id,
    jsonb_build_object('text', dn.text, 'deal_id', dn.deal_id)
from public.deal_notes dn

union all

-- Stage transitions. The one event on this timeline the user did not write as
-- prose: the reason and the files travel in the payload so the deal page can
-- render "why" next to "when", without a second query per row.
select
    'deal_stage_change:' || sc.id, sc.changed_at, 'deal.stage_changed',
    'deal_stage_change',
    null::bigint, sc.sales_id,
    -- A quotation's event moved it with nobody signed in (the customer, the
    -- sweeper): the system acted, not a user.
    case when sc.source = 'quote' and sc.sales_id is null then 'system' else 'user' end,
    'deal', sc.deal_id,
    jsonb_build_object('from_stage', sc.from_stage, 'to_stage', sc.to_stage,
                       'reason', sc.reason, 'deal_id', sc.deal_id,
                       'attachments', to_jsonb(sc.attachments),
                       'override_reason', sc.override_reason,
                       'source', sc.source, 'quote_id', sc.quote_id,
                       'quote_number', sq.quote_number)
from public.deal_stage_changes sc
    left join public.quotes sq on sq.id = sc.quote_id

union all

-- Quote transitions, surfaced on the DEAL the quote was raised against, so the
-- deal page tells the whole commercial story without a second query per row.
-- Only quotes that still have a deal: `quotes.deal_id` is `on delete set null`.
--
-- The three quote arms take this view from four to seven, which is what makes
-- the materialized `timeline` table named in the caveat above due. They are the
-- cheapest kind -- small tables, indexed on `(quote_id, … desc)` -- and every
-- filter stays on plain columns.
select
    'quote_status_change:deal:' || sc.id, sc.changed_at, 'quote.status_changed',
    'quote_status_change',
    null::bigint, sc.sales_id,
    -- 'system' rather than inventing a 'customer' value, so the switch in
    -- `timeline/EntityTimeline.tsx` cannot fall through. Who acted lives in
    -- `payload.actor_kind`.
    case when sc.actor_kind = 'internal' then 'user' else 'system' end,
    'deal', q.deal_id,
    jsonb_build_object('quote_id', sc.quote_id, 'quote_number', q.quote_number,
                       'from_status', sc.from_status, 'to_status', sc.to_status,
                       'reason', sc.reason, 'actor_kind', sc.actor_kind,
                       'override_reason', sc.override_reason)
from public.quote_status_changes sc
    join public.quotes q on q.id = sc.quote_id
where q.deal_id is not null

union all

-- The same transitions, on the quote itself.
select
    'quote_status_change:' || sc.id, sc.changed_at, 'quote.status_changed',
    'quote_status_change',
    null::bigint, sc.sales_id,
    case when sc.actor_kind = 'internal' then 'user' else 'system' end,
    'quote', sc.quote_id,
    jsonb_build_object('quote_id', sc.quote_id, 'quote_number', q.quote_number,
                       'from_status', sc.from_status, 'to_status', sc.to_status,
                       'reason', sc.reason, 'actor_kind', sc.actor_kind,
                       'attachments', to_jsonb(sc.attachments),
                       'override_reason', sc.override_reason)
from public.quote_status_changes sc
    join public.quotes q on q.id = sc.quote_id

union all

-- What the customer did on the portal. `ip_address` and `user_agent` are
-- deliberately absent from the payload: they belong in the audit table, not on
-- a screen a whole sales team reads.
select
    'quote_portal_event:' || e.id, e.occurred_at, 'quote.' || e.event_type,
    'quote_portal_event',
    null::bigint, null::bigint, 'system',
    'quote', e.quote_id,
    jsonb_build_object('quote_id', e.quote_id, 'version_id', e.version_id,
                       'actor_name', e.actor_name, 'detail', e.payload)
from public.quote_portal_events e

union all

-- The customer writing back, on the DEAL too: it is what moves a deal into
-- negotiation, so its history must say so. Only comments: a view and an
-- answer already reach the deal as the status change they caused, and the
-- same event twice on one timeline is noise.
select
    'quote_portal_event:deal:' || e.id, e.occurred_at, 'quote.' || e.event_type,
    'quote_portal_event',
    null::bigint, null::bigint, 'system',
    'deal', q.deal_id,
    jsonb_build_object('quote_id', e.quote_id, 'quote_number', q.quote_number,
                       'version_id', e.version_id,
                       'actor_name', e.actor_name, 'detail', e.payload)
from public.quote_portal_events e
    join public.quotes q on q.id = e.quote_id
where q.deal_id is not null
  and e.event_type = 'commented'

union all

-- A message sent to a customer, on the record it was written from. One event
-- per message whatever became of it: how the delivery went travels in the
-- payload, so a failed send is on the timeline too instead of looking like
-- nothing was tried. No address book detail beyond the recipient, and never
-- the text -- the message itself is opened from the event.
select
    'email_message:' || m.id, m.created_at, 'email.message',
    'email_message',
    null::bigint, m.sales_id,
    -- An automatic message is signed by the quotation's owner, and was sent
    -- by nobody: the timeline says which.
    case when m.origin = 'automation' then 'automation' else 'user' end,
    m.entity_type::text, m.entity_id,
    jsonb_build_object('message_id', m.id, 'to_email', m.to_email,
                       'to_name', m.to_name, 'subject', m.subject,
                       'status', m.status, 'error_code', m.error_code,
                       'quote_id', m.quote_id,
                       'quote_version_id', m.quote_version_id,
                       -- An automation's subject is its template: what the
                       -- client fills it with travels beside it.
                       'origin', m.origin, 'language', m.language,
                       'variables', case when m.origin = 'automation'
                                         then m.variables end)
from public.email_messages m
where m.entity_type is not null

union all

-- A quotation sent by mail, on the DEAL it was raised against: it is the step
-- of the deal's story between "quoted" and "the customer opened it".
select
    'email_message:deal:' || m.id, m.created_at, 'email.message',
    'email_message',
    null::bigint, m.sales_id,
    -- An automatic message is signed by the quotation's owner, and was sent
    -- by nobody: the timeline says which.
    case when m.origin = 'automation' then 'automation' else 'user' end,
    'deal', q.deal_id,
    jsonb_build_object('message_id', m.id, 'to_email', m.to_email,
                       'to_name', m.to_name, 'subject', m.subject,
                       'status', m.status, 'error_code', m.error_code,
                       'quote_id', m.quote_id, 'quote_number', q.quote_number,
                       'quote_version_id', m.quote_version_id,
                       'origin', m.origin, 'language', m.language,
                       'variables', case when m.origin = 'automation'
                                         then m.variables end)
from public.email_messages m
    join public.quotes q on q.id = m.quote_id
where q.deal_id is not null;

--
-- Outbound email, automations (phase 3). No `anon` grant.
--
revoke all on table public.email_automations from anon, authenticated;
grant select, update on table public.email_automations to authenticated;
grant all on table public.email_automations to service_role;

revoke all on function public.email_automation_enqueue(text, bigint, bigint, text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.email_automation_quote_accepted(bigint) from public, anon, authenticated;
revoke all on function public.email_automation_followups() from public, anon, authenticated;
revoke all on function public.task_notification_worker_tick() from public, anon, authenticated;
revoke all on function public.quote_versions_email_automation() from public, anon, authenticated;
revoke all on function public.email_messages_notify() from public, anon, authenticated;
grant execute on function public.email_automation_enqueue(text, bigint, bigint, text, text, integer, text, jsonb) to service_role;
grant execute on function public.email_automation_quote_accepted(bigint) to service_role;
grant execute on function public.email_automation_followups() to service_role;
grant execute on function public.task_notification_worker_tick() to service_role;

--
-- First content: the two templates the rules send, and the rules themselves --
-- DISABLED. Nothing is sent automatically until an administrator enables one.
--
select set_config('app.email_system_write', 'on', false);

insert into public.email_templates
    (key, name, subject, body, scope, category, language, is_system)
values
  ('quote_accepted', 'Confirmación de aceptación',
   'Confirmación de aceptación: cotización {{quote_number}}',
   E'Estimado/a {{customer_name}}:\n\n'
   || E'Hemos recibido su aceptación de la cotización {{quote_number}}, por un total de {{total}} {{currency}}. Gracias por su confianza.\n\n'
   || E'Puede consultar el documento aceptado en el siguiente enlace:\n{{quote_link}}\n\n'
   || E'Nos pondremos en contacto para coordinar los siguientes pasos.\n\n'
   || E'{{sender_name}}\n{{issuer_name}}',
   'quote', 'transactional', 'es', true),
  ('quote_accepted', 'Acceptance confirmation',
   'Acceptance confirmed: quotation {{quote_number}}',
   E'Dear {{customer_name}},\n\n'
   || E'We have received your acceptance of quotation {{quote_number}}, for a total of {{total}} {{currency}}. Thank you for your trust.\n\n'
   || E'You can review the accepted document here:\n{{quote_link}}\n\n'
   || E'We will be in touch to arrange the next steps.\n\n'
   || E'{{sender_name}}\n{{issuer_name}}',
   'quote', 'transactional', 'en', true),
  ('quote_followup', 'Seguimiento de cotización',
   'Recordatorio: cotización {{quote_number}} de {{issuer_name}}',
   E'Estimado/a {{customer_name}}:\n\n'
   || E'Le escribimos para dar seguimiento a la cotización {{quote_number}}, emitida el {{issue_date}}, por un total de {{total}} {{currency}}.\n\n'
   || E'Puede consultarla y responderla en el siguiente enlace:\n{{quote_link}}\n\n'
   || E'Quedamos atentos a cualquier inquietud.\n\n'
   || E'{{sender_name}}\n{{issuer_name}}',
   'quote', 'commercial', 'es', true),
  ('quote_followup', 'Quotation follow-up',
   'Reminder: quotation {{quote_number}} from {{issuer_name}}',
   E'Dear {{customer_name}},\n\n'
   || E'We are following up on quotation {{quote_number}}, issued on {{issue_date}}, for a total of {{total}} {{currency}}.\n\n'
   || E'You can review it and answer it here:\n{{quote_link}}\n\n'
   || E'We remain at your disposal for any question.\n\n'
   || E'{{sender_name}}\n{{issuer_name}}',
   'quote', 'commercial', 'en', true)
on conflict (key, language) do nothing;

select set_config('app.email_system_write', '', false);

insert into public.email_automations (key, state, template_key, delay_days, max_sends)
values
  ('quote_accepted', 'disabled', 'quote_accepted', null, 1),
  ('quote_followup', 'disabled', 'quote_followup', 5, 1)
on conflict (key) do nothing;

--
-- The schedules. The follow-up sweep runs hourly and does nothing while its
-- rule is not enabled. The team's notification emails are finally dispatched:
-- every five minutes, and a no-op until the two Vault secrets
-- (`task_worker_url`, `task_worker_service_key`) exist. Not in
-- `supabase/schemas/` (a row in `cron.job` is cluster state).
--
do $$
begin
    create extension if not exists pg_cron;

    perform cron.unschedule('email-automation-followups')
      where exists (select 1 from cron.job where jobname = 'email-automation-followups');
    perform cron.schedule(
        'email-automation-followups',
        '7 * * * *',
        $cron$select public.email_automation_followups();$cron$);

    perform cron.unschedule('task-notification-worker')
      where exists (select 1 from cron.job where jobname = 'task-notification-worker');
    perform cron.schedule(
        'task-notification-worker',
        '*/5 * * * *',
        $cron$select public.task_notification_worker_tick();$cron$);
exception
    when others then
        raise warning
            'pg_cron unavailable (%): no automatic follow-up, and notification emails are sent only by hand',
            sqlerrm;
end;
$$;
