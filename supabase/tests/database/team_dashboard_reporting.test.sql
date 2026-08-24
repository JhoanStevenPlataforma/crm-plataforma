--
-- The reporting columns the team dashboards read.
--
-- Two defects are pinned here, because both were invisible from the UI and
-- neither can be caught by a unit test:
--
--   1. `pipeline_amount` used `stage <> 'won'`, so every lost deal was reported
--      as forecast. The CRM's own pipeline screen has always excluded them, so
--      the two screens disagreed about the same team's pipeline.
--   2. `nb_open_tasks` counted on `task_statuses.is_open` while every index and
--      every task list filters on the columns. The two disagree on an archived
--      task and on a task whose completion was recorded without its status
--      following, and the counter is a headline figure on three screens.
--
-- Also covers the flow/stock split the new columns rest on: what is open has no
-- month, what was completed has one, and `team_task_stats` must file a task
-- under the month it was CREATED and the month it was COMPLETED, which are
-- usually not the same month.
--
begin;

select plan(17);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('97222222-0000-0000-0000-000000000001', 'report.admin@test.local', '{"first_name":"Ada","last_name":"Admin"}'::jsonb),
  ('97222222-0000-0000-0000-000000000002', 'report.rep@test.local',   '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('97222222-0000-0000-0000-000000000003', 'report.peer@test.local',  '{"first_name":"Pau","last_name":"Peer"}'::jsonb);

update public.sales set id = 9801, role = 'admin'
where user_id = '97222222-0000-0000-0000-000000000001';
update public.sales set id = 9802, role = 'rep'
where user_id = '97222222-0000-0000-0000-000000000002';
update public.sales set id = 9803, role = 'rep'
where user_id = '97222222-0000-0000-0000-000000000003';

insert into public.teams (id, name) values (9801, 'Reporting');
insert into public.team_members (id, team_id, sales_id) values
  (9801, 9801, 9802),
  (9802, 9801, 9803);

insert into public.team_budgets (id, team_id, period_start, period_end, amount)
values (9801, 9801,
        date_trunc('year', current_date)::date,
        (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
        1000000);

--
-- One won deal, one still open, one lost. Only the middle one is pipeline.
--
insert into public.deals (id, name, stage, amount, sales_id, team_id, expected_closing_date)
values
  (9801, 'Ganada',  'won',         300000, 9802, 9801, current_date),
  (9802, 'Abierta', 'opportunity', 200000, 9802, 9801, current_date),
  (9803, 'Perdida', 'lost',        150000, 9802, 9801, current_date);

--
-- Tasks. Anchored to fixed offsets inside the budget period rather than to
-- `now()`, so the month a row is filed under never depends on the day the suite
-- runs. Only the two "is it late right now" cases use `now()`, because that is
-- exactly what they are about.
--
insert into public.tasks
  (id, title, task_type_id, status_id, priority_id, owner_sales_id, created_by,
   created_at, due_date, completed_at, completed_by, archived_at)
select
  t.id,
  t.title,
  (select id from public.task_types limit 1),
  (select id from public.task_statuses where key = t.status_key),
  (select id from public.task_priorities where key = 'normal'),
  9802,
  9802,
  t.created_at,
  t.due_date,
  t.completed_at,
  t.completed_by,
  t.archived_at
from (values
  -- T1: open and past due.
  (9801, 'Vencida', 'pending',
   date_trunc('year', current_date) + interval '6 months 15 days',
   now() - interval '5 days', null::timestamptz, null::bigint, null::timestamptz),
  -- T2: open and due inside the week.
  (9802, 'Proxima', 'pending',
   date_trunc('year', current_date) + interval '6 months 15 days',
   now() + interval '3 days', null, null, null),
  -- T3: completed before its due date.
  (9803, 'Cerrada a tiempo', 'completed',
   date_trunc('year', current_date) + interval '6 months 15 days',
   date_trunc('year', current_date) + interval '6 months 22 days',
   date_trunc('year', current_date) + interval '6 months 20 days', 9802::bigint, null),
  -- T4: completed after its due date.
  (9804, 'Cerrada tarde', 'completed',
   date_trunc('year', current_date) + interval '6 months 15 days',
   date_trunc('year', current_date) + interval '6 months 17 days',
   date_trunc('year', current_date) + interval '6 months 20 days', 9802::bigint, null),
  -- T5: completed, never had a due date. Cannot be late.
  (9805, 'Cerrada sin fecha', 'completed',
   date_trunc('year', current_date) + interval '6 months 15 days',
   null, date_trunc('year', current_date) + interval '6 months 20 days', 9802::bigint, null),
  -- T6: the drift case. Completion recorded on the columns while the status row
  -- still says the task is open. The old counter called this open; the task
  -- list never did.
  (9806, 'Estado desincronizado', 'pending',
   date_trunc('year', current_date) + interval '6 months 15 days',
   date_trunc('year', current_date) + interval '6 months 21 days',
   date_trunc('year', current_date) + interval '6 months 20 days', 9802::bigint, null),
  -- T7: archived, and open on every other column.
  (9807, 'Archivada', 'pending',
   date_trunc('year', current_date) + interval '6 months 15 days',
   now() + interval '30 days', null, null, now()),
  -- T8: completed two years ago, outside every period under test.
  (9808, 'Fuera de periodo', 'completed',
   current_date - interval '2 years',
   current_date - interval '2 years',
   current_date - interval '2 years', 9802::bigint, null),
  -- T9: created in one month, completed in another. The two-date-base case.
  (9809, 'Cruza de mes', 'completed',
   date_trunc('year', current_date) + interval '1 month',
   null, date_trunc('year', current_date) + interval '3 months', 9802::bigint, null)
) as t(id, title, status_key, created_at, due_date, completed_at, completed_by, archived_at);

-- The peer's single task exists only to prove the cube does not widen access.
insert into public.tasks
  (id, title, task_type_id, status_id, priority_id, owner_sales_id, created_by, created_at)
values
  (9810, 'Del compañero',
   (select id from public.task_types limit 1),
   (select id from public.task_statuses where key = 'pending'),
   (select id from public.task_priorities where key = 'normal'),
   9803, 9803, date_trunc('year', current_date) + interval '6 months 15 days');

select set_config(
    'request.jwt.claims',
    '{"sub":"97222222-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1-4. Lost is not pipeline. This is the defect: `stage <> 'won'` reported the
--      150k lost deal as forecast, so the team looked like it had 350k in play.
--
select is(
    (select pipeline_amount from public.teams_summary where id = 9801),
    200000::numeric,
    'pipeline_amount counts the open deal and not the lost one');

select is(
    (select lost_amount from public.teams_summary where id = 9801),
    150000::numeric,
    'lost_amount reports what left the pipeline instead of hiding it');

select is(
    (select nb_won from public.teams_summary where id = 9801),
    1::bigint,
    'nb_won counts the decided wins');

select is(
    (select nb_lost from public.teams_summary where id = 9801),
    1::bigint,
    'nb_lost counts the decided losses');

--
-- 5. The roster has to use the same definition, or it stops adding up to the
--    header it sits under.
--
select is(
    (select pipeline_amount from public.team_members_summary where id = 9801),
    200000::numeric,
    'the member pipeline excludes the lost deal too');

--
-- 6-7. "Open" is the column predicate. T6 records a completion while its status
--      row still says pending, and T7 is archived: the old `is_open` counter
--      called both of them open, and the task list called neither.
--
select is(
    (select nb_open_tasks from public.team_members_summary where id = 9801),
    2::bigint,
    'nb_open_tasks counts only the two genuinely open tasks');

select is(
    (select nb_tasks_overdue from public.team_members_summary where id = 9801),
    1::bigint,
    'nb_tasks_overdue counts the past-due open task and not the completed ones');

select is(
    (select nb_tasks_due_next_7d from public.team_members_summary where id = 9801),
    1::bigint,
    'nb_tasks_due_next_7d ignores a task already completed inside the window');

--
-- 9-10. Completed work is windowed, and the two counters share a denominator so
--       the on-time rate can never exceed 100%.
--
select is(
    (select nb_tasks_completed from public.team_members_summary where id = 9801),
    5::bigint,
    'nb_tasks_completed excludes the one completed outside the period');

select is(
    (select nb_tasks_completed_on_time from public.team_members_summary where id = 9801),
    4::bigint,
    'a task with no due date counts as on time, and only the late one does not');

--
-- 11-12. The workload report aggregates the roster, so it has to agree with the
--        members underneath it. It is a separate view from `teams_summary` for
--        a measured reason -- as columns there it cost the dashboard query 330
--        ms against 35 ms, and PostgREST asks for every column, so the plain
--        team list paid it too.
--
select is(
    (select nb_open_tasks from public.team_workload_summary where team_id = 9801),
    (select coalesce(sum(nb_open_tasks), 0)::bigint
       from public.team_members_summary where team_id = 9801),
    'the team open-task counter reconciles with its roster');

select is(
    (select nb_tasks_overdue from public.team_workload_summary where team_id = 9801),
    1::bigint,
    'the team overdue counter sees the same late task the roster does');

--
-- 13-15. The cube files a task under the month it was CREATED and the month it
--        was COMPLETED. T9 is the only task in either of its two months, so the
--        two bases can be told apart.
--
select is(
    (select nb_created from public.team_task_stats
      where team_id = 9801 and sales_id = 9802
        and month = (date_trunc('year', current_date) + interval '1 month')::date),
    1::bigint,
    'the cube files a task under the month it was created');

select is(
    (select nb_completed from public.team_task_stats
      where team_id = 9801 and sales_id = 9802
        and month = (date_trunc('year', current_date) + interval '3 months')::date),
    1::bigint,
    'the same task is filed again under the month it was completed');

select is(
    (select avg_cycle_hours from public.team_task_stats
      where team_id = 9801 and sales_id = 9802
        and month = (date_trunc('year', current_date) + interval '1 month')::date),
    null::numeric,
    'a month with nothing completed reports no cycle time rather than zero');

--
-- 16. The cube is scoped to the period, so the two-year-old task is absent from
--     it entirely -- on both of its date bases.
--
select is(
    (select coalesce(sum(nb_created), 0)::bigint from public.team_task_stats
      where team_id = 9801 and sales_id = 9802),
    8::bigint,
    'the cube leaves out the task created outside the period');

--
-- 17. security_invoker, so the cube inherits the RLS on tasks. A rep must not
--     read a colleague's workload just because they share a team: the view adds
--     no access of its own.
--
set local role authenticated;
select set_config(
    'request.jwt.claims',
    '{"sub":"97222222-0000-0000-0000-000000000002","role":"authenticated"}',
    true);

select is(
    (select count(*) from public.team_task_stats
      where team_id = 9801 and sales_id = 9803),
    0::bigint,
    'a rep reads no cube row for a teammate whose tasks they cannot see');

reset role;

select * from finish();
rollback;
