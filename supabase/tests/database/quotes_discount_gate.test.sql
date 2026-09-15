--
-- Quotes module, discount approval (docs/proposals/quotes-cpq-module.md §3.1).
--
-- `quote_discount_gate()` is one function with two callers -- the issue RPC
-- that enforces it and the dialog that explains it -- so this file asserts both
-- what it reports and what the RPC then does:
--
--   * "no rule applies" is reported apart from "satisfied";
--   * the effective discount is read off the lines;
--   * the ceiling is the asker's, raised by a manager's approval, never lowered;
--   * inside the ceiling but above the reason band an issue needs a written
--     reason, stored on the history row -- and a written approval already is one;
--   * only an admin overrides, only in writing, and the motive is recorded only
--     when the rule was actually skipped;
--   * a quote created before the rule was switched on is not governed by it;
--   * the gate is not a probe for other people's quotes.
--
begin;

select plan(25);

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
  ('97550000-0000-0000-0000-000000000001', 'quotes.gate.rep@test.local',   '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('97550000-0000-0000-0000-000000000002', 'quotes.gate.mgr@test.local',   '{"first_name":"Mario","last_name":"Manager"}'::jsonb),
  ('97550000-0000-0000-0000-000000000003', 'quotes.gate.adm@test.local',   '{"first_name":"Alma","last_name":"Admin"}'::jsonb),
  ('97550000-0000-0000-0000-000000000004', 'quotes.gate.other@test.local', '{"first_name":"Otto","last_name":"Otro"}'::jsonb);

update public.sales set id = 9751, role = 'rep'     where user_id = '97550000-0000-0000-0000-000000000001';
update public.sales set id = 9752, role = 'manager' where user_id = '97550000-0000-0000-0000-000000000002';
update public.sales set id = 9753, role = 'admin'   where user_id = '97550000-0000-0000-0000-000000000003';
update public.sales set id = 9754, role = 'rep'     where user_id = '97550000-0000-0000-0000-000000000004';

insert into public.companies (id, name, sales_id, logo)
values (9751, 'Cliente Descuentos', 9751, '{}'::jsonb);

-- All owned by the rep. 9753 predates the rule by two days.
insert into public.quotes (id, company_id, sales_id, currency, created_at) values
  (9751, 9751, 9751, 'COP', now()),
  (9752, 9751, 9751, 'COP', now()),
  (9753, 9751, 9751, 'COP', now() - interval '2 days'),
  (9754, 9751, 9751, 'COP', now()),
  (9755, 9751, 9751, 'COP', now()),
  (9756, 9751, 9751, 'COP', now());

-- 9751: 1000 at 30% plus 1000 at 0% -> 15% effective, one offending line.
insert into public.quote_lines (version_id, name, quantity, unit_price, discount_percent, "position")
select v.id, l.name, 1, 1000, l.disc, l.pos
  from public.quote_versions v
  join (values (9751, 'Con descuento', 30, 1), (9751, 'Sin descuento', 0, 2),
               (9752, 'Servicio', 5, 1), (9753, 'Servicio', 30, 1),
               (9754, 'Servicio', 20, 1), (9755, 'Servicio', 50, 1),
               (9756, 'Servicio', 8, 1))
       as l(quote_id, name, disc, pos) on l.quote_id = v.quote_id;

-- The admin ceiling is lowered for this file only: at the seeded 100% an admin
-- never needs an override, and the override path would go untested.
update public.quote_discount_rules set max_discount_percent = 40 where role = 'admin';

-- Stated rather than inherited from the seed: the rep must give a reason above
-- 5%. 9752 sits exactly on the line (5%, no reason), 9756 above it (8%).
update public.quote_discount_rules set requires_reason_above = 5 where role = 'rep';

--
-- 1. Rule switched off (the seeded state).
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97550000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quote_discount_gate(9751) -> 'max_allowed',
    'null'::jsonb,
    'with the rule switched off no ceiling applies');

select is(
    (public.quote_discount_gate(9751) ->> 'ok')::boolean,
    true,
    'and the gate reports ok, separately from the absent ceiling');

reset role;
update public.quote_discount_rules set enforced_from = now() - interval '1 day';
set local role authenticated;

--
-- 2. The rep.
--
select is(
    (select (g ->> 'max_allowed') || '/' || (g ->> 'effective_discount_percent') || '/' || (g ->> 'ok')
       from public.quote_discount_gate(9751) as g),
    '10.00/15.00/false',
    'the effective discount comes from the lines and is compared with the rep ceiling');

select is(
    jsonb_array_length(public.quote_discount_gate(9751) -> 'offending_line_ids'),
    1,
    'the gate points at the line that breaks the rule, not at the whole document');

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9751)$$),
    '23514:quote_discount_exceeds_limit',
    'a rep cannot issue above their ceiling');

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9751, 30, null, 'Me lo autorizo yo')$$),
    '23514:quote_discount_exceeds_limit',
    'a rep passing an override is ignored and still refused');

select is(
    (select status_key from public.quotes where id = 9751),
    'draft',
    'a refused issue leaves the quote a draft');

select lives_ok(
    $$select public.issue_quote_version(9752)$$,
    'a discount inside the ceiling and not above the reason band issues without ceremony');

select is(
    (select (g ->> 'ok') || '/' || (g ->> 'reason_required')
       from public.quote_discount_gate(9756) as g),
    'true/true',
    'inside the ceiling but above the reason band, the gate asks for a reason');

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9756)$$),
    '23514:quote_discount_reason_required',
    'and the issue refuses to go out without one');

select lives_ok(
    $$select public.issue_quote_version(9756, 30, null, null, 'Cliente nuevo, precio de entrada')$$,
    'the rep issues it with the reason written');

select is(
    public.quote_discount_gate(9753) -> 'max_allowed',
    'null'::jsonb,
    'a quote created before the rule was switched on is not governed by it');

select lives_ok(
    $$select public.transition_quote(9754, 'pending_approval')$$,
    'the rep sends the 20% quote up for approval');

--
-- 3. The manager.
--
select set_config('request.jwt.claims',
    '{"sub":"97550000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
    $$select public.transition_quote(9754, 'approved', 'Cliente de volumen, margen revisado')$$,
    'a manager approves it in writing');

select is(
    public.quote_discount_gate(9751) ->> 'max_allowed',
    '25.00',
    'the gate is evaluated against the role of whoever asks');

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9755, 30, null, 'Lo apruebo yo')$$),
    '23514:quote_discount_exceeds_limit',
    'a manager cannot override past their own ceiling');

--
-- 4. Back to the rep, with the approval.
--
select set_config('request.jwt.claims',
    '{"sub":"97550000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select (g ->> 'max_allowed') || '/' || (g ->> 'approved_by_role') || '/' || (g ->> 'ok')
            || '/' || (g ->> 'reason_required')
       from public.quote_discount_gate(9754) as g),
    '25.00/manager/true/false',
    'an approval raises the rep ceiling to the approver''s, and its written reason covers the band');

select lives_ok(
    $$select public.issue_quote_version(9754)$$,
    'the rep issues the approved quote');

--
-- 5. Somebody else's quote.
--
select set_config('request.jwt.claims',
    '{"sub":"97550000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.quote_discount_gate(9751)$$),
    'P0002',
    'the gate does not reveal whether a colleague''s quote exists');

--
-- 6. The admin.
--
select set_config('request.jwt.claims',
    '{"sub":"97550000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9755)$$),
    '23514:quote_discount_exceeds_limit',
    'an admin above their own ceiling is refused too, until they write why');

select lives_ok(
    $$select public.issue_quote_version(9755, 30, null, 'Cliente estrategico, autorizado por direccion')$$,
    'an admin overrides the rule in writing');

reset role;

select is(
    (select override_reason from public.quote_status_changes
      where quote_id = 9755 and to_status = 'sent'),
    'Cliente estrategico, autorizado por direccion',
    'the override motive is stored on the history row');

select is(
    (select reason || '/' || coalesce(override_reason, 'none')
       from public.quote_status_changes
      where quote_id = 9756 and to_status = 'sent'),
    'Cliente nuevo, precio de entrada/none',
    'the band reason is stored on the sent history row, and is not an override');

select is(
    (select count(*)::int from public.quote_status_changes
      where quote_id between 9751 and 9755 and override_reason is not null),
    1,
    'only the move that actually skipped the rule carries an override marker');

select is(
    (select override_reason from public.quote_status_changes
      where quote_id = 9752 and to_status = 'sent'),
    null::text,
    'an issue that met the rule is not marked as having skipped it');

select * from finish();
rollback;
