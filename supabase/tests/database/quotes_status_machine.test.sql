--
-- Quotes module, the status machine (docs/proposals/quotes-cpq-module.md §3).
--
-- The RPC is the only way a quote changes status, and every change it makes is
-- legal, attributed and explained. Concretely:
--
--   * a bare UPDATE of `status_key` is refused;
--   * the graph lives in `quote_transitions`, and a move with no edge is refused;
--   * `allowed_actor` holds: an internal path cannot drive a customer move and the
--     reverse -- this is what stops the future portal from approving a quote;
--   * `requires_reason` and `requires_issued_version` hold;
--   * approving is a manager's move, never the owner's;
--   * the history row carries both ends, the actor, the reason and a per-quote
--     sequence, and a reason set for one quote is never inherited by another.
--
begin;

select plan(18);

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('97330000-0000-0000-0000-000000000001', 'quotes.status.rep@test.local', '{"first_name":"Raul","last_name":"Rep"}'::jsonb),
  ('97330000-0000-0000-0000-000000000003', 'quotes.status.mgr@test.local', '{"first_name":"Mia","last_name":"Manager"}'::jsonb);

update public.sales set id = 9731, role = 'rep'     where user_id = '97330000-0000-0000-0000-000000000001';
update public.sales set id = 9733, role = 'manager' where user_id = '97330000-0000-0000-0000-000000000003';

insert into public.companies (id, name, sales_id, logo)
values (9731, 'Cliente Estados', 9731, '{}'::jsonb);

insert into public.quotes (id, company_id, sales_id, currency) values
  (9731, 9731, 9731, 'COP'),
  (9732, 9731, 9731, 'COP');

--
-- 1. The write path, as the table owner.
--
select is(
    public.quotes_test_error_of($$update public.quotes set status_key = 'sent' where id = 9731$$),
    '23514',
    'a bare UPDATE of the status is refused, even for the table owner');

select ok(
    not exists (select 1 from public.quote_transitions
                 where from_status_key = 'accepted' and to_status_key = 'draft'),
    'there is no edge that reopens an accepted quote');

select is(
    public.quotes_test_error_of($$select public.apply_quote_status(9731, 'pending_approval', null, 'customer')$$),
    '42501:quote_transition_actor_not_allowed',
    'a customer cannot drive an internal move');

select is(
    public.quotes_test_error_of($$select public.apply_quote_status(9731, 'pending_approval', null, null)$$),
    '23514',
    'an unnamed actor is refused rather than slipping past the actor check');

select is(
    public.quotes_test_error_of($$select public.apply_quote_status(9731, 'accepted', null, 'internal')$$),
    '23514:quote_transition_illegal',
    'a move with no edge in quote_transitions is illegal');

--
-- 2. The owner.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97330000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.transition_quote(9731, 'sent')$$),
    '23514:quote_not_issued',
    'a quote cannot be sent before a version was issued');

select lives_ok(
    $$select public.transition_quote(9731, 'pending_approval')$$,
    'the owner requests approval');

select is(
    public.quotes_test_error_of($$select public.transition_quote(9731, 'pending_approval')$$),
    '23514:quote_status_unchanged',
    'moving a quote to the status it is in is refused, not recorded');

select is(
    public.quotes_test_error_of($$select public.transition_quote(9731, 'draft')$$),
    '23514:quote_reason_required',
    'sending a quote back needs a reason');

select is(
    public.quotes_test_error_of($$select public.transition_quote(9731, 'approved', 'Me apruebo')$$),
    '42501:quote_approval_requires_manager',
    'the owner cannot approve their own quote');

select matches(
    public.quotes_test_error_of($$select public.apply_quote_status(9731, 'canceled', 'x', 'customer')$$),
    '^42501',
    'the shared core is not callable by users, who could otherwise name any actor');

--
-- 3. The manager approves.
--
select set_config('request.jwt.claims',
    '{"sub":"97330000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select lives_ok(
    $$select public.transition_quote(9731, 'approved', 'Margen revisado con finanzas')$$,
    'a manager approves in writing');

reset role;

select is(
    (select array_agg(from_status || '>' || to_status order by seq)
       from public.quote_status_changes where quote_id = 9731),
    array['draft>pending_approval', 'pending_approval>approved'],
    'both ends of every transition are recorded, in order');

select is(
    (select array_agg(seq order by seq) from public.quote_status_changes where quote_id = 9731),
    array[1, 2]::bigint[],
    'the sequence orders moves that share a transaction timestamp');

select is(
    (select array_agg(sales_id order by seq) from public.quote_status_changes where quote_id = 9731),
    array[9731, 9733]::bigint[],
    'each move is attributed to whoever made it, from the session');

select is(
    (select reason from public.quote_status_changes where quote_id = 9731 and to_status = 'approved'),
    'Margen revisado con finanzas',
    'the approval carries its written reason');

select is(
    (select array_agg(distinct actor_kind) from public.quote_status_changes where quote_id = 9731),
    array['internal'],
    'moves made through the RPC are internal');

--
-- 4. The scoping guard (the `deals_log_stage_change` lesson).
--
-- Settings prepared for quote 9731 are left in place while quote 9732 changes
-- status in the same transaction. `revise_quote()` touches a quote twice in one
-- transaction, so without the guard the second write inherits the first reason.
select set_config('app.quote_status_quote_id', '9731', true);
select set_config('app.quote_status_reason', 'Motivo de otra cotizacion', true);
select set_config('app.quote_transition_to', 'pending_approval', true);

update public.quotes set status_key = 'pending_approval' where id = 9732;

select set_config('app.quote_transition_to', '', true);
select set_config('app.quote_status_reason', '', true);
select set_config('app.quote_status_quote_id', '', true);

select is(
    (select reason from public.quote_status_changes where quote_id = 9732),
    null::text,
    'a reason prepared for one quote is never recorded on another');

select * from finish();
rollback;
