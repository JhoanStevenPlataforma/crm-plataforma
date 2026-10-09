--
-- Outbound email: messages from a record, who reads them, templates and
-- settings (docs/proposals/outbound-email.md).
--
--   * a message is written from a contact, a lead, a company or a deal by
--     somebody who may read that record, to an address of that record -- a
--     free address is a manager's or an admin's to type;
--   * a message is read by its sender, by a manager and by whoever may read
--     the record, never by an unrelated rep, and nobody writes the table
--     directly;
--   * the frequency limits hold, and a switched-off or unconfigured provider
--     queues nothing;
--   * templates name only the variables their scope allows, are written by
--     admins alone, and a system one cannot be deleted;
--   * the settings and the credentials are the administrators': a secret goes
--     to Vault, is never readable by a client, and cannot be set by posting
--     the settings row;
--   * a message is on the timeline of its record;
--   * `anon` reaches nothing.
--
begin;

select plan(45);

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('98610000-0000-0000-0000-000000000001', 'mail.owner@test.local',   '{"first_name":"Olga","last_name":"Owner"}'::jsonb),
  ('98610000-0000-0000-0000-000000000002', 'mail.other@test.local',   '{"first_name":"Otto","last_name":"Otro"}'::jsonb),
  ('98610000-0000-0000-0000-000000000004', 'mail.manager@test.local', '{"first_name":"Marta","last_name":"Manager"}'::jsonb),
  ('98610000-0000-0000-0000-000000000005', 'mail.admin@test.local',   '{"first_name":"Ada","last_name":"Admin"}'::jsonb);

update public.sales set id = 9861, role = 'rep'     where user_id = '98610000-0000-0000-0000-000000000001';
update public.sales set id = 9862, role = 'rep'     where user_id = '98610000-0000-0000-0000-000000000002';
update public.sales set id = 9864, role = 'manager' where user_id = '98610000-0000-0000-0000-000000000004';
update public.sales set id = 9865, role = 'admin'   where user_id = '98610000-0000-0000-0000-000000000005';

update public.email_settings
   set provider_key = 'mock', is_enabled = true, from_email = null,
       max_per_user_hour = 1000, max_per_recipient_day = 100
 where id = 1;

insert into public.companies (id, name, sales_id, logo)
values (9861, 'Cliente Buzon', 9861, '{}'::jsonb);

insert into public.contacts (id, first_name, last_name, company_id, sales_id, email_jsonb) values
  (9861, 'Ana', 'Propia', 9861, 9861,
   '[{"email":"ana@buzon.test","type":"Work"},{"email":"ana.personal@buzon.test","type":"Home"}]'::jsonb),
  (9862, 'Beto', 'Ajeno', 9861, 9862,
   '[{"email":"beto@buzon.test","type":"Work"}]'::jsonb);

insert into public.leads (id, first_name, last_name, email, company_name, sales_id)
values (9861, 'Lía', 'Prospecto', 'lia@prospecto.test', 'Prospecto SAS', 9861);

insert into public.deals (id, name, company_id, contact_ids, stage, sales_id)
values (9861, 'Negocio Buzon', 9861, array[9861]::bigint[], 'opportunity', 9861);

--
-- 1. Writing from a record
--
select public.email_test_as('98610000-0000-0000-0000-000000000001');

select set_config('email_test.contact', (public.queue_email(
    'contact', 9861, 'ana@buzon.test', 'Hola Ana', 'Un saludo.',
    '98610000-0000-0000-0000-0000000000a1')).id::text, true);

select is(
    (select row(status, origin, entity_type::text, entity_id, contact_id, to_name, quote_id)::text
       from public.email_messages where id = current_setting('email_test.contact')::bigint),
    row('pending', 'manual', 'contact', 9861::bigint, 9861::bigint, 'Ana Propia', null::bigint)::text,
    'a message from a contact is queued on that contact, named after them');

select is(
    (select count(*)::int from jsonb_array_elements(public.email_context('contact', 9861) -> 'recipients')),
    2, 'a contact offers each of its addresses');

select is(
    (public.queue_email('lead', 9861, 'lia@prospecto.test', 'Hola', 'Un saludo.',
        '98610000-0000-0000-0000-0000000000a2')).entity_type::text,
    'lead', 'a lead is written to at its address');

select is(
    (public.queue_email('deal', 9861, 'ana@buzon.test', 'Sobre el negocio', 'Un saludo.',
        '98610000-0000-0000-0000-0000000000a3')).variables ->> 'deal_name',
    'Negocio Buzon', 'a deal is written to through its contacts');

select is(
    public.email_test_error_of($sql$
        select public.queue_email('company', 9861, 'beto@buzon.test', 'Hola', 'Un saludo.',
            '98610000-0000-0000-0000-0000000000a4') $sql$),
    '42501:email_recipient_not_allowed',
    'from a company, a rep reaches only the contacts they may read');

select set_config('email_test.company', (public.queue_email(
    'company', 9861, 'ana.personal@buzon.test', 'Hola empresa', 'Un saludo.',
    '98610000-0000-0000-0000-0000000000a5')).id::text, true);

select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9862, 'beto@buzon.test', 'Ajeno', 'Hola',
            '98610000-0000-0000-0000-0000000000a6') $sql$),
    '42501:email_forbidden', 'a rep cannot write from a contact they cannot read');

select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9861, 'cualquiera@otra.test', 'Libre', 'Hola',
            '98610000-0000-0000-0000-0000000000a7') $sql$),
    '42501:email_recipient_not_allowed', 'nor type a free address');

select is(
    public.email_test_error_of($sql$
        select public.queue_email('invoice', 1, 'ana@buzon.test', 'x', 'y',
            '98610000-0000-0000-0000-0000000000a8') $sql$),
    '23514:email_entity_invalid', 'a record kind the CRM does not mail from is refused');

select is(
    public.email_test_error_of($sql$
        select public.queue_email(null, null, 'ana@buzon.test', 'Prueba', 'Hola',
            '98610000-0000-0000-0000-0000000000a9') $sql$),
    '42501:email_forbidden', 'a message about nothing is the administrator''s test, not a rep''s');

select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9861, 'ana@buzon.test', 'x', 'y', null) $sql$),
    '23514:email_idempotency_required', 'a message without an idempotency key is refused');

select public.email_test_as('98610000-0000-0000-0000-000000000002');
select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9862, 'beto@buzon.test', 'Reuso', 'Hola',
            '98610000-0000-0000-0000-0000000000a1') $sql$),
    '42501:email_forbidden', 'somebody else''s idempotency key is not an answer to read');

select public.email_test_as('98610000-0000-0000-0000-000000000004');
select is(
    (public.queue_email('contact', 9861, 'cualquiera@otra.test', 'Libre', 'Hola',
        '98610000-0000-0000-0000-0000000000b1')).contact_id,
    null, 'a manager may type a free address; it belongs to no contact');

select public.email_test_as('98610000-0000-0000-0000-000000000005');
select is(
    (public.queue_email(null, null, 'prueba@buzon.test', 'Prueba', 'Mensaje de prueba.',
        '98610000-0000-0000-0000-0000000000b2')).origin,
    'test', 'an administrator can queue a test message');

--
-- 2. Limits, and a provider that cannot send
--
select public.email_test_as('98610000-0000-0000-0000-000000000001');

update public.email_settings set max_per_recipient_day = 1 where id = 1;
select is(
    public.email_test_error_of($sql$
        select public.queue_email('lead', 9861, 'lia@prospecto.test', 'Segundo', 'Hola',
            '98610000-0000-0000-0000-0000000000c1') $sql$),
    '23514:email_rate_limited', 'the daily limit per recipient holds');

update public.email_settings set max_per_recipient_day = 100, max_per_user_hour = 1 where id = 1;
select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9861, 'ana.personal@buzon.test', 'Otro', 'Hola',
            '98610000-0000-0000-0000-0000000000c2') $sql$),
    '23514:email_rate_limited', 'the hourly limit per sender holds');

update public.email_settings set max_per_user_hour = 1000, is_enabled = false where id = 1;
select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9861, 'ana.personal@buzon.test', 'Apagado', 'Hola',
            '98610000-0000-0000-0000-0000000000c3') $sql$),
    '23514:email_disabled', 'nothing is queued while outbound email is switched off');

update public.email_settings set is_enabled = true, provider_key = 'postmark' where id = 1;
select is(
    public.email_test_error_of($sql$
        select public.queue_email('contact', 9861, 'ana.personal@buzon.test', 'Sin llave', 'Hola',
            '98610000-0000-0000-0000-0000000000c4') $sql$),
    '23514:email_not_configured',
    'nor while the real provider has no sender address or credentials');

select is(
    (public.email_status() ->> 'is_ready')::boolean, false,
    'and the status every screen reads says it is not ready');

select is(
    (select count(*)::int from public.claim_email_messages(50)), 0,
    'the dispatcher is handed nothing either: what waits stays waiting');

update public.email_settings set provider_key = 'mock' where id = 1;

--
-- 3. Who reads a message
--
set local role authenticated;

select public.email_test_as('98610000-0000-0000-0000-000000000001');
select is(
    (select count(*)::int from public.email_messages
      where id in (current_setting('email_test.contact')::bigint,
                   current_setting('email_test.company')::bigint)),
    2, 'a rep reads the messages they sent');

select public.email_test_as('98610000-0000-0000-0000-000000000002');
select is(
    (select count(*)::int from public.email_messages where to_email like '%@buzon.test'
        or to_email like '%@prospecto.test' or to_email like '%@otra.test'),
    0, 'an unrelated rep reads none of them, a company''s included');

select public.email_test_as('98610000-0000-0000-0000-000000000004');
select ok(
    (select count(*) from public.email_messages where to_email like '%@buzon.test') >= 4,
    'a manager reads them all');

select public.email_test_as('98610000-0000-0000-0000-000000000001');
select ok(
    exists (select 1 from public.email_messages
             where entity_type = 'contact' and entity_id = 9861 and sales_id = 9864),
    'the owner of a contact reads what a manager sent from it');

select is(
    public.email_test_error_of($sql$
        insert into public.email_messages (sales_id, to_email, subject, body_text, idempotency_key)
        values (9861, 'ana@buzon.test', 'directo', 'hola', gen_random_uuid()) $sql$),
    '42501', 'nobody inserts a message directly');

select is(
    public.email_test_error_of(format(
        'update public.email_messages set status = ''delivered'' where id = %s',
        current_setting('email_test.contact'))),
    '42501', 'nor marks one delivered');

select is(
    (select count(*)::int from public.timeline_events
      where entity_type = 'contact' and entity_id = 9861 and event_type = 'email.message'),
    2, 'the messages of a contact are on its timeline, for whoever may read them');

select is(
    (select payload ->> 'subject' from public.timeline_events
      where id = 'email_message:' || current_setting('email_test.contact')),
    'Hola Ana', 'with their subject, and without their text');

--
-- 4. Settings and credentials
--
select is(
    (select count(*)::int from public.email_settings), 0,
    'a rep cannot read the settings');

select is(
    (public.email_status() ->> 'is_simulated')::boolean, true,
    'but learns from the status that sending is simulated');

select is(
    public.email_test_error_of($sql$ select public.set_email_provider_secret('credentials', 'robado') $sql$),
    '42501:email_forbidden', 'a rep cannot set the credentials');

select is(
    public.email_test_error_of($sql$ select public.get_email_provider_secret('credentials') $sql$),
    '42501', 'nor read them');

select public.email_test_as('98610000-0000-0000-0000-000000000005');

select is(
    public.email_test_error_of($sql$
        update public.email_settings
           set credentials_secret_id = gen_random_uuid() where id = 1 $sql$),
    '23514:email_settings_column_protected',
    'an admin cannot point the settings at a secret by posting the row');

select public.set_email_provider_secret('credentials', 'server-token-de-prueba');
select public.set_email_provider_secret('webhook', 'secreto-webhook-de-prueba');

select is(
    (select row(public.email_status() ->> 'has_credentials',
                public.email_status() ->> 'has_webhook_secret')::text),
    row('true', 'true')::text, 'an admin sets them, and the status says they exist');

select is(
    (select position('server-token-de-prueba' in s::text) from public.email_settings s),
    0, 'the settings row holds no secret');

update public.email_settings
   set provider_key = 'postmark', from_email = 'ventas@buzon.test', from_name = 'Ventas'
 where id = 1;

select is(
    (select row(updated_by, (public.email_status() ->> 'is_ready'))::text
       from public.email_settings),
    row(9865::bigint, 'true')::text,
    'an admin configures the sender; with credentials the provider is ready');

select is(
    public.email_test_error_of($sql$
        update public.email_settings set from_email = E'ventas@buzon.test\nBcc: x@y.test' where id = 1 $sql$),
    '23514', 'a sender address carrying a line break is refused');

reset role;

select is(
    public.get_email_provider_secret('credentials'), 'server-token-de-prueba',
    'the dispatcher reads the credentials from Vault');

select public.email_test_as('98610000-0000-0000-0000-000000000005');
select public.set_email_provider_secret('credentials', null);
select is(
    (public.email_status() ->> 'has_credentials')::boolean, false,
    'clearing the credentials removes them');

--
-- 5. Templates
--
select is(
    public.email_test_error_of($sql$
        insert into public.email_templates (key, name, subject, body, scope)
        values ('test_contact', 'Prueba', 'Hola {{customer_name}}', 'Total {{total}}', 'contact') $sql$),
    '23514:email_template_unknown_variable',
    'a template cannot name a variable its scope does not have');

select is(
    public.email_test_error_of($sql$
        insert into public.email_templates (key, name, subject, body, scope)
        values ('test_quote', 'Prueba', 'Ver {{quote_link}}', 'Hola', 'quote') $sql$),
    '23514:email_template_unknown_variable', 'nor put the quotation link in a subject');

select is(
    public.email_test_error_of($sql$
        delete from public.email_templates where key = 'quote_share' $sql$),
    '23514:email_template_locked', 'a system template cannot be deleted');

insert into public.email_templates (key, name, subject, body, scope, is_active, is_system)
values ('test_draft', 'Borrador', 'Hola {{customer_name}}', 'Un saludo, {{sender_name}}', 'contact', false, true);

select is(
    (select is_system from public.email_templates where key = 'test_draft'), false,
    'a template somebody adds is never a system one, whatever it claims');

set local role authenticated;
select public.email_test_as('98610000-0000-0000-0000-000000000001');

select is(
    (select count(*)::int from public.email_templates where key = 'test_draft'), 0,
    'an inactive template is a draft only admins see');

select is(
    public.email_test_error_of($sql$
        insert into public.email_templates (key, name, subject, body)
        values ('test_rep', 'De un rep', 'Hola', 'Hola') $sql$),
    '42501', 'a rep cannot add a template');

reset role;

--
-- 6. anon
--
select is(
    (select count(*)::int
       from (values ('email_settings'), ('email_templates'), ('email_messages')) t(name)
      where has_table_privilege('anon', 'public.' || t.name, 'select')
         or has_table_privilege('anon', 'public.' || t.name, 'insert')),
    0, 'anon reads and writes none of the email tables');

select * from finish();
rollback;
