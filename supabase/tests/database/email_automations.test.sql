--
-- Outbound email: what the CRM sends by itself
-- (docs/proposals/outbound-email.md).
--
--   * the rules are read by managers, switched by administrators, and nobody
--     adds, removes or re-keys one;
--   * a rule that is switched off writes to nobody;
--   * the acceptance confirmation: once, to the address the customer signed
--     with, in the language the quotation was last written in, signed by the
--     quotation's owner, only when the pipeline recorded the sale -- and
--     whatever goes wrong with it, the acceptance stands;
--   * the follow-up: only to an address a person already sent that version
--     to, not before its delay, not more often than the rule says, and never
--     once the customer answered, the quotation is being revised, the offer
--     lapsed or the address is suppressed;
--   * the outbox: a confirmation leaves although its version is answered, a
--     paused rule's message waits without holding up the queue behind it, a
--     disabled rule's message is canceled;
--   * a message that bounced or failed for good is told to whoever signed it,
--     once, with no template braces in what they read;
--   * the timeline says a message was sent by an automation.
--
begin;

select plan(66);

create function public.email_test_error_of(p_sql text) returns text
    language plpgsql
as $$
declare
    v_detail text;
begin
    execute p_sql;
    return 'no error';
exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    return sqlstate || coalesce(':' || nullif(v_detail, ''), '');
end;
$$;

-- Who is signed in, for the functions that ask (`auth.uid()`).
create function public.email_test_as(p_user text) returns void
    language sql
as $$
    select set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Nobody is signed in: the customer on the portal, the scheduler.
create function public.email_test_as_nobody() returns void
    language sql
as $$
    select set_config('request.jwt.claims', '', true);
$$;

create function public.email_test_hash_of(p_quote_id bigint) returns bytea
    language sql stable
as $$
    select sha256(decode(
        current_setting('email_test.q' || p_quote_id)::jsonb ->> 'token', 'hex'));
$$;

create function public.email_test_v1(p_quote_id bigint) returns bigint
    language sql stable
as $$
    select v.id from public.quote_versions v
     where v.quote_id = p_quote_id and v.version_number = 1;
$$;

-- A person shares a quotation's first version, the (simulated) provider takes
-- it, and that happened `p_days` ago.
create function public.email_test_sent(
    p_quote_id bigint, p_to text, p_days integer, p_language text default null
) returns bigint
    language plpgsql
as $$
declare
    v_id bigint;
begin
    perform public.email_test_as('98910000-0000-0000-0000-000000000001');
    v_id := (public.queue_quote_email(
                 p_quote_id, public.email_test_v1(p_quote_id), p_to,
                 'Cotizacion', 'Hola: {{quote_link}}', gen_random_uuid(),
                 p_language => p_language)).id;
    perform count(*) from public.claim_email_messages(1, v_id);
    perform public.complete_email_message(v_id, 'simulated');
    perform public.email_test_age(v_id, p_days);
    perform public.email_test_as_nobody();
    return v_id;
end;
$$;

-- `created_at` is frozen; the retention hatch is the one way to move a clock
-- a test cannot wait for.
create function public.email_test_age(p_message_id bigint, p_days integer) returns void
    language plpgsql
as $$
begin
    perform set_config('app.quote_purge', 'on', true);
    update public.email_messages
       set created_at = now() - make_interval(days => p_days)
     where id = p_message_id;
    perform set_config('app.quote_purge', '', true);
end;
$$;

create function public.email_test_auto_count(p_key text, p_quote_id bigint) returns integer
    language sql stable
as $$
    select count(*)::int from public.email_messages m
     where m.origin = 'automation' and m.automation_key = p_key
       and m.quote_id = p_quote_id;
$$;

-- An insert that blows up for one address: the way to prove a broken
-- confirmation cannot undo an acceptance.
create function public.email_test_boom() returns trigger
    language plpgsql
as $$
begin
    if new.to_email = 'boom@cliente-auto.test' then
        raise exception 'boom';
    end if;
    return new;
end;
$$;
create trigger aaa_email_test_boom before insert on public.email_messages
    for each row execute function public.email_test_boom();

insert into auth.users (id, email, raw_user_meta_data) values
  ('98910000-0000-0000-0000-000000000001', 'automation.owner@test.local',   '{"first_name":"Olga","last_name":"Owner"}'::jsonb),
  ('98910000-0000-0000-0000-000000000002', 'automation.other@test.local',   '{"first_name":"Otto","last_name":"Otro"}'::jsonb),
  ('98910000-0000-0000-0000-000000000004', 'automation.manager@test.local', '{"first_name":"Marta","last_name":"Manager"}'::jsonb),
  ('98910000-0000-0000-0000-000000000005', 'automation.admin@test.local',   '{"first_name":"Ada","last_name":"Admin"}'::jsonb);

update public.sales set id = 9891, role = 'rep'     where user_id = '98910000-0000-0000-0000-000000000001';
update public.sales set id = 9892, role = 'rep'     where user_id = '98910000-0000-0000-0000-000000000002';
update public.sales set id = 9894, role = 'manager' where user_id = '98910000-0000-0000-0000-000000000004';
update public.sales set id = 9895, role = 'admin'   where user_id = '98910000-0000-0000-0000-000000000005';

-- Whatever the local database holds: the simulated provider with room to
-- send, both rules off, the pipeline rules as seeded, and nothing else
-- waiting in the outbox ahead of what these tests queue.
update public.email_settings
   set provider_key = 'mock', is_enabled = true,
       max_per_user_hour = 1000, max_per_recipient_day = 100
 where id = 1;
update public.email_automations
   set state = 'disabled', max_sends = 1,
       delay_days = case key when 'quote_followup' then 5 end,
       template_key = key
 where key in ('quote_accepted', 'quote_followup');
update public.email_messages set scheduled_for = now() + interval '1 day'
 where status = 'pending';
delete from public.deal_quote_stage_rules where trigger_key is not null;
insert into public.deal_quote_stage_rules (trigger_key, to_stage, closes, only_if_no_open_quote) values
    ('sent', 'proposal-sent', false, false), ('viewed', 'proposal-sent', false, false),
    ('negotiating', 'in-negociation', false, false), ('commented', 'in-negociation', false, false),
    ('accepted', 'won', true, false), ('rejected', 'lost', true, true),
    ('expired', 'delayed', false, true);

insert into public.companies (id, name, sales_id, logo)
values (9891, 'Cliente Automatico', 9891, '{}'::jsonb);

insert into public.contacts (id, first_name, last_name, company_id, sales_id, email_jsonb) values
  (9891, 'Ana', 'Compras', 9891, 9891,
   '[{"email":"ana@cliente-auto.test","type":"Work"}]'::jsonb),
  (9892, 'Beto', 'Finanzas', 9891, 9891,
   '[{"email":"beto@cliente-auto.test","type":"Work"}]'::jsonb),
  (9893, 'Caro', 'Legal', 9891, 9891,
   '[{"email":"caro@cliente-auto.test","type":"Work"}]'::jsonb);

-- 9891 is open; 9892 was closed by hand, which no quotation reopens.
insert into public.deals (id, name, stage, amount, sales_id, company_id, index) values
  (9891, 'Venta automatica', 'opportunity', 1, 9891, 9891, 0),
  (9892, 'Cerrada a mano',   'lost',        1, 9891, 9891, 1);

-- Acceptances -- 9891: with a deal. 9892: while the rule is off. 9893: no
-- deal. 9894: a deal the acceptance does not win. 9895: a confirmation that
-- blows up.
-- Follow-ups -- 9896: the one that is due. 9889: due, in the last sweep.
-- 9897: answered. 9898: being revised. 9899: lapsed. 9890: suppressed address.
-- 9888: under negotiation.
insert into public.quotes (id, company_id, contact_id, deal_id, sales_id, currency, valid_until) values
  (9891, 9891, 9891, 9891, 9891, 'COP', current_date + 10),
  (9892, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9893, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9894, 9891, 9891, 9892, 9891, 'COP', current_date + 10),
  (9895, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9896, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9888, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9889, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9897, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9898, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9899, 9891, 9891, null, 9891, 'COP', current_date + 10),
  (9890, 9891, 9891, null, 9891, 'COP', current_date + 10);

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Linea', 2, 150 from public.quote_versions v where v.quote_id between 9888 and 9899;

select public.email_test_as('98910000-0000-0000-0000-000000000001');
select set_config('email_test.q' || q.id, public.issue_quote_version(q.id)::text, true)
  from public.quotes q where q.id between 9888 and 9899 order by q.id;
select public.email_test_as_nobody();

--
-- 1. The rules: who reads them, who switches them
--
select is(
    (select string_agg(key || ':' || template_key, ',' order by key) from public.email_automations),
    'quote_accepted:quote_accepted,quote_followup:quote_followup',
    'there are two rules, each with the template it sends');

set local role authenticated;

select public.email_test_as('98910000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.email_automations), 0, 'a rep reads no rule');

select public.email_test_as('98910000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.email_automations), 2, 'a manager reads them');

update public.email_automations set state = 'enabled' where key = 'quote_followup';
select is(
    (select state from public.email_automations where key = 'quote_followup'),
    'disabled', 'but cannot switch one on');

select public.email_test_as('98910000-0000-0000-0000-000000000005');
update public.email_automations set state = 'paused', delay_days = 7 where key = 'quote_followup';
select is(
    (select row(state, delay_days, updated_by)::text
       from public.email_automations where key = 'quote_followup'),
    row('paused', 7, 9895::bigint)::text,
    'an administrator switches a rule, and is recorded as the one who did');

select is(
    public.email_test_error_of($sql$
        insert into public.email_automations (key, template_key)
        values ('quote_accepted', 'quote_accepted') $sql$),
    '42501', 'nobody adds a rule: a rule is behaviour, not a row');

select is(
    public.email_test_error_of($sql$
        delete from public.email_automations where key = 'quote_followup' $sql$),
    '42501', 'and nobody removes one');

select is(
    public.email_test_error_of($sql$
        update public.email_automations set key = 'quote_accepted'
         where key = 'quote_followup' $sql$),
    '23514:email_automation_locked', 'a rule cannot be re-keyed');

select is(
    public.email_test_error_of($sql$
        update public.email_automations set template_key = 'no_such_template'
         where key = 'quote_followup' $sql$),
    '23514:email_template_invalid', 'a rule cannot point at a template that does not exist');

select is(
    public.email_test_error_of($sql$
        update public.email_automations set delay_days = null
         where key = 'quote_followup' $sql$),
    '23514', 'a follow-up always has a delay');

select is(
    public.email_test_error_of($sql$ select public.email_automation_followups() $sql$),
    '42501', 'a signed-in user cannot run the sweep');

select is(
    public.email_test_error_of($sql$ select public.email_automation_quote_accepted(9891) $sql$),
    '42501', 'nor ask for a confirmation to be sent');

select is(
    public.email_test_error_of($sql$
        select public.email_automation_enqueue(
            'quote_accepted', 9891, 1, 'x@y.test', null, 1) $sql$),
    '42501', 'nor queue automatic mail to an address of their choosing');

reset role;
select public.email_test_as_nobody();
update public.email_automations set state = 'disabled', delay_days = 5 where key = 'quote_followup';

--
-- 2. A rule that is switched off writes to nobody
--
select public.quote_portal_accept(public.email_test_hash_of(9892),
    'Lucia Gomez', 'lucia@cliente-auto.test', '203.0.113.9', 'Test/1');

select is(
    (select status_key from public.quotes where id = 9892), 'accepted',
    'the customer accepts a quotation while the rule is off');

select is(
    (select count(*)::int from public.email_messages
      where quote_id = 9892 and origin = 'automation'),
    0, 'and nothing is written to them');

select is(
    public.email_automation_quote_accepted(9892), 'rule_not_enabled',
    'because the rule is not enabled');

--
-- 3. The acceptance confirmation
--
update public.email_automations set state = 'enabled' where key = 'quote_accepted';

-- The quotation was last written to its customer in English.
select public.email_test_sent(9891, 'ana@cliente-auto.test', 0, 'en');

select public.quote_portal_accept(public.email_test_hash_of(9891),
    'Lucia Gomez', 'Lucia@Cliente-Auto.test', '203.0.113.9', 'Test/1');

select is(
    (select stage from public.deals where id = 9891), 'won',
    'the acceptance wins the deal');

select is(
    public.email_test_auto_count('quote_accepted', 9891), 1,
    'and one confirmation is queued');

select set_config('email_test.c1',
    (select id::text from public.email_messages
      where quote_id = 9891 and automation_key = 'quote_accepted'), true);

select is(
    (select row(origin, status, to_email::text, to_name, sales_id, category,
                entity_type::text, entity_id, quote_version_id, dedupe_key)::text
       from public.email_messages where id = current_setting('email_test.c1')::bigint),
    row('automation', 'pending', 'lucia@cliente-auto.test', 'Lucia Gomez', 9891::bigint,
        'transactional', 'quote', 9891::bigint, public.email_test_v1(9891),
        format('auto:quote_accepted:%s:1', public.email_test_v1(9891)))::text,
    'to the address the customer signed with, about the version accepted, signed by the quotation''s owner');

select is(
    (select row(language, subject)::text
       from public.email_messages where id = current_setting('email_test.c1')::bigint),
    row('en', 'Acceptance confirmed: quotation {{quote_number}}')::text,
    'in the language the quotation was last written in, as the template the dispatcher fills');

select is(
    (select row(variables ->> 'quote_number', variables ->> 'sender_name',
                variables ->> 'sender_email', (variables ->> 'total')::numeric)::text
       from public.email_messages where id = current_setting('email_test.c1')::bigint),
    (select row(q.quote_number, 'Olga Owner', 'automation.owner@test.local', v.total)::text
       from public.quotes q join public.quote_versions v on v.quote_id = q.id
      where q.id = 9891 and v.version_number = 1),
    'carrying what fills it: the issued figures, and the owner as the sender');

select is(
    (select position(t.token in m::text)
       from public.email_messages m, public.quote_access_tokens t
      where m.id = current_setting('email_test.c1')::bigint
        and t.quote_id = 9891 and t.token is not null),
    0, 'the customer link is not stored in it');

select is(
    public.email_automation_quote_accepted(9891), 'already_sent',
    'asking again says it was already sent');

select is(
    public.email_test_auto_count('quote_accepted', 9891), 1,
    'and queues no second confirmation');

-- No deal, and nobody ever wrote to this customer by mail.
select public.quote_portal_accept(public.email_test_hash_of(9893),
    'Pedro Perez', 'pedro@cliente-auto.test', '203.0.113.9', 'Test/1');

select is(
    (select row(to_email::text, language, variables ->> 'customer_name',
                variables ->> 'issue_date' is not null)::text
       from public.email_messages
      where quote_id = 9893 and automation_key = 'quote_accepted'),
    row('pedro@cliente-auto.test', 'es', 'Ana Compras', true)::text,
    'a quotation with no deal is confirmed too, in Spanish, from the document''s own figures');

-- A deal closed by hand is not won by the acceptance.
select public.quote_portal_accept(public.email_test_hash_of(9894),
    'Lucia Gomez', 'lucia@cliente-auto.test', '203.0.113.9', 'Test/1');

select is(
    (select row(q.status_key, d.stage)::text
       from public.quotes q join public.deals d on d.id = q.deal_id where q.id = 9894),
    row('accepted', 'lost')::text,
    'an acceptance on a deal closed by hand stands, and leaves the deal closed');

select is(
    public.email_test_auto_count('quote_accepted', 9894), 0,
    'a customer is not congratulated on a sale the pipeline did not record');

select is(
    public.email_automation_quote_accepted(9894), 'deal_not_won', 'and the reason is said');

-- The confirmation blows up; the acceptance must not.
select public.quote_portal_accept(public.email_test_hash_of(9895),
    'Bruno Boom', 'boom@cliente-auto.test', '203.0.113.9', 'Test/1');

select is(
    (select row(q.status_key, v.accepted_at is not null, v.accepted_by_email::text)::text
       from public.quotes q join public.quote_versions v on v.quote_id = q.id where q.id = 9895),
    row('accepted', true, 'boom@cliente-auto.test')::text,
    'a confirmation that cannot be queued does not undo the acceptance');

select is(
    public.email_test_auto_count('quote_accepted', 9895), 0, 'it is simply not queued');

--
-- 4. The outbox and a confirmation
--
select isnt(
    public.email_quote_share_block(9891, public.email_test_v1(9891)), null,
    'an accepted version can no longer be shared by a person');

create temporary table email_test_claim as
select c as message
  from public.claim_email_messages(1, current_setting('email_test.c1')::bigint) c;

select is(
    (select count(*)::int from email_test_claim), 1,
    'but its confirmation leaves: it is about the answer, not asking for one');

select is(
    (select row(message ->> 'reply_to', message ->> 'subject',
                message -> 'variables' ->> 'customer_name')::text from email_test_claim),
    row('automation.owner@test.local', 'Acceptance confirmed: quotation {{quote_number}}',
        'Ana Compras')::text,
    'replies go to the owner, and the dispatcher is handed the template with what fills it');

select isnt(
    public.email_message_quote_token(current_setting('email_test.c1')::bigint), null,
    'the link to the accepted document is handed over while it is sent');

select public.complete_email_message(
    current_setting('email_test.c1')::bigint, 'accepted', 'pm-auto-c1');

-- An acceptance that no longer stands takes its confirmation with it.
select set_config('app.quote_version_unfreeze', public.email_test_v1(9893)::text, true);
update public.quote_versions
   set accepted_at = null, accepted_by_name = null, accepted_by_email = null,
       accepted_ip = null, acceptance_method = null, acceptance_evidence = null
 where id = public.email_test_v1(9893);
select set_config('app.quote_version_unfreeze', '', true);

select is(
    (select count(*)::int from public.claim_email_messages(
        1, (select id from public.email_messages
             where quote_id = 9893 and automation_key = 'quote_accepted'))),
    0, 'a confirmation whose acceptance is gone is not handed to the dispatcher');

select is(
    (select row(status, error_code, error)::text from public.email_messages
      where quote_id = 9893 and automation_key = 'quote_accepted'),
    row('canceled', 'email_quote_not_shareable', 'quote_not_accepted')::text,
    'it is canceled, with the reason');

--
-- 5. The follow-up
--
select set_config('email_test.m6',
    public.email_test_sent(9896, 'ana@cliente-auto.test', 6)::text, true);

select is(public.email_automation_followups(), 0, 'a rule switched off sweeps nothing');

update public.email_automations set state = 'enabled' where key = 'quote_followup';

-- Sent six days ago, but as far as the sweep can tell, only four.
select public.email_test_age(current_setting('email_test.m6')::bigint, 4);
select public.email_automation_followups();

select is(
    public.email_test_auto_count('quote_followup', 9896), 0,
    'no reminder before the rule''s delay has passed');

select public.email_test_age(current_setting('email_test.m6')::bigint, 6);
select public.email_automation_followups();

select is(
    public.email_test_auto_count('quote_followup', 9896), 1,
    'one reminder once it has');

select set_config('email_test.f1',
    (select id::text from public.email_messages
      where quote_id = 9896 and automation_key = 'quote_followup'), true);

select is(
    (select row(origin, status, to_email::text, sales_id, category, quote_version_id,
                dedupe_key, subject like '%{{quote_number}}%')::text
       from public.email_messages where id = current_setting('email_test.f1')::bigint),
    row('automation', 'pending', 'ana@cliente-auto.test', 9891::bigint, 'commercial',
        public.email_test_v1(9896),
        format('auto:quote_followup:%s:1', public.email_test_v1(9896)), true)::text,
    'to the address a person sent that version to, as commercial mail, signed by the owner');

select public.email_automation_followups();

select is(
    public.email_test_auto_count('quote_followup', 9896), 1,
    'the next sweep does not remind again');

-- Paused: what waits, waits -- and does not hold up what is behind it.
update public.email_automations set state = 'paused' where key = 'quote_followup';

select public.email_test_as('98910000-0000-0000-0000-000000000001');
select set_config('email_test.m7', (public.queue_quote_email(
    9896, public.email_test_v1(9896), 'beto@cliente-auto.test', 'A mano',
    'Hola: {{quote_link}}', '98910000-0000-0000-0000-0000000000a7')).id::text, true);
select public.email_test_as_nobody();

select is(
    (select count(*)::int from public.claim_email_messages(
        1, current_setting('email_test.f1')::bigint)),
    0, 'a paused rule''s message is not handed to the dispatcher');

select is(
    (select status from public.email_messages where id = current_setting('email_test.f1')::bigint),
    'pending', 'it waits where it is');

select is(
    (select (c ->> 'id')::bigint from public.claim_email_messages(1) c),
    current_setting('email_test.m7')::bigint,
    'and the message queued behind it leaves in its turn');

select is(public.email_automation_followups(), 0, 'a paused rule sweeps nothing');

-- Resumed: it leaves.
update public.email_automations set state = 'enabled', max_sends = 2 where key = 'quote_followup';

select is(
    (select count(*)::int from public.claim_email_messages(
        1, current_setting('email_test.f1')::bigint)),
    1, 'resuming the rule sends what was waiting');

select public.complete_email_message(current_setting('email_test.f1')::bigint, 'simulated');

-- A second reminder counts its days from the person's message too.
select public.email_automation_followups();

select is(
    public.email_test_auto_count('quote_followup', 9896), 1,
    'a second reminder waits for twice the delay');

select public.email_test_age(current_setting('email_test.m6')::bigint, 11);
select public.email_automation_followups();

select is(
    (select dedupe_key from public.email_messages
      where quote_id = 9896 and automation_key = 'quote_followup'
        and id <> current_setting('email_test.f1')::bigint),
    format('auto:quote_followup:%s:2', public.email_test_v1(9896)),
    'and is then queued as the second step');

-- However long the customer stays silent after that.
select public.email_test_age(current_setting('email_test.m6')::bigint, 60);
select public.email_automation_followups();

select is(
    public.email_test_auto_count('quote_followup', 9896), 2,
    'never more reminders than the rule allows');

-- Disabled: what was waiting is canceled.
update public.email_automations set state = 'disabled' where key = 'quote_followup';

select is(
    (select count(*)::int from public.claim_email_messages(
        1, (select id from public.email_messages
             where dedupe_key = format('auto:quote_followup:%s:2', public.email_test_v1(9896))))),
    0, 'a rule switched off does not send what it had queued');

select is(
    (select row(status, error_code)::text from public.email_messages
      where dedupe_key = format('auto:quote_followup:%s:2', public.email_test_v1(9896))),
    row('canceled', 'email_automation_disabled')::text,
    'the message is canceled, and says why');

-- Everything that stops a reminder, against one that is due in the same sweep.
update public.email_automations set state = 'enabled', max_sends = 1 where key = 'quote_followup';

select public.email_test_sent(9889, 'ana@cliente-auto.test', 6);
select public.email_test_sent(9897, 'ana@cliente-auto.test', 6);
select public.email_test_sent(9898, 'ana@cliente-auto.test', 6);
select public.email_test_sent(9899, 'ana@cliente-auto.test', 6);
select public.email_test_sent(9890, 'caro@cliente-auto.test', 6);
select public.email_test_sent(9888, 'ana@cliente-auto.test', 6);

select public.quote_portal_reject(public.email_test_hash_of(9897), 'price', null,
    'Lucia Gomez', 'lucia@cliente-auto.test', '203.0.113.9', 'Test/1');

select public.email_test_as('98910000-0000-0000-0000-000000000001');
select public.revise_quote(9898, 'el cliente pidio otro alcance');
select public.transition_quote(9888, 'negotiating', 'el cliente pidio un ajuste');
select public.email_test_as_nobody();

select set_config('app.quote_version_unfreeze', public.email_test_v1(9899)::text, true);
update public.quote_versions set valid_until = current_date - 1
 where id = public.email_test_v1(9899);
select set_config('app.quote_version_unfreeze', '', true);

insert into public.email_suppressions (email, reason)
values ('caro@cliente-auto.test', 'manual');

select public.email_automation_followups();

select is(
    public.email_test_auto_count('quote_followup', 9889), 1,
    'a quotation still waiting for its answer is reminded');

select is(
    public.email_test_auto_count('quote_followup', 9897), 0,
    'a customer who answered is not reminded');

select is(
    public.email_test_auto_count('quote_followup', 9898), 0,
    'nor one whose quotation is being revised');

select is(
    (select row(q.status_key,
                public.email_quote_share_block(9888, public.email_test_v1(9888)))::text
       from public.quotes q where q.id = 9888),
    row('negotiating', null::text)::text,
    'a quotation under negotiation is still a live offer a person may share');

select is(
    public.email_test_auto_count('quote_followup', 9888), 0,
    'but the CRM does not chase a customer who is already talking');

select is(
    public.email_test_auto_count('quote_followup', 9899), 0,
    'nor one whose offer has lapsed');

select is(
    public.email_test_auto_count('quote_followup', 9890), 0,
    'nor an address on the suppression list');

--
-- 6. Bad news reaches whoever signed the message
--
select public.record_email_event('mock', 'bounce:auto-c1', 'pm-auto-c1', 'bounced',
    now(), 'lucia@cliente-auto.test', true, 'No such user');

select is(
    (select row(n.recipient_id, n.channel::text, n.status, n.entity_type::text, n.entity_id,
                n.task_id, n.message_key, n.message_params::text, n.body)::text
       from public.task_notifications n
      where n.dedupe_key = format('email:%s:bounced', current_setting('email_test.c1'))),
    (select row(9891::bigint, 'in_app', 'delivered', 'quote', 9891::bigint, null::bigint,
                'crm.notifications.email.bounced',
                '{"to": "lucia@cliente-auto.test"}', q.quote_number)::text
       from public.quotes q where q.id = 9891),
    'a bounced confirmation is told to the quotation''s owner, on the quotation, as a key and not a sentence');

select is(
    (select count(*)::int from public.task_notifications n
      where n.entity_type = 'quote' and n.entity_id = 9891
        and (n.title like '%{{%' or n.body like '%{{%' or n.message_params::text like '%{{%')),
    0, 'and nobody is shown the braces of a template');

-- A person's message: a failure that will be retried is not news yet.
select public.complete_email_message(
    current_setting('email_test.m7')::bigint, 'failed', null,
    'provider_unavailable', 'postmark responded 503', true);

select is(
    (select count(*)::int from public.task_notifications n
      where n.dedupe_key like format('email:%s:%%', current_setting('email_test.m7'))),
    0, 'a failure that is going to be retried notifies nobody');

update public.email_messages set scheduled_for = now()
 where id = current_setting('email_test.m7')::bigint;
select count(*) from public.claim_email_messages(1, current_setting('email_test.m7')::bigint);
select public.complete_email_message(
    current_setting('email_test.m7')::bigint, 'failed', null,
    'provider_rejected', 'rejected for good', false);

select is(
    (select row(n.recipient_id, n.message_key, n.body)::text
       from public.task_notifications n
      where n.dedupe_key = format('email:%s:failed', current_setting('email_test.m7'))),
    row(9891::bigint, 'crm.notifications.email.failed', 'A mano')::text,
    'a failure for good is told to its sender, with the subject they wrote');

-- Retried by hand and failed again: still one notification.
select public.email_test_as('98910000-0000-0000-0000-000000000001');
select public.retry_email_message(current_setting('email_test.m7')::bigint);
select public.email_test_as_nobody();
select count(*) from public.claim_email_messages(1, current_setting('email_test.m7')::bigint);
select public.complete_email_message(
    current_setting('email_test.m7')::bigint, 'failed', null,
    'provider_rejected', 'rejected again', false);

select is(
    (select count(*)::int from public.task_notifications n
      where n.dedupe_key like format('email:%s:%%', current_setting('email_test.m7'))),
    1, 'told once, however many times the same message fails');

--
-- 7. The timeline
--
select is(
    (select row(t.actor_kind, t.entity_type, t.entity_id, t.payload ->> 'origin',
                t.payload -> 'variables' ->> 'sender_name')::text
       from public.timeline_events t
      where t.id = 'email_message:' || current_setting('email_test.c1')),
    row('automation', 'quote', 9891::bigint, 'automation', 'Olga Owner')::text,
    'an automatic message is on the quotation''s timeline as the automation''s, with what fills its subject');

select is(
    (select row(t.actor_kind, t.entity_id)::text from public.timeline_events t
      where t.id = 'email_message:deal:' || current_setting('email_test.c1')),
    row('automation', 9891::bigint)::text,
    'and on the timeline of the deal it was raised against');

select is(
    (select row(t.actor_kind, t.payload ->> 'origin', t.payload -> 'variables')::text
       from public.timeline_events t
      where t.id = 'email_message:' || current_setting('email_test.m6')),
    row('user', 'manual', 'null'::jsonb)::text,
    'a message a person sent stays that person''s');

select * from finish();
rollback;
