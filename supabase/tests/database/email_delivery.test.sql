--
-- Outbound email: what the provider reports after accepting a message, and
-- the addresses the CRM stops writing to (docs/proposals/outbound-email.md).
--
--   * `delivered` and `bounced` are written from a provider event and from
--     nothing else, and a status only moves forward: events out of order
--     cannot walk a message back;
--   * the same event twice is one row and one effect;
--   * an event about a message this CRM did not send is kept, matched to
--     nothing, and changes nothing;
--   * a hard bounce and a complaint suppress the address; a soft bounce does
--     not; a suppressed address is refused when queued, shown as such to the
--     dialog, and a message already waiting for it does not leave;
--   * events are history and follow their message; the suppression list is the
--     managers' to read and the administrators' to change, and a hand-made
--     entry cannot pass for a provider's verdict.
--
begin;

select plan(40);

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

create function public.email_test_as(p_user text) returns void
    language sql
as $$
    select set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Queue one message to an address, send it, and return its id: accepted by
-- the provider under the id `pm-<label>`.
create function public.email_test_accepted(p_to text, p_label text) returns bigint
    language plpgsql
as $$
declare
    v_id bigint;
begin
    v_id := (public.queue_email('contact', 9871, p_to, 'Asunto ' || p_label, 'Hola.',
                                gen_random_uuid())).id;
    perform count(*) from public.claim_email_messages(1, v_id);
    perform public.complete_email_message(v_id, 'accepted', 'pm-' || p_label);
    return v_id;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98710000-0000-0000-0000-000000000001', 'delivery.owner@test.local',   '{"first_name":"Olga","last_name":"Owner"}'::jsonb),
  ('98710000-0000-0000-0000-000000000002', 'delivery.other@test.local',   '{"first_name":"Otto","last_name":"Otro"}'::jsonb),
  ('98710000-0000-0000-0000-000000000004', 'delivery.manager@test.local', '{"first_name":"Marta","last_name":"Manager"}'::jsonb),
  ('98710000-0000-0000-0000-000000000005', 'delivery.admin@test.local',   '{"first_name":"Ada","last_name":"Admin"}'::jsonb);

update public.sales set id = 9871, role = 'rep'     where user_id = '98710000-0000-0000-0000-000000000001';
update public.sales set id = 9872, role = 'rep'     where user_id = '98710000-0000-0000-0000-000000000002';
update public.sales set id = 9874, role = 'manager' where user_id = '98710000-0000-0000-0000-000000000004';
update public.sales set id = 9875, role = 'admin'   where user_id = '98710000-0000-0000-0000-000000000005';

update public.email_settings
   set provider_key = 'mock', is_enabled = true,
       max_per_user_hour = 1000, max_per_recipient_day = 100
 where id = 1;

insert into public.companies (id, name, sales_id, logo)
values (9871, 'Cliente Entregas', 9871, '{}'::jsonb);

insert into public.contacts (id, first_name, last_name, company_id, sales_id, email_jsonb)
values (9871, 'Ana', 'Entregas', 9871, 9871,
   '[{"email":"a@entregas.test","type":"Work"},{"email":"b@entregas.test","type":"Work"},
     {"email":"c@entregas.test","type":"Work"},{"email":"d@entregas.test","type":"Work"},
     {"email":"e@entregas.test","type":"Work"},{"email":"f@entregas.test","type":"Work"}]'::jsonb);

select public.email_test_as('98710000-0000-0000-0000-000000000001');

select set_config('email_test.a', public.email_test_accepted('a@entregas.test', 'a')::text, true);
select set_config('email_test.b', public.email_test_accepted('b@entregas.test', 'b')::text, true);
select set_config('email_test.c', public.email_test_accepted('c@entregas.test', 'c')::text, true);
select set_config('email_test.d', public.email_test_accepted('d@entregas.test', 'd')::text, true);

--
-- 1. Delivered
--
select is(
    public.record_email_event('mock', 'delivery:pm-a', 'pm-a', 'delivered',
        '2026-10-08 15:00:00+00', 'a@entregas.test'),
    '{"duplicate": false, "matched": true, "status": "delivered"}'::jsonb,
    'a delivery event marks the message delivered');

select is(
    (select row(status, delivered_at)::text from public.email_messages
      where id = current_setting('email_test.a')::bigint),
    row('delivered', '2026-10-08 15:00:00+00'::timestamptz)::text,
    'at the moment the provider says it was');

select is(
    public.record_email_event('mock', 'delivery:pm-a', 'pm-a', 'delivered',
        '2026-10-08 16:00:00+00', 'a@entregas.test') ->> 'duplicate',
    'true', 'the same event again is recognised as a duplicate');

select is(
    (select row(count(*), max(m.delivered_at))::text
       from public.email_message_events e
       join public.email_messages m on m.id = e.message_id
      where e.provider_event_id = 'delivery:pm-a'),
    row(1::bigint, '2026-10-08 15:00:00+00'::timestamptz)::text,
    'and changes nothing: one row, the first moment kept');

select is(
    public.record_email_event('mock', 'delivery:pm-unknown', 'pm-unknown', 'delivered',
        now(), 'x@otra.test'),
    '{"duplicate": false, "matched": false, "status": null}'::jsonb,
    'an event about a message this CRM did not send matches nothing');

select is(
    (select message_id from public.email_message_events
      where provider_event_id = 'delivery:pm-unknown'),
    null, 'and is kept, attached to no message');

--
-- 2. Bounces, and order
--
select public.record_email_event('mock', 'bounce:1', 'pm-b', 'bounced',
    '2026-10-08 15:05:00+00', 'b@entregas.test', false, 'Mailbox full');

select is(
    (select row(status, error_code, error, bounced_at is not null)::text
       from public.email_messages where id = current_setting('email_test.b')::bigint),
    row('bounced', 'recipient_bounced', 'Mailbox full', true)::text,
    'a bounce marks the message bounced, with the provider''s reason');

select is(
    public.email_is_suppressed('b@entregas.test'), false,
    'a temporary bounce does not suppress the address');

select public.record_email_event('mock', 'delivery:pm-b', 'pm-b', 'delivered',
    '2026-10-08 15:01:00+00', 'b@entregas.test');

select is(
    (select status from public.email_messages where id = current_setting('email_test.b')::bigint),
    'bounced', 'a delivery event arriving after the bounce does not walk the message back');

select public.record_email_event('mock', 'delivery:pm-c', 'pm-c', 'delivered', now(), 'c@entregas.test');
select public.record_email_event('mock', 'bounce:2', 'pm-c', 'bounced',
    now(), 'c@entregas.test', true, 'Unknown user');

select is(
    (select status from public.email_messages where id = current_setting('email_test.c')::bigint),
    'bounced', 'a mailbox that accepted and then bounced is bounced');

select is(
    (select row(reason, detail, source_message_id)::text
       from public.email_suppressions where email = 'c@entregas.test'),
    row('hard_bounce', 'Unknown user', current_setting('email_test.c')::bigint)::text,
    'a permanent bounce suppresses the address, naming the message that found out');

select public.record_email_event('mock', 'delivery:pm-d', 'pm-d', 'delivered', now(), 'd@entregas.test');
select public.record_email_event('mock', 'complaint:3', 'pm-d', 'complained', now(), 'D@Entregas.test');

select is(
    (select status from public.email_messages where id = current_setting('email_test.d')::bigint),
    'delivered', 'a complaint does not undo a delivery');

select is(
    (select reason from public.email_suppressions where email = 'd@entregas.test'),
    'complaint', 'but the address is not written to again');

-- A message that never reached the provider is not touched by an event.
select set_config('email_test.sim', (public.queue_email('contact', 9871, 'e@entregas.test',
    'Simulado', 'Hola.', gen_random_uuid())).id::text, true);
select count(*) from public.claim_email_messages(1, current_setting('email_test.sim')::bigint);
select public.complete_email_message(current_setting('email_test.sim')::bigint, 'simulated');
update public.email_messages set provider_message_id = 'pm-sim'
 where id = current_setting('email_test.sim')::bigint;
select public.record_email_event('mock', 'delivery:pm-sim', 'pm-sim', 'delivered', now(), 'e@entregas.test');

select is(
    (select status from public.email_messages where id = current_setting('email_test.sim')::bigint),
    'simulated', 'a simulated message is never promoted to delivered');

select is(
    public.email_test_error_of($sql$
        select public.record_email_event('mock', 'x:1', 'pm-a', 'opened') $sql$),
    '23514:email_event_invalid', 'an event type the CRM does not record is refused');

select is(
    public.email_test_error_of($sql$
        select public.record_email_event('mock', '  ', 'pm-a', 'delivered') $sql$),
    '23514:email_event_invalid', 'and so is an event with no id');

--
-- 3. A suppressed address
--
select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9871, 'c@entregas.test', 'Otra vez', 'Hola.',
            gen_random_uuid()) $sql$),
    '23514:email_recipient_suppressed', 'a suppressed address is refused when a message is queued');

select is(
    (select r ->> 'is_suppressed'
       from jsonb_array_elements(public.email_context('contact', 9871) -> 'recipients') r
      where r ->> 'email' = 'c@entregas.test'),
    'true', 'and the dialog is told, before anybody presses Send');

select is(
    (select r ->> 'is_suppressed'
       from jsonb_array_elements(public.email_context('contact', 9871) -> 'recipients') r
      where r ->> 'email' = 'f@entregas.test'),
    'false', 'while the other addresses of the record stay available');

-- Queued, then the address dies before the message leaves.
select set_config('email_test.f', (public.queue_email('contact', 9871, 'f@entregas.test',
    'En cola', 'Hola.', gen_random_uuid())).id::text, true);
select public.record_email_event('mock', 'bounce:4', null, 'bounced', now(),
    'f@entregas.test', true, 'Unknown user');

select is(
    (select count(*)::int from public.claim_email_messages(1, current_setting('email_test.f')::bigint)),
    0, 'a message waiting for an address that has since been suppressed is not sent');

select is(
    (select row(status, error_code)::text from public.email_messages
      where id = current_setting('email_test.f')::bigint),
    row('canceled', 'email_recipient_suppressed')::text, 'it is canceled, with the reason');

--
-- 4. Who reads and writes
--
select is(
    public.email_test_error_of($sql$
        update public.email_message_events set detail = 'otra cosa' $sql$),
    '42501', 'an event is history: it cannot be rewritten');

set local role authenticated;

select is(
    public.email_test_error_of($sql$
        select public.record_email_event('mock', 'y:1', 'pm-a', 'delivered') $sql$),
    '42501', 'a signed-in user cannot report a delivery');

select is(
    (select count(*)::int from public.email_message_events
      where message_id = current_setting('email_test.a')::bigint),
    1, 'the sender reads the events of their message');

select is(
    (select count(*)::int from public.email_message_events where message_id is null),
    0, 'but not an event that matched no message');

select is(
    (select count(*)::int from public.email_suppressions), 0,
    'a rep does not read the suppression list');

select public.email_test_as('98710000-0000-0000-0000-000000000002');
select is(
    (select count(*)::int from public.email_message_events
      where provider_event_id like '%pm-%' or provider_event_id like 'bounce:%'),
    0, 'an unrelated rep reads no event');

select public.email_test_as('98710000-0000-0000-0000-000000000004');
select ok(
    (select count(*) from public.email_message_events where message_id is null) >= 1,
    'a manager reads the unmatched ones');

select ok(
    (select count(*) from public.email_suppressions where email like '%@entregas.test') = 3,
    'a manager reads the suppression list');

select is(
    public.email_test_error_of($sql$
        insert into public.email_suppressions (email, reason) values ('z@entregas.test', 'manual') $sql$),
    '42501', 'but does not add to it');

select is(
    public.email_test_error_of($sql$
        delete from public.email_suppressions where email = 'c@entregas.test' returning 1 $sql$),
    'no error', 'nor remove from it: the delete matches nothing');

select is(
    (select count(*)::int from public.email_suppressions where email = 'c@entregas.test'),
    1, 'and the address is still suppressed');

select public.email_test_as('98710000-0000-0000-0000-000000000005');

insert into public.email_suppressions (email, reason, detail)
values ('  Manual@Entregas.test ', 'hard_bounce', 'pedido por el cliente');

select is(
    (select row(reason, created_by, detail)::text
       from public.email_suppressions where email = 'manual@entregas.test'),
    row('manual', 9875::bigint, 'pedido por el cliente')::text,
    'an admin adds an address: recorded as manual and theirs, whatever reason was posted');

select is(
    public.email_test_error_of($sql$
        insert into public.email_suppressions (email, reason) values (E'x@y.test\nBcc: z@y.test', 'manual') $sql$),
    '23514', 'an address that is not one is refused');

delete from public.email_suppressions where email = 'c@entregas.test';

reset role;

select public.email_test_as('98710000-0000-0000-0000-000000000001');
select is(
    (public.queue_email('contact', 9871, 'c@entregas.test', 'De nuevo', 'Hola.',
        gen_random_uuid())).status,
    'pending', 'once an admin removes it, the address can be written to again');

--
-- 5. anon, and the retention path
--
select is(
    (select count(*)::int
       from (values ('email_message_events'), ('email_suppressions')) t(name)
      where has_table_privilege('anon', 'public.' || t.name, 'select')
         or has_table_privilege('anon', 'public.' || t.name, 'insert')),
    0, 'anon reaches neither table');

select is(
    has_function_privilege('anon', 'public.record_email_event(text, text, text, text, timestamp with time zone, text, boolean, text)', 'execute'),
    false, 'nor the function a webhook calls');

select ok(public.purge_emails() >= 1, 'the retention path runs');

select is(
    (select count(*)::int from public.email_message_events), 0,
    'and takes the events with it');

select is(
    (select count(*)::int from public.email_suppressions), 0,
    'and the suppression list');

select * from finish();
rollback;
