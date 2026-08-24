--
-- Team dashboards: stronger reporting data.
--
-- Three things, in one migration because they are one change:
--
--   1. `pipeline_amount` stops counting lost deals. `stage <> 'won'` booked
--      dead money as forecast on `teams_summary` and `team_members_summary`,
--      while the CRM dashboard has always excluded it (`DealsPipeline` filters
--      `stage@neq lost`). The two screens reported different pipelines for the
--      same team.
--   2. `nb_open_tasks` stops counting on `task_statuses.is_open` and counts on
--      the columns instead, so it equals the list it links to and matches the
--      `tasks_owner_open_due` partial index. The definitions disagree on an
--      archived task.
--   3. New reporting columns (won/lost counts, workload) and a new
--      `team_task_stats` flow cube.
--
-- Every view is replaced with CREATE OR REPLACE and every new column is
-- APPENDED, never inserted. A generated `db diff` would have emitted
-- DROP ... CASCADE here, which silently takes dependent objects with it.
--


-- Backs the new completed-task counters. Every existing task index is partial
-- ON completed_at BEING NULL -- the exact complement of this query -- so none
-- of them can serve it.
-- "Everything this person owns", whatever state it is in. Every other owner
-- index is partial, so the single-pass workload counters matched none of them
-- and the planner fell back to a full scan of `tasks` per member.
create index if not exists tasks_owner_all
    on public.tasks (owner_sales_id)
    where deleted_at is null;

create index if not exists tasks_owner_completed
    on public.tasks (owner_sales_id, completed_at)
    where completed_at is not null and deleted_at is null;






--
-- teams_summary
--
create or replace view public.teams_summary with (security_invoker = on) as
select
    t.id,
    t.name,
    t.description,
    t.created_at,
    (select count(*) from public.team_members m where m.team_id = t.id) as nb_members,
    b.id           as budget_id,
    b.amount       as budget_amount,
    b.period_start as budget_period_start,
    b.period_end   as budget_period_end,
    -- Lost is not pipeline. `stage <> 'won'` counted dead deals as forecast,
    -- which the CRM dashboard has never done (`DealsPipeline` filters
    -- `stage@neq lost`), so the two screens disagreed about the same money.
    -- Everything still live -- including `delayed` -- stays in.
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.team_id = t.id
        and d.archived_at is null
        and d.stage not in ('won', 'lost')
        and d.expected_closing_date between b.period_start and b.period_end
    ) as pipeline_amount,
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.team_id = t.id
        and d.archived_at is null
        and d.stage = 'won'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as won_amount,
    (select count(*) from public.deals d
      where d.team_id = t.id and d.archived_at is null
    ) as nb_deals,
    -- How much of the target is already handed out to members. A team with no
    -- budget for the period has no allocations either — they cascade off the
    -- budget row — so this reads 0 rather than null: nothing has been handed
    -- out, which is a fact, unlike "there is no target".
    (select coalesce(sum(mb.amount), 0) from public.team_member_budgets mb
      where mb.budget_id = b.id
    ) as allocated_amount,

    -- What the period lost, and the two counts a win rate needs. Derived here
    -- rather than in the browser because the dashboard reads only this view:
    -- without them a manager sees how much was won but never what share of the
    -- attempts that was.
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.team_id = t.id
        and d.archived_at is null
        and d.stage = 'lost'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as lost_amount,
    (select count(*) from public.deals d
      where d.team_id = t.id
        and d.archived_at is null
        and d.stage = 'won'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as nb_won,
    (select count(*) from public.deals d
      where d.team_id = t.id
        and d.archived_at is null
        and d.stage = 'lost'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as nb_lost
from public.teams t
left join lateral (
    select tb.id, tb.amount, tb.period_start, tb.period_end
      from public.team_budgets tb
     where tb.team_id = t.id
       and current_date between tb.period_start and tb.period_end
     order by tb.period_start desc
     limit 1
) b on true;


--
-- team_members_summary
--
create or replace view public.team_members_summary
with (security_invoker = on) as
select
    m.id,
    m.team_id,
    m.sales_id,
    m.created_at,
    s.first_name,
    s.last_name,
    s.email,
    s.role,
    s.disabled,
    (select count(*) from public.contacts c
      where c.sales_id = m.sales_id) as nb_contacts,
    (select count(*) from public.companies co
      where co.sales_id = m.sales_id) as nb_companies,
    (select count(*) from public.deals d
      where d.sales_id = m.sales_id and d.archived_at is null) as nb_deals_all,
    (select count(*) from public.deals d
      where d.sales_id = m.sales_id
        and d.team_id = m.team_id
        and d.archived_at is null) as nb_deals,
    -- `not in ('won', 'lost')`, exactly as on the team header above: the
    -- roster only reconciles with the total it sits under while both use the
    -- same definition of pipeline.
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.sales_id = m.sales_id
        and d.team_id = m.team_id
        and d.archived_at is null
        and d.stage not in ('won', 'lost')
        and d.expected_closing_date between b.period_start and b.period_end
    ) as pipeline_amount,
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.sales_id = m.sales_id
        and d.team_id = m.team_id
        and d.archived_at is null
        and d.stage = 'won'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as won_amount,
    -- Counted on the COLUMNS, not on `task_statuses.is_open`, and no longer
    -- joining the catalogue at all. The two definitions disagree on an archived
    -- task, and this counter is a link: it has to equal the list it opens
    -- (`OPEN_TASK_FILTER` in `taskBuckets.ts`) and match the predicate of the
    -- `tasks_owner_open_due` partial index.
    (select count(*) from public.tasks tk
      where tk.owner_sales_id = m.sales_id
        and tk.deleted_at is null
        and tk.archived_at is null
        and tk.completed_at is null
        and tk.canceled_at is null) as nb_open_tasks,
    -- The member's own slice of the team target for this period. Null, not
    -- zero, when nothing was allocated: "no target" and "a target of nothing"
    -- render differently, and only one of them is true here.
    (select mb.amount from public.team_member_budgets mb
      where mb.budget_id = b.id and mb.team_member_id = m.id) as budget_amount,

    -- Workload, per member. Same ownership scoping and the same flow/stock
    -- split as the team header: `nb_open_tasks` and `nb_tasks_overdue` are a
    -- snapshot of now, `nb_tasks_completed*` are what happened inside the
    -- window.
    --
    -- Overdue is a SUBSET of open, not a sibling of it -- a stacked chart must
    -- subtract before it stacks, or it double counts every late task. The
    -- honest counter is the one that matches the list, so open stays inclusive
    -- and the subtraction happens where it is visible (`taskWorkload.ts`).
    (select count(*) from public.tasks tk
      where tk.owner_sales_id = m.sales_id
        and tk.deleted_at is null
        and tk.archived_at is null
        and tk.completed_at is null
        and tk.canceled_at is null
        and tk.due_date < now()) as nb_tasks_overdue,
    -- The actionable end of the same stock: what lands this week. A manager
    -- cannot act on "42 open", only on what is about to be late.
    (select count(*) from public.tasks tk
      where tk.owner_sales_id = m.sales_id
        and tk.deleted_at is null
        and tk.archived_at is null
        and tk.completed_at is null
        and tk.canceled_at is null
        and tk.due_date >= now()
        and tk.due_date < now() + interval '7 days') as nb_tasks_due_next_7d,
    (select count(*) from public.tasks tk
      where tk.owner_sales_id = m.sales_id
        and tk.deleted_at is null
        and tk.completed_at is not null
        and tk.completed_at::date between
              coalesce(b.period_start, date_trunc('year', current_date)::date)
          and coalesce(b.period_end,
                       (date_trunc('year', current_date) + interval '1 year - 1 day')::date)
    ) as nb_tasks_completed,
    -- A task with no due date cannot be late, so it counts as on time. The
    -- alternative -- excluding it -- would make the ratio's denominator differ
    -- from `nb_tasks_completed`, and two counters that look comparable but are
    -- not is how a rate ends up above 100%.
    (select count(*) from public.tasks tk
      where tk.owner_sales_id = m.sales_id
        and tk.deleted_at is null
        and tk.completed_at is not null
        and (tk.due_date is null or tk.completed_at <= tk.due_date)
        and tk.completed_at::date between
              coalesce(b.period_start, date_trunc('year', current_date)::date)
          and coalesce(b.period_end,
                       (date_trunc('year', current_date) + interval '1 year - 1 day')::date)
    ) as nb_tasks_completed_on_time
from public.team_members m
join public.sales s on s.id = m.sales_id
left join lateral (
    select tb.id, tb.period_start, tb.period_end
      from public.team_budgets tb
     where tb.team_id = m.team_id
       and current_date between tb.period_start and tb.period_end
     order by tb.period_start desc
     limit 1
) b on true;

--
-- A team's workload: what its members are carrying, right now.
--
-- Its OWN view rather than four more columns on `teams_summary`, and the
-- reasoning is measured, not aesthetic. As columns there the counters cost the
-- dashboard 330 ms against 35 ms for the same query without them (4 teams, 40
-- reps, 200k tasks) -- and PostgREST asks for `select=*`, so EVERY reader paid
-- it, including the plain `/teams` list, which has no use for a task count.
-- Workload is a report about a team, not a property of the team record.
--
-- One pass per member, not four. `count(*) filter (...)` computes all four
-- counters from a single scan of that member's tasks;


--
-- team_workload_summary
--
create or replace view public.team_workload_summary
with (security_invoker = on) as
select
    t.id as id,
    t.id as team_id,
    coalesce(w.nb_open_tasks, 0)::bigint        as nb_open_tasks,
    coalesce(w.nb_tasks_overdue, 0)::bigint     as nb_tasks_overdue,
    coalesce(w.nb_tasks_due_next_7d, 0)::bigint as nb_tasks_due_next_7d,
    coalesce(w.nb_tasks_completed, 0)::bigint   as nb_tasks_completed
from public.teams t
left join lateral (
    select tb.period_start, tb.period_end
      from public.team_budgets tb
     where tb.team_id = t.id
       and current_date between tb.period_start and tb.period_end
     order by tb.period_start desc
     limit 1
) b on true
left join lateral (
    select sum(x.open_tasks)   as nb_open_tasks,
           sum(x.overdue)      as nb_tasks_overdue,
           sum(x.due_next_7d)  as nb_tasks_due_next_7d,
           sum(x.completed)    as nb_tasks_completed
      from public.team_members tm
      cross join lateral (
          select
            count(*) filter (
              where tk.archived_at is null
                and tk.completed_at is null
                and tk.canceled_at is null) as open_tasks,
            count(*) filter (
              where tk.archived_at is null
                and tk.completed_at is null
                and tk.canceled_at is null
                and tk.due_date < now()) as overdue,
            count(*) filter (
              where tk.archived_at is null
                and tk.completed_at is null
                and tk.canceled_at is null
                and tk.due_date >= now()
                and tk.due_date < now() + interval '7 days') as due_next_7d,
            -- An archived task still counts as completed: it was done inside
            -- the period, and archiving it afterwards does not undo the work.
            count(*) filter (
              where tk.completed_at is not null
                and tk.completed_at::date between
                      coalesce(b.period_start, date_trunc('year', current_date)::date)
                  and coalesce(b.period_end,
                               (date_trunc('year', current_date) + interval '1 year - 1 day')::date)
            ) as completed
          from public.tasks tk
         where tk.owner_sales_id = tm.sales_id
           and tk.deleted_at is null
      ) x
     where tm.team_id = t.id
) w on true;


--
-- team_task_stats
--
create or replace view public.team_task_stats with (security_invoker = on) as
with period as (
    select t.id as team_id,
           coalesce(b.period_start, date_trunc('year', current_date)::date)
               as period_start,
           coalesce(b.period_end,
                    (date_trunc('year', current_date) + interval '1 year - 1 day')::date)
               as period_end
      from public.teams t
      left join lateral (
          select tb.period_start, tb.period_end
            from public.team_budgets tb
           where tb.team_id = t.id
             and current_date between tb.period_start and tb.period_end
           order by tb.period_start desc
           limit 1
      ) b on true
),
events as (
    select p.team_id,
           tk.owner_sales_id as sales_id,
           date_trunc('month', tk.created_at)::date as month,
           1 as created,
           0 as completed,
           0 as on_time,
           null::numeric as cycle_seconds
      from period p
      join public.team_members tm on tm.team_id = p.team_id
      join public.tasks tk on tk.owner_sales_id = tm.sales_id
     where tk.deleted_at is null
       and tk.created_at::date between p.period_start and p.period_end
    union all
    select p.team_id,
           tk.owner_sales_id,
           date_trunc('month', tk.completed_at)::date,
           0,
           1,
           case when tk.due_date is null or tk.completed_at <= tk.due_date
                then 1 else 0 end,
           extract(epoch from (tk.completed_at - tk.created_at))::numeric
      from period p
      join public.team_members tm on tm.team_id = p.team_id
      join public.tasks tk on tk.owner_sales_id = tm.sales_id
     where tk.deleted_at is null
       and tk.completed_at is not null
       and tk.completed_at::date between p.period_start and p.period_end
)
select team_id || '-' || sales_id || '-' || to_char(month, 'YYYY-MM') as id,
       team_id,
       sales_id,
       month,
       sum(created)::bigint            as nb_created,
       sum(completed)::bigint          as nb_completed,
       sum(on_time)::bigint            as nb_completed_on_time,
       -- Null, not 0, for a month where nothing was completed: `avg` over no
       -- rows has no answer, and 0 would draw a bar claiming tasks closed
       -- instantly.
       round(avg(cycle_seconds) / 3600.0, 1) as avg_cycle_hours
  from events
 group by team_id, sales_id, month;


grant select on table public.team_workload_summary to authenticated;
grant select on table public.team_workload_summary to service_role;
grant select on table public.team_task_stats to authenticated;
grant select on table public.team_task_stats to service_role;
