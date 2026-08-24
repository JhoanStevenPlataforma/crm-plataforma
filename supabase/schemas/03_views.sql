--
-- Views
-- This file declares all views in the public schema.
--

create or replace view public.activity_log with (security_invoker = on) as
select
    ('company.' || c.id || '.created') as id,
    'company.created' as type,
    c.created_at as date,
    c.id as company_id,
    c.sales_id,
    to_json(c.*) as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.companies c
union all
select
    ('contact.' || co.id || '.created') as id,
    'contact.created' as type,
    co.first_seen as date,
    co.company_id,
    co.sales_id,
    null::json as company,
    to_json(co.*) as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.contacts co
union all
select
    ('contactNote.' || cn.id || '.created') as id,
    'contactNote.created' as type,
    cn.date,
    co.company_id,
    cn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    to_json(cn.*) as contact_note,
    null::json as deal_note
from public.contact_notes cn
    left join public.contacts co on co.id = cn.contact_id
union all
select
    ('deal.' || d.id || '.created') as id,
    'deal.created' as type,
    d.created_at as date,
    d.company_id,
    d.sales_id,
    null::json as company,
    null::json as contact,
    to_json(d.*) as deal,
    null::json as contact_note,
    null::json as deal_note
from public.deals d
union all
select
    ('dealNote.' || dn.id || '.created') as id,
    'dealNote.created' as type,
    dn.date,
    d.company_id,
    dn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    to_json(dn.*) as deal_note
from public.deal_notes dn
    left join public.deals d on d.id = dn.deal_id;

--
-- The `nb_*` columns are scalar subqueries rather than a join + GROUP BY on
-- purpose. Aggregating over the join forced Postgres to group the entire table
-- before applying ORDER BY ... LIMIT, so opening page 1 of the list cost
-- ~580 ms on 20k companies / 100k deals. As a subquery the count is only
-- evaluated for the rows that survive the LIMIT: ~5 ms for the same page.
--
create or replace view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    (select count(*) from public.deals d where d.company_id = c.id) as nb_deals,
    (select count(*) from public.contacts co where co.company_id = c.id) as nb_contacts
from public.companies c;

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    -- Same rewrite as companies_summary: the previous join + GROUP BY over
    -- tasks aggregated all 200k contacts before the LIMIT (~1.1 s per page for
    -- a manager). As a subquery, page 1 costs well under a millisecond.
    -- Soft-deleted tasks do not count as open work.
    (select count(*) from public.tasks t
      where t.contact_id = co.id
        and t.done_date is null
        and t.deleted_at is null) as nb_tasks
from public.contacts co
    left join public.companies c on co.company_id = c.id;

--
-- The list/detail projection of a task (proposal §3.4, §15).
--
-- Every task list has to render a status chip, a priority badge, a type icon
-- and the record the task hangs off. Resolving those from the client would be
-- four extra round trips per page; resolving them with a join + GROUP BY would
-- reintroduce exactly the regression documented on `companies_summary`. The
-- catalogues are small, so they are plain joins; the primary link is a LATERAL
-- with LIMIT 1, which — like a scalar subquery — is only evaluated for the rows
-- that survive ORDER BY ... LIMIT.
--
-- Writes never go through this view: the frontend writes `public.tasks` (and
-- `transition_task()` for status changes), and reads this.
--
--
-- Teams, with the one number the list needs (deliverable 2.4).
--
-- `nb_members` is a scalar subquery, not a join plus GROUP BY — the rule
-- documented on `contacts_summary` applies to every counter in this file.
--
-- The budget columns come from the period that contains today, picked with a
-- LATERAL ... LIMIT 1 — the same shape as the primary link above, and for the
-- same reason: it is only evaluated for the rows that survive ORDER BY ... LIMIT.
--
-- The deal amounts are scalar subqueries for the reason documented on
-- `contacts_summary`, and they are scoped to the budget period, so
-- `won_amount` against `budget_amount` is a like-for-like comparison. A team
-- with no vigente budget gets NULL period bounds, which makes every `between`
-- false and the amounts 0 — the dashboard renders it as "no budget set" rather
-- than as a team that sold nothing.
--
-- `stage = 'won'` is the same literal the frontend uses in
-- `defaultDealPipelineStatuses`; renaming that stage in the app configuration
-- would need this view updated too.
--
-- security_invoker stays on, so the numbers are already role-correct: a rep
-- reading this view aggregates only the deals their own RLS lets them see,
-- while a manager sees the whole team.
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
-- Who is in a team, and what they are carrying (the dashboard's roster).
--
-- The deal figures are scoped to BOTH the member's ownership and the team's
-- budget period, which is what makes the roster reconcile with the team header
-- above: sum `won_amount` over a team's members and you get the team's
-- `won_amount`, to the cent. A roster whose rows do not add up to the total it
-- sits under is worse than no roster, because it is the total that gets
-- doubted.
--
-- Deliberately NOT scoped that way:
--   * `nb_contacts` / `nb_companies` — those records have no team and no
--     period. They answer "what does this person own", which is the question
--     the manager is actually asking when drilling into a member.
--   * `nb_deals_all` — every live deal they own, including ones attributed to
--     another team. The gap against `nb_deals` is the signal that somebody is
--     selling outside the team they are rostered in.
--
-- Every counter is a scalar subquery, per the rule documented on
-- `contacts_summary`. security_invoker stays on, so a rep sees only the rows
-- their own RLS allows and a manager sees the team as it really is.
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
-- counters from a single scan of that member's tasks; four separate subqueries
-- scanned the same rows four times. The per-member correlation is what keeps
-- the partial indexes (`tasks_owner_open_due`, `tasks_owner_completed`) in
-- play: written as one `in (select sales_id ...)` semi-join across the team,
-- the planner chose a full scan of `tasks` once per team.
--
-- STOCK, not flow, except for `nb_tasks_completed`. "How many are open" has no
-- month, which is why none of this lives in `team_task_stats`. The completed
-- counter is the one flow figure here and carries the same window as the deal
-- amounts, falling back to the calendar year.
--
-- `nb_tasks_overdue` is a SUBSET of `nb_open_tasks`, never a sibling: anything
-- stacking them must subtract first, or every late task is drawn twice.
--
-- Tasks hang off their OWNER, resolved through `team_members`: a task has no
-- team column and no period, exactly like `nb_contacts` on the roster. A rep
-- rostered in two teams therefore counts in both, and these figures reconcile
-- with none of the money on `teams_summary`.
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
-- The drill-down cube: one row per team, member, month and stage.
--
-- A GROUP BY here rather than the scalar subqueries the list views use, and for
-- the opposite reason: this view IS the aggregate, there is no
-- ORDER BY ... LIMIT for a premature grouping to defeat, and both filters the
-- UI applies (`team_id`, `sales_id`) are grouping columns, so the predicate
-- reaches the deals scan.
--
-- One cube instead of a monthly view plus a by-stage view: the drill-down pages
-- read it once and fold it two ways in the browser, over the tens of rows a
-- single team's period produces.
--
-- Scoped to the team's current budget period so the charts reconcile with the
-- header they sit under, falling back to the calendar year for a team with no
-- budget — an empty chart there would read as "sold nothing" rather than "no
-- period to report on".
--
create or replace view public.team_deal_stats with (security_invoker = on) as
select
    t.id || '-' || coalesce(d.sales_id, 0) || '-'
        || to_char(date_trunc('month', d.expected_closing_date), 'YYYY-MM')
        || '-' || d.stage as id,
    t.id       as team_id,
    d.sales_id,
    date_trunc('month', d.expected_closing_date)::date as month,
    d.stage,
    count(*)                   as nb_deals,
    coalesce(sum(d.amount), 0) as amount
from public.teams t
join public.deals d
  on d.team_id = t.id
 and d.archived_at is null
 and d.expected_closing_date is not null
left join lateral (
    select tb.period_start, tb.period_end
      from public.team_budgets tb
     where tb.team_id = t.id
       and current_date between tb.period_start and tb.period_end
     order by tb.period_start desc
     limit 1
) b on true
where d.expected_closing_date
        between coalesce(b.period_start, date_trunc('year', current_date)::date)
            and coalesce(b.period_end,
                         (date_trunc('year', current_date) + interval '1 year - 1 day')::date)
group by t.id, d.sales_id, date_trunc('month', d.expected_closing_date), d.stage;

--
-- The task-flow cube: one row per team, member and month.
--
-- The counterpart to `team_deal_stats`, and split from it for a reason worth
-- stating once: the two cubes answer questions with different date bases. A
-- deal belongs to the month it is expected to close in; a task belongs to the
-- month it was created in AND to the month it was completed in, which are
-- rarely the same month and sometimes not even the same period.
--
-- FLOW ONLY. Everything here happened inside the window. The stock questions --
-- how many are open, how many are late -- have no month and live as scalar
-- counters on `team_members_summary`; a cube cannot answer them, because "open
-- right now" is not an event that occurred in March.
--
-- The `union all` is what lets one row carry both date bases: each task
-- contributes a row for the month it was created and, if it was completed in
-- the window, another for the month it was completed. Grouping the two together
-- afterwards gives created-vs-completed per month, which is the only shape that
-- shows a member accumulating a backlog rather than working one.
--
-- Cycle time is measured `completed_at - created_at` rather than read from
-- `tasks.total_open_seconds`: that counter is trigger-maintained and reads 0 on
-- every task that predates the trigger, and a chart cannot tell "instant" from
-- "never recorded". The subtraction is exact for every row, always.
--
-- Scoped to the team's current budget period, falling back to the calendar
-- year, exactly like `team_deal_stats` -- so a member's task chart and their
-- deal chart cover the same months and can be read side by side.
--
-- security_invoker stays on: task rows are filtered by `can_see_task`, so a rep
-- charts only their own work and a manager charts the team's.
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

create or replace view public.tasks_summary with (security_invoker = on) as
select
    t.id,

    -- content
    t.title,
    t.description,

    -- classification
    t.task_type_id,
    t.status_id,
    t.priority_id,

    -- scheduling
    t.due_date,
    t.start_at,
    t.completed_at,
    t.completed_by,
    t.canceled_at,
    t.cancel_reason,

    -- ownership
    t.owner_sales_id,
    t.created_by,

    -- lifecycle bookkeeping
    t.created_at,
    t.updated_at,
    t.deleted_at,
    t.deleted_by,
    t.archived_at,

    -- traceability counters (§3.4) — what the list badges render
    t.reschedule_count,
    t.reassign_count,
    t.comment_count,
    t.attachment_count,
    t.checklist_total,
    t.checklist_done,
    t.blocked_seconds,
    t.total_open_seconds,
    t.source,

    -- legacy shims: the current frontend still reads these (Appendix C step 7)
    t.contact_id,
    t.text,
    t.type,
    t.done_date,
    t.sales_id,

    -- denormalized catalogues
    s.key as status_key,
    s.label as status_label,
    s.color as status_color,
    s.is_open as status_is_open,
    s.is_terminal as status_is_terminal,
    s.counts_as_done,

    p.key as priority_key,
    p.label as priority_label,
    p.color as priority_color,
    p.rank as priority_rank,
    p.sla_hours,

    ty.key as type_key,
    ty.label as type_label,
    ty.icon as type_icon,

    -- Same reasoning as contacts_summary.company_name: the owner's name is on
    -- every row of every list, so it is resolved once here.
    nullif(btrim(concat_ws(' ', o.first_name, o.last_name)), '') as owner_name,

    -- The primary link drives the breadcrumb and the "regarding" label (§14.2).
    pl.entity_type::text as primary_entity_type,
    pl.entity_id         as primary_entity_id,
    pl.entity_label      as primary_entity_label,

    -- Display-only. Real filtering uses the raw columns so the partial indexes
    -- `tasks_overdue` / `tasks_owner_open_due` still apply (§18.3).
    (t.due_date < now()
     and t.completed_at is null
     and t.canceled_at is null
     and t.deleted_at is null) as is_overdue
from public.tasks t
    join public.task_statuses s on s.id = t.status_id
    join public.task_priorities p on p.id = t.priority_id
    join public.task_types ty on ty.id = t.task_type_id
    left join public.sales o on o.id = t.owner_sales_id
    left join lateral (
        select l.entity_type, l.entity_id, l.entity_label
        from public.task_links l
        where l.task_id = t.id
          and l.is_primary
          and l.unlinked_at is null
        limit 1
    ) pl on true;

--
-- The unified timeline (§6.2)
--
-- `activity_log` unions five tables and omits tasks entirely (W9): the CRM's
-- own timeline does not know tasks exist. This view is the replacement — the
-- task event stream merged with the surrounding note activity, so a user reads
-- one chronological story instead of three disconnected ones.
--
-- `security_invoker = on` means every branch is filtered by its own table's
-- RLS: task events resolve through `can_see_task`, notes through their
-- ownership policies. There is no place here where the union widens access.
--
-- PERFORMANCE CAVEAT (§6.2). A `UNION ALL` cannot push a LIMIT into every
-- branch once the sort spans branches, so this is the Phase-2 shape and not the
-- final one. At the volumes in §18 it becomes a materialized `timeline` table
-- fed by the same triggers. The column list is deliberately the shape that
-- table will have, so the swap is invisible to the frontend: filter on
-- `entity_type` + `entity_id` and never on a computed column.
--
create or replace view public.timeline_events with (security_invoker = on) as
select
    'task_event:' || e.id            as id,
    e.occurred_at                    as occurred_at,
    e.event_type::text               as event_type,
    'task'                           as source,
    e.task_id                        as task_id,
    e.actor_sales_id                 as actor_sales_id,
    e.actor_kind                     as actor_kind,
    -- The entity the event hangs off, so a contact or deal page can filter
    -- without joining task_links itself.
    pl.entity_type::text             as entity_type,
    pl.entity_id                     as entity_id,
    jsonb_build_object('field', e.field, 'old', e.old_value,
                       'new', e.new_value, 'meta', e.metadata,
                       'note', e.note)  as payload
from public.task_events e
    left join lateral (
        select l.entity_type, l.entity_id
        from public.task_links l
        where l.task_id = e.task_id
          and l.is_primary
          and l.unlinked_at is null
        limit 1
    ) pl on true

union all

select
    'contact_note:' || n.id, n.date, 'note.created', 'contact_note',
    null::bigint, n.sales_id, 'user',
    'contact', n.contact_id,
    jsonb_build_object('text', n.text, 'status', n.status,
                       'contact_id', n.contact_id)
from public.contact_notes n

union all

select
    'deal_note:' || dn.id, dn.date, 'note.created', 'deal_note',
    null::bigint, dn.sales_id, 'user',
    'deal', dn.deal_id,
    jsonb_build_object('text', dn.text, 'deal_id', dn.deal_id)
from public.deal_notes dn

union all

-- Stage transitions. The one event on this timeline the user did not write as
-- prose: the reason and the files travel in the payload so the deal page can
-- render "why" next to "when", without a second query per row.
select
    'deal_stage_change:' || sc.id, sc.changed_at, 'deal.stage_changed',
    'deal_stage_change',
    null::bigint, sc.sales_id, 'user',
    'deal', sc.deal_id,
    jsonb_build_object('from_stage', sc.from_stage, 'to_stage', sc.to_stage,
                       'reason', sc.reason, 'deal_id', sc.deal_id,
                       'attachments', to_jsonb(sc.attachments))
from public.deal_stage_changes sc;

create or replace view public.init_state with (security_invoker = off) as
select count(sub.id) as is_initialized
from (
    select sales.id from public.sales limit 1
) sub;
