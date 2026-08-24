--
-- Per-member budget allocation, and the drill-down cube the dashboard charts.
--
-- The product claim being tested: the dashboard's breakdown always reconciles
-- with the total it sits under. Three things can break that and none of them is
-- visible in the UI — an allocation pairing one team's budget with another
-- team's member, an allocation surviving the member's removal from the team,
-- and a cube counting deals the team header does not.
--
-- Also covers the deliberate NON-constraint: a split that overshoots the team
-- budget is accepted, because reallocating between two people is two writes and
-- rejecting the first would make the edit impossible. The UI reports it; the
-- database does not refuse it.
--
begin;

select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('96111111-0000-0000-0000-000000000001', 'alloc.admin@test.local', '{"first_name":"Ana","last_name":"Admin"}'::jsonb),
  ('96111111-0000-0000-0000-000000000002', 'alloc.rep1@test.local',  '{"first_name":"Rosa","last_name":"Rep"}'::jsonb),
  ('96111111-0000-0000-0000-000000000003', 'alloc.rep2@test.local',  '{"first_name":"Ruben","last_name":"Rep"}'::jsonb);

update public.sales set id = 9601, role = 'admin' where user_id = '96111111-0000-0000-0000-000000000001';
update public.sales set id = 9602, role = 'rep'   where user_id = '96111111-0000-0000-0000-000000000002';
update public.sales set id = 9603, role = 'rep'   where user_id = '96111111-0000-0000-0000-000000000003';

insert into public.teams (id, name) values (9601, 'Equipo A'), (9602, 'Equipo B');

-- Rosa is in both teams on purpose: it is the case a per-person quota would get
-- wrong, and the reason the allocation is keyed on the membership.
insert into public.team_members (id, team_id, sales_id) values
  (9601, 9601, 9602),
  (9602, 9601, 9603),
  (9603, 9602, 9602);

insert into public.team_budgets (id, team_id, period_start, period_end, amount)
values (9601, 9601, date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date, 1000000),
       (9602, 9602, date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date, 400000);

--
-- Deals for the cube: two inside the period in different months, one outside
-- it, one archived. Only the first two may ever reach a chart.
--
insert into public.deals (id, name, stage, amount, sales_id, team_id, expected_closing_date)
values
  (9601, 'A ganada', 'won',         300000, 9602, 9601, date_trunc('year', current_date)::date),
  (9602, 'A abierta','opportunity', 200000, 9602, 9601,
         (date_trunc('year', current_date) + interval '1 month')::date),
  (9603, 'A futura', 'won',         999999, 9603, 9601,
         (date_trunc('year', current_date) + interval '2 years')::date);

insert into public.deals (id, name, stage, amount, sales_id, team_id, expected_closing_date, archived_at)
values (9604, 'A archivada', 'won', 888888, 9602, 9601, current_date, now());

select set_config(
    'request.jwt.claims',
    '{"sub":"96111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. The happy path, and the two shapes of a corrupt allocation.
--
select lives_ok(
    $$insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
      values (9601, 9601, 9601, 600000)$$,
    'a member of the team can be given a slice of its budget');

--
--    The one that matters: team A's budget handed to team B's member. Such a
--    row sums into A's allocated total while appearing in no roster, so the
--    first symptom is a figure that does not match its own breakdown.
--
select throws_ok(
    $$insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
      values (9601, 9601, 9603, 100000)$$,
    '23503',
    null,
    'an allocation pairing one team''s budget with another team''s member is rejected');

select throws_ok(
    $$insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
      values (9601, 9601, 9602, -1)$$,
    '23514',
    null,
    'a negative allocation is rejected');

select throws_ok(
    $$insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
      values (9601, 9601, 9601, 250000)$$,
    '23505',
    null,
    'the same member cannot be allocated twice in one period');

--
-- 2. The projection. Both views have to agree with what was written.
--
select is(
    (select allocated_amount from public.teams_summary where id = 9601),
    600000::numeric,
    'teams_summary reports what is already handed out');

select is(
    (select budget_amount from public.team_members_summary where id = 9601),
    600000::numeric,
    'the roster carries the member''s own quota');

select is(
    (select budget_amount from public.team_members_summary where id = 9602),
    null::numeric,
    'an unallocated member has a null quota, not a quota of zero');

--
-- 3. Over-allocation is a report, not an error. Refusing it would leave a
--    manager unable to raise one quota before lowering another.
--
select lives_ok(
    $$insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
      values (9601, 9601, 9602, 900000)$$,
    'a split that overshoots the team budget is accepted');

select is(
    (select allocated_amount from public.teams_summary where id = 9601),
    1500000::numeric,
    'and is reported in full, over the budget');

select is(
    (select sum(budget_amount) from public.team_members_summary where team_id = 9601),
    (select allocated_amount from public.teams_summary where id = 9601),
    'the roster quotas sum to the team allocated total');

--
-- 4. Removing somebody from the team takes their quota with them. Without the
--    cascade the total above would keep counting a quota no roster row shows.
--
delete from public.team_members where id = 9602;

select is(
    (select allocated_amount from public.teams_summary where id = 9601),
    600000::numeric,
    'removing a member removes their allocation from the team total');

--
-- 5. Closing a period takes its allocations with it, so opening the next one
--    starts from a blank split rather than restating the last one.
--
insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
values (9602, 9602, 9603, 250000);

delete from public.team_budgets where id = 9602;

select is(
    (select count(*)::int from public.team_member_budgets where budget_id = 9602),
    0,
    'deleting a budget period deletes the split that belonged to it');

--
-- 6. The cube. Every way it could disagree with the header above it.
--
select is(
    (select sum(amount) from public.team_deal_stats
      where team_id = 9601 and stage = 'won'),
    300000::numeric,
    'the cube counts won deals inside the period only, archived excluded');

select is(
    (select count(distinct month)::int from public.team_deal_stats where team_id = 9601),
    2,
    'one row per month the period actually produced deals in');

select is(
    (select sum(amount) from public.team_deal_stats
      where team_id = 9601 and stage <> 'won'),
    (select pipeline_amount from public.teams_summary where id = 9601),
    'the cube pipeline reconciles with the team header');

select is(
    (select sum(amount) from public.team_deal_stats
      where team_id = 9601 and sales_id = 9602),
    500000::numeric,
    'the cube filters down to one member without losing the period scoping');

--
-- 7. Access. A personal quota is at least as sensitive as the team target it is
--    carved out of, so it gets the same answer.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"96111111-0000-0000-0000-000000000002","role":"authenticated"}',
    true);
set local role authenticated;

select is(
    (select count(*)::int from public.team_member_budgets),
    0,
    'a rep cannot read any allocation, not even their own');

select throws_ok(
    $$insert into public.team_member_budgets (team_id, budget_id, team_member_id, amount)
      values (9601, 9601, 9601, 1)$$,
    '42501',
    'new row violates row-level security policy for table "team_member_budgets"',
    'a rep cannot allocate a quota');

reset role;

--
-- 8. An admin can. The allocation panel has a backend to talk to.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"96111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);
set local role authenticated;

select is(
    (select count(*)::int from public.team_member_budgets where team_id = 9601),
    1,
    'an admin reads the team''s allocations');

reset role;

select * from finish();
rollback;
