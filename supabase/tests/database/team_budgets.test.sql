--
-- Team budgets and the deal -> team link the budget dashboard reports on.
--
-- The product claim being tested: a quota is not public. `teams` is readable by
-- everyone so a rep can see which team a task belongs to, and it would be easy
-- to assume `team_budgets` inherited that — it does not, and nothing in the UI
-- would reveal the difference. Only the policy proves it.
--
-- Also covers the two ways the dashboard can lie: overlapping budget periods
-- (which make "the vigente budget" ambiguous) and amounts that leak in from
-- outside the period they are compared against.
--
begin;

select plan(18);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('97111111-0000-0000-0000-000000000001', 'budget.admin@test.local', '{"first_name":"Bea","last_name":"Admin"}'::jsonb),
  ('97111111-0000-0000-0000-000000000002', 'budget.rep@test.local',   '{"first_name":"Raul","last_name":"Rep"}'::jsonb);

update public.sales set id = 9701, role = 'admin'
where user_id = '97111111-0000-0000-0000-000000000001';
update public.sales set id = 9702, role = 'rep'
where user_id = '97111111-0000-0000-0000-000000000002';

insert into public.teams (id, name) values (9701, 'Renovaciones');
insert into public.team_members (team_id, sales_id) values (9701, 9702);

insert into public.team_budgets (id, team_id, period_start, period_end, amount)
values (9701, 9701, date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
        1000000);

--
-- Deals: two inside the budget period (one won, one open), one outside it, and
-- one archived. Only the first two may ever reach the dashboard.
--
insert into public.deals (id, name, stage, amount, sales_id, team_id, expected_closing_date)
values
  (9701, 'Renovacion A', 'won',         300000, 9702, 9701, current_date),
  (9702, 'Renovacion B', 'opportunity', 200000, 9702, 9701, current_date),
  (9703, 'Renovacion C', 'won',         999999, 9702, 9701,
         (date_trunc('year', current_date) + interval '2 years')::date);

insert into public.deals (id, name, stage, amount, sales_id, team_id, expected_closing_date, archived_at)
values (9704, 'Renovacion D', 'won', 888888, 9702, 9701, current_date, now());

select set_config(
    'request.jwt.claims',
    '{"sub":"97111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. Overlapping periods are refused. Without this the LATERAL that picks "the
--    budget containing today" has more than one row to choose from, and the
--    dashboard shows a number that changes between page loads.
--
select throws_ok(
    $$insert into public.team_budgets (team_id, period_start, period_end, amount)
      values (9701, current_date, current_date + 10, 500000)$$,
    '23P01',
    null,
    'a budget period overlapping an existing one is rejected');

select lives_ok(
    $$insert into public.team_budgets (team_id, period_start, period_end, amount)
      values (9701, (date_trunc('year', current_date) + interval '1 year')::date,
                    (date_trunc('year', current_date) + interval '2 years - 1 day')::date,
                    1500000)$$,
    'a budget for a later period is accepted alongside the current one');

--
-- 2. A budget cannot end before it starts, and cannot be negative.
--
select throws_ok(
    $$insert into public.team_budgets (team_id, period_start, period_end, amount)
      values (9701, '2030-12-31', '2030-01-01', 100)$$,
    '23514',
    null,
    'a period that ends before it starts is rejected');

select throws_ok(
    $$insert into public.team_budgets (team_id, period_start, period_end, amount)
      values (9701, '2031-01-01', '2031-12-31', -1)$$,
    '23514',
    null,
    'a negative budget is rejected');

--
-- 3. The projection. Each of these is a way the dashboard could quietly lie.
--
select is(
    (select budget_amount from public.teams_summary where id = 9701),
    1000000::numeric,
    'teams_summary reports the budget of the period containing today');

select is(
    (select won_amount from public.teams_summary where id = 9701),
    300000::numeric,
    'won_amount counts only won deals inside the budget period');

select is(
    (select pipeline_amount from public.teams_summary where id = 9701),
    200000::numeric,
    'pipeline_amount counts only open deals inside the budget period');

select is(
    (select nb_deals::int from public.teams_summary where id = 9701),
    3,
    'nb_deals counts live deals of the team, archived excluded');

--
-- 4. A team with no budget for today reports nulls, not zeros: "no target" and
--    "a target of nothing" are different statements, and the UI renders them
--    differently.
--
insert into public.teams (id, name) values (9702, 'Sin presupuesto');

select is(
    (select budget_amount from public.teams_summary where id = 9702),
    null::numeric,
    'a team with no budget for the period reports a null budget');

select is(
    (select won_amount from public.teams_summary where id = 9702),
    0::numeric,
    'and zero won, rather than null');

--
-- 4b. The roster. Its whole job is to explain the team header, so the test
--     that matters is that it adds up to it. A breakdown that does not
--     reconcile with the total above it discredits the total.
--
insert into public.contacts (id, first_name, last_name, sales_id)
values (9702, 'Luis', 'Perez', 9702);

select is(
    (select sum(won_amount) from public.team_members_summary where team_id = 9701),
    (select won_amount from public.teams_summary where id = 9701),
    'the roster won amounts sum to the team won amount');

select is(
    (select sum(pipeline_amount) from public.team_members_summary where team_id = 9701),
    (select pipeline_amount from public.teams_summary where id = 9701),
    'the roster pipeline amounts sum to the team pipeline amount');

select is(
    (select first_name || ' ' || last_name from public.team_members_summary
      where team_id = 9701 and sales_id = 9702),
    'Raul Rep',
    'the roster carries the member identity, so the UI needs no second lookup');

select is(
    (select nb_contacts::int from public.team_members_summary
      where team_id = 9701 and sales_id = 9702),
    1,
    'nb_contacts counts what the member owns, unscoped by team or period');

--
--     A deal booked to another team still counts in `nb_deals_all` but not in
--     `nb_deals`. That gap is the roster's signal that somebody is selling
--     outside the team they are rostered in; collapsing the two would hide it.
--
insert into public.teams (id, name) values (9703, 'Otro equipo');
insert into public.deals (id, name, stage, amount, sales_id, team_id, expected_closing_date)
values (9705, 'Fuera de equipo', 'opportunity', 111111, 9702, 9703, current_date);

select is(
    (select nb_deals_all::int - nb_deals::int from public.team_members_summary
      where team_id = 9701 and sales_id = 9702),
    1,
    'a deal booked to another team widens nb_deals_all without moving nb_deals');

--
-- 5. Access. A quota is admin/manager only — read included.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"97111111-0000-0000-0000-000000000002","role":"authenticated"}',
    true);
set local role authenticated;

select is(
    (select count(*)::int from public.team_budgets),
    0,
    'a rep cannot read any budget, not even their own team''s');

select throws_ok(
    $$insert into public.team_budgets (team_id, period_start, period_end, amount)
      values (9701, '2032-01-01', '2032-12-31', 1)$$,
    '42501',
    'new row violates row-level security policy for table "team_budgets"',
    'a rep cannot set a budget');

reset role;

--
-- 6. An admin can. The management UI has a backend to talk to.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"97111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);
set local role authenticated;

select is(
    (select count(*)::int from public.team_budgets where team_id = 9701),
    2,
    'an admin reads the team budgets');

reset role;

select * from finish();
rollback;
