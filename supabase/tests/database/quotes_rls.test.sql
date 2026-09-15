--
-- Quotes module, permissions (docs/proposals/quotes-cpq-module.md §7).
--
-- `canAccess.ts` only decides which buttons render. Everything asserted here is
-- the boundary that holds when somebody skips the UI and talks to PostgREST:
--
--   * a rep reads and writes their own quotes only, and cannot hand one away;
--   * nobody deletes a quote -- it ends as canceled;
--   * the catalogue is read by everyone and written by managers;
--   * the discount ceiling and the transition graph are tuned by admins only --
--     a manager editing either would be overriding a control for everyone;
--   * a comment belongs to its author, and nobody signed in can speak as the
--     customer;
--   * the token table is not readable at all.
--
begin;

select plan(26);

create function public.quotes_test_error_of(p_sql text) returns text
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

-- The draft version id of a quote, readable whoever is asking: the assertions
-- below need to aim a write at a row the current user cannot see.
create function public.quotes_test_draft_of(p_quote_id bigint) returns bigint
    language sql security definer
    set search_path to ''
as $$
    select v.id from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is null;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('97220000-0000-0000-0000-000000000001', 'quotes.rls.repa@test.local', '{"first_name":"Ana","last_name":"RepA"}'::jsonb),
  ('97220000-0000-0000-0000-000000000002', 'quotes.rls.repb@test.local', '{"first_name":"Beto","last_name":"RepB"}'::jsonb),
  ('97220000-0000-0000-0000-000000000003', 'quotes.rls.mgr@test.local',  '{"first_name":"Marta","last_name":"Manager"}'::jsonb),
  ('97220000-0000-0000-0000-000000000004', 'quotes.rls.adm@test.local',  '{"first_name":"Adan","last_name":"Admin"}'::jsonb);

update public.sales set id = 9721, role = 'rep'     where user_id = '97220000-0000-0000-0000-000000000001';
update public.sales set id = 9722, role = 'rep'     where user_id = '97220000-0000-0000-0000-000000000002';
update public.sales set id = 9723, role = 'manager' where user_id = '97220000-0000-0000-0000-000000000003';
update public.sales set id = 9724, role = 'admin'   where user_id = '97220000-0000-0000-0000-000000000004';

insert into public.companies (id, name, sales_id, logo)
values (9721, 'Cliente RLS', 9721, '{}'::jsonb);

insert into public.quotes (id, company_id, sales_id, currency) values
  (9721, 9721, 9721, 'COP'),
  (9722, 9721, 9722, 'COP');

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Linea', 1, 100 from public.quote_versions v where v.quote_id in (9721, 9722);

--
-- 1. Rep A.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97220000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select array_agg(id order by id) from public.quotes where id in (9721, 9722)),
    array[9721::bigint],
    'a rep sees their own quote and not a colleague''s');

select is(
    (select array_agg(id order by id) from public.quotes_summary where id in (9721, 9722)),
    array[9721::bigint],
    'quotes_summary applies the same scoping');

select is(
    (select count(*)::int from public.quote_lines where quote_id = 9722),
    0,
    'a colleague''s quote lines are invisible');

select matches(
    public.quotes_test_error_of($$update public.quotes set sales_id = 9722 where id = 9721$$),
    '^42501',
    'a rep cannot hand their own quote to somebody else');

select is(
    public.quotes_test_error_of($$delete from public.quotes where id = 9721$$),
    '42501',
    'nobody deletes a quote, its owner included: a quote ends as canceled');

select matches(
    public.quotes_test_error_of(format(
        $$insert into public.quote_lines (version_id, name, quantity, unit_price) values (%s, 'Intrusa', 1, 1)$$,
        public.quotes_test_draft_of(9722))),
    '^42501',
    'a rep cannot add a line to a colleague''s quote');

select matches(
    public.quotes_test_error_of(
        $$insert into public.products (sku, name, currency) values ('TST-9721-R', 'Del rep', 'COP')$$),
    '^42501',
    'a rep cannot write the catalogue');

select ok(
    exists (select 1 from public.tax_rates where code = 'iva_19'),
    'a rep can read the catalogue they quote from');

select matches(
    public.quotes_test_error_of($$select count(*) from public.quote_access_tokens$$),
    '^42501',
    'the token table is not readable at all; only its summary view is');

select is(
    array[public.can_see_quote(9721), public.can_see_quote(9722)],
    array[true, false],
    'the storage predicate agrees with the quotes select policy');

select matches(
    public.quotes_test_error_of($$select public.transition_quote(9722, 'pending_approval')$$),
    '^42501',
    'a rep cannot move a colleague''s quote through the RPC either');

--
-- 2. Rep B, on their own quote.
--
select set_config('request.jwt.claims',
    '{"sub":"97220000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- Posts somebody else's id as the author; the session must win.
insert into public.quote_comments (quote_id, author_sales_id, body)
values (9722, 9721, 'Nota interna sobre el presupuesto del cliente');

select is(
    (select author_sales_id from public.quote_comments where quote_id = 9722),
    9722::bigint,
    'the comment author comes from the session, not from the request body');

select is(
    (select visibility from public.quote_comments where quote_id = 9722),
    'internal',
    'a comment is internal unless somebody chose to share it');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quote_comments (quote_id, author_kind, author_name, visibility, body)
          values (9722, 'customer', 'Cliente falso', 'shared', 'Acepto la oferta')$$),
    '^42501',
    'a signed-in user cannot post a comment in a customer''s name');

select lives_ok(
    $$select public.transition_quote(9722, 'pending_approval')$$,
    'the owner requests approval on their own quote');

--
-- 3. The manager.
--
select set_config('request.jwt.claims',
    '{"sub":"97220000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
    (select array_agg(id order by id) from public.quotes where id in (9721, 9722)),
    array[9721::bigint, 9722::bigint],
    'a manager sees every quote');

-- A comment is deleted softly, through the same update (Phase 8): nobody holds
-- the DELETE privilege to try the other way.
update public.quote_comments set body = 'Reescrito por el manager' where quote_id = 9722;
update public.quote_comments set deleted_at = now() where quote_id = 9722;

select is(
    (select body || '/' || (deleted_at is null)::text
       from public.quote_comments where quote_id = 9722),
    'Nota interna sobre el presupuesto del cliente/true',
    'a manager reads a rep''s comment but can neither rewrite nor delete it');

-- Both of these match no row under the admin-only policies. They are asserted
-- after `reset role` below, because a refused UPDATE succeeds silently.
update public.quote_discount_rules set max_discount_percent = 100 where role = 'rep';
update public.quote_transitions set allowed_actor = 'any'
 where from_status_key = 'draft' and to_status_key = 'sent';

select lives_ok(
    $$insert into public.products (sku, name, currency) values ('TST-9723-M', 'Del manager', 'COP')$$,
    'a manager maintains the catalogue');

select lives_ok(
    $$update public.quotes set sales_id = 9722 where id = 9721$$,
    'a manager may reassign a quote');

--
-- 4. The admin.
--
select set_config('request.jwt.claims',
    '{"sub":"97220000-0000-0000-0000-000000000004","role":"authenticated"}', true);

update public.quote_discount_rules set requires_reason_above = 7.00 where role = 'rep';

reset role;

select is(
    (select max_discount_percent from public.quote_discount_rules where role = 'rep'),
    10.00::numeric,
    'a manager cannot raise a discount ceiling');

select is(
    (select allowed_actor from public.quote_transitions
      where from_status_key = 'draft' and to_status_key = 'sent'),
    'internal',
    'a manager cannot change who may drive a transition');

select is(
    (select requires_reason_above from public.quote_discount_rules where role = 'rep'),
    7.00::numeric,
    'an admin tunes the discount rule');

select is(
    (select sales_id from public.quotes where id = 9721),
    9722::bigint,
    'the reassignment made by the manager landed');

select is(
    (select to_status from public.quote_status_changes where quote_id = 9722),
    'pending_approval',
    'the owner''s approval request is on the trail');

--
-- 5. The trail, from outside the quote.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97220000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select count(*)::int from public.quote_status_changes where quote_id = 9722),
    0,
    'a rep cannot read the history of a colleague''s quote');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quote_status_changes (quote_id, to_status, seq) values (9722, 'accepted', 99)$$),
    '^42501',
    'nobody writes the audit trail directly');

reset role;

select * from finish();
rollback;
