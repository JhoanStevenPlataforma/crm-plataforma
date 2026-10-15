--
-- Outbound email: sharing a quotation, and the outbox
-- (docs/proposals/outbound-email.md).
--
--   * only an ISSUED version that is still the live offer can be shared: not a
--     draft, not a version a revision replaced or is replacing, not a lapsed
--     or closed one -- and the refusal says which;
--   * sharing changes NOTHING about the quotation: not its status, not a
--     price, a total or a rate, not its history, not its links;
--   * the message names the exact version shared and keeps what it said after
--     the quotation is revised, and after its prices change;
--   * the customer link is never stored in the message;
--   * the same press of "Send" twice is one message; the same message again
--     minutes later needs a confirmation;
--   * the outbox: a claim is exclusive and re-checks the quotation, the
--     provider accepting is `accepted` and never `delivered`, a transient
--     failure is retried with a backoff and a final one is not, a dispatcher
--     that never answered fails the message instead of sending it twice, and a
--     failed message is retried in place by whoever may.
--
begin;

select plan(60);

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

-- Everything a send must leave alone, as one comparable value.
create function public.email_test_quote_print(p_quote_id bigint) returns text
    language sql
as $$
    select md5(
        (select q::text from public.quotes q where q.id = p_quote_id)
        || coalesce((select string_agg(v::text, '|' order by v.id)
                       from public.quote_versions v where v.quote_id = p_quote_id), '')
        || coalesce((select string_agg(l::text, '|' order by l.id)
                       from public.quote_lines l where l.quote_id = p_quote_id), '')
        || (select count(*) from public.quote_status_changes c where c.quote_id = p_quote_id)
        || (select count(*) from public.quote_access_tokens t where t.quote_id = p_quote_id)
        || (select count(*) from public.quote_portal_events e where e.quote_id = p_quote_id));
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98510000-0000-0000-0000-000000000001', 'email.owner@test.local',   '{"first_name":"Olga","last_name":"Owner"}'::jsonb),
  ('98510000-0000-0000-0000-000000000002', 'email.other@test.local',   '{"first_name":"Otto","last_name":"Otro"}'::jsonb),
  ('98510000-0000-0000-0000-000000000004', 'email.manager@test.local', '{"first_name":"Marta","last_name":"Manager"}'::jsonb);

update public.sales set id = 9851, role = 'rep'     where user_id = '98510000-0000-0000-0000-000000000001';
update public.sales set id = 9852, role = 'rep'     where user_id = '98510000-0000-0000-0000-000000000002';
update public.sales set id = 9854, role = 'manager' where user_id = '98510000-0000-0000-0000-000000000004';

-- Whatever the local database is configured with, these tests run on the
-- simulated provider with room to send.
update public.email_settings
   set provider_key = 'mock', is_enabled = true,
       max_per_user_hour = 1000, max_per_recipient_day = 100
 where id = 1;

insert into public.companies (id, name, sales_id, logo)
values (9851, 'Cliente Correo', 9851, '{}'::jsonb);

insert into public.contacts (id, first_name, last_name, company_id, sales_id, email_jsonb) values
  (9851, 'Ana', 'Compras', 9851, 9851,
   '[{"email":"ana.compras@cliente-correo.test","type":"Work"}]'::jsonb),
  (9852, 'Beto', 'Finanzas', 9851, 9852,
   '[{"email":"beto.finanzas@cliente-correo.test","type":"Work"}]'::jsonb);

-- 9851 is shared, then revised; 9852 is never issued; 9853 is revised while a
-- message waits; 9854 lapses; 9855 is canceled.
insert into public.quotes (id, company_id, contact_id, sales_id, currency, valid_until) values
  (9851, 9851, 9851, 9851, 'COP', current_date + 10),
  (9852, 9851, 9851, 9851, 'COP', current_date + 10),
  (9853, 9851, 9851, 9851, 'COP', current_date + 10),
  (9854, 9851, 9851, 9851, 'COP', current_date + 10),
  (9855, 9851, 9851, 9851, 'COP', current_date + 10);

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Linea', 2, 150 from public.quote_versions v where v.quote_id between 9851 and 9855;

select public.email_test_as('98510000-0000-0000-0000-000000000001');
select public.issue_quote_version(9851);
select public.issue_quote_version(9853);
select public.issue_quote_version(9854);
select public.issue_quote_version(9855);
select public.transition_quote(9855, 'canceled', 'el cliente desistio');

-- 9854 was issued inside its validity and then the day passed.
select set_config('app.quote_version_unfreeze', v.id::text, true)
  from public.quote_versions v where v.quote_id = 9854;
update public.quote_versions set valid_until = current_date - 1 where quote_id = 9854;
select set_config('app.quote_version_unfreeze', '', true);

create temporary table email_test_ids as
select q.id as quote_id,
       (select v.id from public.quote_versions v
         where v.quote_id = q.id and v.version_number = 1) as v1
  from public.quotes q where q.id between 9851 and 9855;
grant select on email_test_ids to authenticated;

select set_config('email_test.print', public.email_test_quote_print(9851), true);

--
-- 1. Sharing an issued version
--
select set_config('email_test.m1', (public.queue_quote_email(
    9851, (select v1 from email_test_ids where quote_id = 9851),
    'Ana.Compras@cliente-correo.test', 'Cotizacion lista',
    E'Hola Ana:\n\nAqui esta: {{quote_link}}',
    '98510000-0000-0000-0000-0000000000a1')).id::text, true);

select is(
    (select status from public.email_messages where id = current_setting('email_test.m1')::bigint),
    'pending', 'a shared quotation is queued, not sent by the call');

select is(
    (select quote_version_id from public.email_messages where id = current_setting('email_test.m1')::bigint),
    (select v1 from email_test_ids where quote_id = 9851),
    'the message names the exact version shared');

select is(
    (select row(entity_type::text, entity_id, quote_id, sales_id, contact_id, to_email::text)::text
       from public.email_messages where id = current_setting('email_test.m1')::bigint),
    row('quote', 9851::bigint, 9851::bigint, 9851::bigint, 9851::bigint,
        'ana.compras@cliente-correo.test')::text,
    'it hangs off the quotation, its sender and the contact the address belongs to');

select is(
    (select row(variables ->> 'quote_number', (variables ->> 'total')::numeric,
                variables ->> 'currency', variables ->> 'customer_company')::text
       from public.email_messages where id = current_setting('email_test.m1')::bigint),
    (select row(q.quote_number, v.total, v.currency, 'Cliente Correo')::text
       from public.quotes q join public.quote_versions v on v.quote_id = q.id
      where q.id = 9851 and v.version_number = 1),
    'the figures it carries are the ones the version was issued with');

select is(
    (select position(t.token in m::text)
       from public.email_messages m, public.quote_access_tokens t
      where m.id = current_setting('email_test.m1')::bigint
        and t.quote_id = 9851 and t.token is not null),
    0, 'the customer link is not stored in the message');

select is(
    public.email_test_quote_print(9851), current_setting('email_test.print'),
    'sharing changed nothing of the quotation: status, versions, lines, history, links');

select is(
    (select status_key from public.quotes where id = 9851), 'sent',
    'the quotation is still in the status it was issued into');

-- The issue date is the sender's calendar day, not the server's: a document
-- issued in the evening in Bogota is still dated that evening.
select set_config('app.quote_version_unfreeze', v1::text, true)
  from email_test_ids where quote_id = 9853;
update public.quote_versions set issued_at = '2026-10-09 03:30:00+00'
 where id = (select v1 from email_test_ids where quote_id = 9853);
select set_config('app.quote_version_unfreeze', '', true);

select is(
    public.email_context('quote', 9853, 'America/Bogota') -> 'variables' ->> 'issue_date',
    '2026-10-08', 'the issue date is read on the sender''s calendar');

select is(
    public.email_context('quote', 9853, 'Not/AZone') -> 'variables' ->> 'issue_date',
    '2026-10-09', 'and on UTC when the zone is not one');

--
-- 2. Duplicates
--
select is(
    (public.queue_quote_email(
        9851, (select v1 from email_test_ids where quote_id = 9851),
        'ana.compras@cliente-correo.test', 'Cotizacion lista',
        E'Hola Ana:\n\nAqui esta: {{quote_link}}',
        '98510000-0000-0000-0000-0000000000a1')).id,
    current_setting('email_test.m1')::bigint,
    'the same idempotency key returns the message it already queued');

select is(
    (select count(*)::int from public.email_messages where quote_id = 9851), 1,
    'and no second message exists');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            'ana.compras@cliente-correo.test', 'Otra vez', 'Hola: {{quote_link}}',
            '98510000-0000-0000-0000-0000000000a2') $sql$),
    '23514:email_duplicate_recent',
    'the same version to the same address minutes later is refused');

select set_config('email_test.m2', (public.queue_quote_email(
    9851, (select v1 from email_test_ids where quote_id = 9851),
    'ana.compras@cliente-correo.test', 'Otra vez', 'Hola: {{quote_link}}',
    '98510000-0000-0000-0000-0000000000a2', p_confirm_duplicate => true)).id::text, true);

select isnt(
    current_setting('email_test.m2'), current_setting('email_test.m1'),
    'unless the sender confirms it, which queues a second message');

--
-- 3. What cannot be shared
--
select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9852, (select v1 from email_test_ids where quote_id = 9852),
            'ana.compras@cliente-correo.test', 'Borrador', 'Hola',
            '98510000-0000-0000-0000-0000000000b1') $sql$),
    '23514:email_quote_not_shareable',
    'a quotation that was never issued cannot be shared');

select is(
    (select status_key from public.quotes where id = 9852), 'draft',
    'and trying did not issue it');

select is(
    public.email_quote_share_block(9852, (select v1 from email_test_ids where quote_id = 9852)),
    'quote_not_issued', 'the reason is "not issued"');

select is(
    public.email_quote_share_block(9854, (select v1 from email_test_ids where quote_id = 9854)),
    'version_expired', 'a lapsed offer says so');

select is(
    public.email_quote_share_block(9855, (select v1 from email_test_ids where quote_id = 9855)),
    'quote_closed', 'a canceled quotation says so');

select is(
    public.email_quote_share_block(9851, (select v1 from email_test_ids where quote_id = 9853)),
    'quote_not_issued', 'a version of another quotation is not this one''s');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9854, (select v1 from email_test_ids where quote_id = 9854),
            'ana.compras@cliente-correo.test', 'Vencida', 'Hola',
            '98510000-0000-0000-0000-0000000000b2') $sql$),
    '23514:email_quote_not_shareable', 'a lapsed offer is refused');

select is(
    public.email_test_error_of($sql$
        select public.queue_email('quote', 9851, 'ana.compras@cliente-correo.test',
            'Por la otra puerta', 'Hola', '98510000-0000-0000-0000-0000000000b3') $sql$),
    '23514:email_entity_invalid',
    'the generic door does not take a quotation: there is one way to share one');

--
-- 4. Who, and to whom
--
select public.email_test_as('98510000-0000-0000-0000-000000000002');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            'beto.finanzas@cliente-correo.test', 'Ajena', 'Hola',
            '98510000-0000-0000-0000-0000000000c1') $sql$),
    '42501:email_forbidden', 'a rep cannot share a quotation that is not theirs');

select is(
    public.email_test_error_of($sql$ select public.email_context('quote', 9851) $sql$),
    '42501:email_forbidden', 'nor read who it could be sent to');

select public.email_test_as('98510000-0000-0000-0000-000000000001');

select ok(
    (select public.email_context('quote', 9851) -> 'recipients')
        @> '[{"email":"ana.compras@cliente-correo.test"},{"email":"beto.finanzas@cliente-correo.test"}]'::jsonb,
    'the owner is offered the quotation''s contact and the other people of that company');

select is(
    public.email_context('quote', 9851) -> 'quote' ->> 'block', null,
    'and is told the newest issued version can be shared');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            'alguien@otra-empresa.test', 'Libre', 'Hola',
            '98510000-0000-0000-0000-0000000000c2') $sql$),
    '42501:email_recipient_not_allowed',
    'a rep cannot type an address that is not related to the quotation');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            E'ana.compras@cliente-correo.test\nBcc: x@y.test', 'Cabecera', 'Hola',
            '98510000-0000-0000-0000-0000000000c3') $sql$),
    '23514:email_recipient_invalid', 'an address carrying a line break is refused');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            'beto.finanzas@cliente-correo.test', E'Asunto\r\nBcc: x@y.test', 'Hola',
            '98510000-0000-0000-0000-0000000000c4') $sql$),
    '23514:email_subject_invalid', 'a subject carrying a line break is refused');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            'beto.finanzas@cliente-correo.test', 'Sin rellenar', 'Total: {{total}}',
            '98510000-0000-0000-0000-0000000000c5') $sql$),
    '23514:email_unresolved_variable', 'a variable nobody filled does not reach the customer');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9851, (select v1 from email_test_ids where quote_id = 9851),
            'beto.finanzas@cliente-correo.test', 'Enlace {{quote_link}}', 'Hola',
            '98510000-0000-0000-0000-0000000000c6') $sql$),
    '23514:email_unresolved_variable', 'the link cannot ride in a subject');

select public.email_test_as('98510000-0000-0000-0000-000000000004');

select is(
    (public.queue_quote_email(
        9851, (select v1 from email_test_ids where quote_id = 9851),
        'alguien@otra-empresa.test', 'Libre', 'Hola: {{quote_link}}',
        '98510000-0000-0000-0000-0000000000c7')).sales_id,
    9854::bigint, 'a manager may type a free address, and is recorded as the sender');

--
-- 5. The outbox
--
select is(
    public.email_test_error_of($sql$ set local role authenticated; select public.claim_email_messages(5) $sql$),
    '42501', 'a signed-in user cannot claim the outbox');
reset role;

-- One statement, then read: a set-returning call is invisible to a read in the
-- same statement.
create temporary table email_test_claim as
select c as message from public.claim_email_messages(1, current_setting('email_test.m1')::bigint) c;

select is(
    (select count(*)::int from email_test_claim), 1, 'a claim by id returns that message');

select is(
    (select row(status, attempt, provider_key)::text
       from public.email_messages where id = current_setting('email_test.m1')::bigint),
    row('processing', 1, 'mock')::text, 'and marks it processing, first attempt, with the provider in use');

select is(
    (select (message ->> 'reply_to') from email_test_claim),
    'email.owner@test.local', 'replies go to the user who sent it');

select is(
    (select count(*)::int from public.claim_email_messages(1, current_setting('email_test.m1')::bigint)),
    0, 'a message already claimed cannot be claimed again');

select is(
    public.email_message_quote_token(current_setting('email_test.m1')::bigint),
    (select t.token from public.quote_access_tokens t
      where t.quote_id = 9851 and t.token is not null and t.revoked_at is null),
    'the link is handed over while the message is being sent');

select is(
    public.email_message_quote_token(current_setting('email_test.m2')::bigint),
    null, 'and to nothing that is not being sent');

select public.complete_email_message(
    current_setting('email_test.m1')::bigint, 'accepted', 'provider-id-1');

select is(
    (select row(status, provider_message_id, accepted_at is not null, delivered_at is null)::text
       from public.email_messages where id = current_setting('email_test.m1')::bigint),
    row('accepted', 'provider-id-1', true, true)::text,
    'the provider taking the message is "accepted", never "delivered"');

select public.complete_email_message(
    current_setting('email_test.m1')::bigint, 'failed', null, 'late', 'a late answer');

select is(
    (select status from public.email_messages where id = current_setting('email_test.m1')::bigint),
    'accepted', 'an answer arriving after the outcome was recorded changes nothing');

-- A transient failure, then a final one.
select count(*) from public.claim_email_messages(1, current_setting('email_test.m2')::bigint);
select public.complete_email_message(
    current_setting('email_test.m2')::bigint, 'failed', null,
    'provider_unavailable', 'postmark responded 503', true);

select is(
    (select row(status, attempt, error_code, scheduled_for > now())::text
       from public.email_messages where id = current_setting('email_test.m2')::bigint),
    row('pending', 1, 'provider_unavailable', true)::text,
    'a retryable failure goes back to the queue, for later');

select is(
    (select count(*)::int from public.claim_email_messages(1, current_setting('email_test.m2')::bigint)),
    0, 'and is not sent again before its backoff has passed');

update public.email_messages set scheduled_for = now()
 where id = current_setting('email_test.m2')::bigint;
select count(*) from public.claim_email_messages(1, current_setting('email_test.m2')::bigint);
select public.complete_email_message(
    current_setting('email_test.m2')::bigint, 'failed', null,
    'recipient_inactive', 'the address bounced before', false);

select is(
    (select row(status, attempt, error_code, failed_at is not null)::text
       from public.email_messages where id = current_setting('email_test.m2')::bigint),
    row('failed', 2, 'recipient_inactive', true)::text,
    'a failure that another try will not fix is final');

-- Retry in place.
select public.email_test_as('98510000-0000-0000-0000-000000000002');
select is(
    public.email_test_error_of(format(
        'select public.retry_email_message(%s)', current_setting('email_test.m2'))),
    '42501:email_forbidden', 'somebody else''s failed message cannot be retried');

select public.email_test_as('98510000-0000-0000-0000-000000000001');
select is(
    public.email_test_error_of(format(
        'select public.retry_email_message(%s)', current_setting('email_test.m1'))),
    '23514:email_not_retryable', 'a message that did not fail cannot be retried');

select is(
    (select row(r.id, r.status, r.attempt)::text
       from public.retry_email_message(current_setting('email_test.m2')::bigint) r),
    row(current_setting('email_test.m2')::bigint, 'pending', 0)::text,
    'its sender retries a failed message: the same row, queued again');

-- The attempt budget.
select count(*) from public.claim_email_messages(1, current_setting('email_test.m2')::bigint);
update public.email_messages set attempt = 5
 where id = current_setting('email_test.m2')::bigint;
select public.complete_email_message(
    current_setting('email_test.m2')::bigint, 'failed', null,
    'provider_unavailable', 'postmark responded 503', true);

select is(
    (select status from public.email_messages where id = current_setting('email_test.m2')::bigint),
    'failed', 'a retryable failure is final once the attempts run out');

-- A dispatcher that never answered.
select public.retry_email_message(current_setting('email_test.m2')::bigint);
select count(*) from public.claim_email_messages(1, current_setting('email_test.m2')::bigint);
update public.email_messages set claimed_at = now() - interval '11 minutes'
 where id = current_setting('email_test.m2')::bigint;

select is(public.fail_stale_email_messages(), 1, 'one message was left mid-flight');

select is(
    (select row(status, error_code)::text
       from public.email_messages where id = current_setting('email_test.m2')::bigint),
    row('failed', 'email_dispatch_interrupted')::text,
    'it fails visibly instead of being sent a second time by itself');

-- The simulated provider.
select set_config('email_test.m3', (public.queue_quote_email(
    9851, (select v1 from email_test_ids where quote_id = 9851),
    'beto.finanzas@cliente-correo.test', 'Simulada', 'Hola: {{quote_link}}',
    '98510000-0000-0000-0000-0000000000d1')).id::text, true);
select count(*) from public.claim_email_messages(1, current_setting('email_test.m3')::bigint);
select public.complete_email_message(current_setting('email_test.m3')::bigint, 'simulated');

select is(
    (select row(status, accepted_at is null, delivered_at is null)::text
       from public.email_messages where id = current_setting('email_test.m3')::bigint),
    row('simulated', true, true)::text,
    'a simulated send is recorded as simulated: never accepted, never delivered');

--
-- 6. Revisions
--
-- A message waits for 9853 while its quotation is revised.
select set_config('email_test.m4', (public.queue_quote_email(
    9853, (select v1 from email_test_ids where quote_id = 9853),
    'ana.compras@cliente-correo.test', 'En espera', 'Hola: {{quote_link}}',
    '98510000-0000-0000-0000-0000000000e1')).id::text, true);

select public.revise_quote(9853, 'el cliente pidio otro alcance');

select is(
    public.email_test_error_of($sql$
        select public.queue_quote_email(
            9853, (select v1 from email_test_ids where quote_id = 9853),
            'beto.finanzas@cliente-correo.test', 'En revision', 'Hola',
            '98510000-0000-0000-0000-0000000000e2') $sql$),
    '23514:email_quote_not_shareable', 'a quotation being revised cannot be shared');

select is(
    public.email_quote_share_block(9853, (select v1 from email_test_ids where quote_id = 9853)),
    'quote_revision_open', 'because its revision is open');

select is(
    (select count(*)::int from public.claim_email_messages(1, current_setting('email_test.m4')::bigint)),
    0, 'the message that was waiting is not handed to the dispatcher');

select is(
    (select row(status, error_code, error)::text
       from public.email_messages where id = current_setting('email_test.m4')::bigint),
    row('canceled', 'email_quote_not_shareable', 'quote_revision_open')::text,
    'it is canceled, with the reason');

-- 9851 was shared as version 1; it is now revised, re-priced and re-issued.
select set_config('email_test.m1_row',
    (select m::text from public.email_messages m
      where m.id = current_setting('email_test.m1')::bigint), true);

select public.revise_quote(9851, 'nuevo precio');
update public.quote_lines set unit_price = 999
 where version_id = (select v.id from public.quote_versions v
                      where v.quote_id = 9851 and v.issued_at is null);
select public.issue_quote_version(9851);

select is(
    (select m::text from public.email_messages m
      where m.id = current_setting('email_test.m1')::bigint),
    current_setting('email_test.m1_row'),
    'after a revision with new prices, the message sent before is exactly what it was');

select is(
    public.email_quote_share_block(9851, (select v1 from email_test_ids where quote_id = 9851)),
    'version_superseded', 'the version it shared can no longer be sent: the link opens the new one');

select is(
    (public.queue_quote_email(
        9851, (select v.id from public.quote_versions v
                where v.quote_id = 9851 and v.version_number = 2),
        'ana.compras@cliente-correo.test', 'Version 2', 'Hola: {{quote_link}}',
        '98510000-0000-0000-0000-0000000000e3')).variables ->> 'quote_version',
    '2', 'the new version is shared as itself');

--
-- 7. The history is not rewritten
--
select is(
    public.email_test_error_of(format(
        'update public.email_messages set body_text = ''otra cosa'' where id = %s',
        current_setting('email_test.m1'))),
    '23514:email_message_frozen', 'what a message said cannot be changed, even by the service role');

select is(
    public.email_test_error_of(format(
        'delete from public.email_messages where id = %s', current_setting('email_test.m1'))),
    '42501', 'and a message cannot be deleted');

select ok(public.purge_emails() >= 1, 'the retention path removes them');

select * from finish();
rollback;
