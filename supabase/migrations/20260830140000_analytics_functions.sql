--
-- Analytics module: the aggregation surface behind /analytics.
--
-- Eight parameterised functions rather than views, and the reason is the row
-- cap. PostgREST returns at most `max_rows = 1000` (supabase/config.toml), so a
-- chart that fetches a list and aggregates it in the browser is silently wrong
-- above that volume -- it does not error, it under-reports. `DealsChart.tsx`
-- does exactly that today (perPage: 100 over six months, summed in JS).
--
-- A wide cube VIEW does not fix it either: the grain the UI needs
-- (owner x stage x month) is ~2 880 rows before any filter, over the cap, and
-- PostgREST filters AFTER the aggregation so the scan is never bounded. These
-- functions take the filter as a PARAMETER, which bounds both the scan and the
-- result. Every one of them returns a row count bounded by construction:
-- stages (6), months in range, sales, or task types (9).
--
-- SECURITY: every function here is SECURITY INVOKER -- the PostgreSQL default,
-- which is why the keyword is deliberately NOT written (pg_dump omits it, and
-- spelling it out produces a phantom diff on every `supabase db diff`). RLS on
-- `deals`, `leads` and `tasks` therefore does the role scoping for free: a rep
-- aggregates only the rows their own policies expose, a manager sees the whole
-- company, and the frontend needs no branching. A `security definer` function
-- here would hand every rep the entire company's numbers -- it is the single
-- most dangerous mistake available in this module, so
-- `analytics_functions.test.sql` asserts `prosecdef = false` on all eight
-- rather than trusting this comment.
--
-- `p_sales_id` is a FILTER, not an authorisation parameter. Passing another
-- rep's id widens nothing, because RLS still applies underneath -- safe by
-- construction rather than by a check inside the function.
--
-- Exactly ONE index ships here, and only after EXPLAIN (ANALYZE, BUFFERS) at
-- volume said so -- see the block above it for the numbers and for the two
-- candidates that were measured and rejected. Every index in this schema
-- carries a measured justification (`tasks_owner_all` exists because one query
-- went 1.7 s -> 215 ms); an index that does not change a plan is pure write
-- cost.
--

-- ---------------------------------------------------------------------------
-- Deals: stage distribution (stock)
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT date-filtered, and deliberately OPEN deals only.
--
-- "Where is the live pipeline right now" has no month, so applying the period
-- filter to it would make a stock figure move for a reason the label does not
-- explain. And excluding won/lost is what keeps the chart honest: with the
-- terminal stages in, the bars mix a snapshot of the pipeline against the
-- lifetime total of everything ever closed, on one axis.
--
-- `not in ('won', 'lost')` is the same definition as
-- `teams_summary.pipeline_amount`. `<> 'won'` booked dead deals as forecast,
-- which is the exact bug the team dashboard migration fixed; the two screens
-- must not disagree about what the word pipeline means. The literals match
-- `defaultDealStages`, so renaming a stage in the application configuration
-- needs this function updated too.
--
create or replace function public.deal_stage_stats(
    p_sales_id bigint default null,
    p_team_id  bigint default null
) returns table (
    stage    text,
    nb_deals bigint,
    amount   numeric
)
language sql
stable
set search_path to ''
as $$
    select d.stage,
           count(*)::bigint,
           coalesce(sum(d.amount), 0)::numeric
      from public.deals d
     where d.archived_at is null
       and d.stage not in ('won', 'lost')
       and (p_sales_id is null or d.sales_id = p_sales_id)
       and (p_team_id  is null or d.team_id  = p_team_id)
     group by d.stage;
$$;

-- ---------------------------------------------------------------------------
-- Deals: monthly flow
-- ---------------------------------------------------------------------------
--
-- Two date bases in one result, carried by a `union all` -- the same shape
-- `team_task_stats` uses for created-vs-completed. A deal belongs to the month
-- it was OPENED and, separately, to the month it was DECIDED, and those are
-- rarely the same month. Folding them into one row per month is what lets the
-- chart put creation next to outcome; the UI labels each series with its own
-- basis, because a chart whose series measure different dates and says only
-- "this quarter" is how a dashboard loses credibility.
--
-- DECISION DATE, and this is the honest limitation of the MVP: it uses
-- `expected_closing_date`, not the real transition date. There is no
-- `deals.closed_at`, and the real answer lives in `deal_stage_changes`, which
-- has only recorded transitions since 2026-08-18 -- days, not quarters. Using
-- it now would chart noise. `deal_cycle_stats` swaps this basis in phase 2,
-- once that table has accumulated a period; until then the UI must say
-- "expected" and never "actual".
--
-- A won/lost deal with no `expected_closing_date` therefore contributes to no
-- month at all. That gap is visible rather than papered over: coalescing it to
-- `created_at` would invent a close date that nobody entered.
--
create or replace function public.deal_flow_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null,
    p_team_id  bigint default null
) returns table (
    month          date,
    nb_created     bigint,
    amount_created numeric,
    nb_won         bigint,
    amount_won     numeric,
    nb_lost        bigint,
    amount_lost    numeric,
    nb_forecast          bigint,
    forecast_days_total  numeric
)
language sql
stable
set search_path to ''
as $$
    with events as (
        select date_trunc('month', d.created_at)::date as m,
               1                                as created,
               coalesce(d.amount, 0)::numeric   as amt_created,
               0                                as won,
               0::numeric                       as amt_won,
               0                                as lost,
               0::numeric                       as amt_lost,
               -- Forecast cycle length, carried as a SUM and a COUNT rather
               -- than as an average. Averaging monthly averages weights a month
               -- with three deals like a month with three hundred; a sum and a
               -- count divide exactly, at any grouping the UI chooses.
               case when d.expected_closing_date is not null
                    then 1 else 0 end            as fc_n,
               case when d.expected_closing_date is not null
                    then (d.expected_closing_date - d.created_at::date)::numeric
                    else 0::numeric end          as fc_days
          from public.deals d
         where d.archived_at is null
           and d.created_at::date between p_from and p_to
           and (p_sales_id is null or d.sales_id = p_sales_id)
           and (p_team_id  is null or d.team_id  = p_team_id)
        union all
        select date_trunc('month', d.expected_closing_date)::date,
               0,
               0::numeric,
               case when d.stage = 'won'  then 1 else 0 end,
               case when d.stage = 'won'  then coalesce(d.amount, 0)::numeric
                    else 0::numeric end,
               case when d.stage = 'lost' then 1 else 0 end,
               case when d.stage = 'lost' then coalesce(d.amount, 0)::numeric
                    else 0::numeric end,
               0,
               0::numeric
          from public.deals d
         where d.archived_at is null
           and d.stage in ('won', 'lost')
           and d.expected_closing_date between p_from and p_to
           and (p_sales_id is null or d.sales_id = p_sales_id)
           and (p_team_id  is null or d.team_id  = p_team_id)
    )
    select e.m,
           sum(e.created)::bigint,
           sum(e.amt_created)::numeric,
           sum(e.won)::bigint,
           sum(e.amt_won)::numeric,
           sum(e.lost)::bigint,
           sum(e.amt_lost)::numeric,
           sum(e.fc_n)::bigint,
           sum(e.fc_days)::numeric
      from events e
     group by e.m
     order by e.m;
$$;

-- ---------------------------------------------------------------------------
-- Deals: per owner
-- ---------------------------------------------------------------------------
--
-- Mixed bases in one row, on purpose: `nb_open` / `pipeline_amount` are stock
-- (what this person is carrying right now) while the won and lost figures are
-- flow inside the period. The chart labels each series; putting them in one
-- row is what makes the total and its breakdown come from a single call, so
-- they cannot disagree because a write landed between two requests.
--
-- Aggregated from `deals` and then joined to `sales`, so an owner with no deals
-- simply does not appear. Starting from `sales` instead would list every
-- account, including disabled ones, as a row of zeroes -- a roster, which is
-- not what this answers.
--
create or replace function public.deal_owner_stats(
    p_from    date,
    p_to      date,
    p_team_id bigint default null
) returns table (
    sales_id        bigint,
    owner_name      text,
    nb_open         bigint,
    pipeline_amount numeric,
    nb_won          bigint,
    won_amount      numeric,
    nb_lost         bigint,
    lost_amount     numeric
)
language sql
stable
set search_path to ''
as $$
    with agg as (
        select d.sales_id as owner_id,
               count(*) filter (
                   where d.stage not in ('won', 'lost')) as open_deals,
               coalesce(sum(d.amount) filter (
                   where d.stage not in ('won', 'lost')), 0)::numeric as pipeline,
               count(*) filter (
                   where d.stage = 'won'
                     and d.expected_closing_date between p_from and p_to) as won_deals,
               coalesce(sum(d.amount) filter (
                   where d.stage = 'won'
                     and d.expected_closing_date between p_from and p_to), 0)::numeric as won_amt,
               count(*) filter (
                   where d.stage = 'lost'
                     and d.expected_closing_date between p_from and p_to) as lost_deals,
               coalesce(sum(d.amount) filter (
                   where d.stage = 'lost'
                     and d.expected_closing_date between p_from and p_to), 0)::numeric as lost_amt
          from public.deals d
         where d.archived_at is null
           and d.sales_id is not null
           and (p_team_id is null or d.team_id = p_team_id)
         group by d.sales_id
    )
    select a.owner_id,
           nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
           a.open_deals::bigint,
           a.pipeline,
           a.won_deals::bigint,
           a.won_amt,
           a.lost_deals::bigint,
           a.lost_amt
      from agg a
      join public.sales s on s.id = a.owner_id;
$$;

-- ---------------------------------------------------------------------------
-- Leads: monthly flow
-- ---------------------------------------------------------------------------
--
-- `nb_converted` is COHORT-scoped, not flow-scoped: of the leads created in
-- this month, how many have converted since. That is what makes a monthly
-- conversion rate mean anything -- dividing conversions that happened in March
-- by leads created in March compares two different populations.
--
-- The consequence is worth printing next to the chart: the most recent months
-- always look worse, because their leads have not had time to convert yet. A
-- cohort rate that is still filling in is not a decline.
--
create or replace function public.lead_flow_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    month               date,
    nb_created          bigint,
    nb_converted        bigint,
    avg_conversion_days numeric
)
language sql
stable
set search_path to ''
as $$
    select date_trunc('month', l.created_at)::date,
           count(*)::bigint,
           count(*) filter (where l.converted_at is not null)::bigint,
           round(
               avg(extract(epoch from (l.converted_at - l.created_at)) / 86400.0)
                   filter (where l.converted_at is not null),
               1)
      from public.leads l
     where l.created_at::date between p_from and p_to
       and (p_sales_id is null or l.sales_id = p_sales_id)
     group by 1
     order by 1;
$$;

-- ---------------------------------------------------------------------------
-- Leads: breakdown by source, status and owner
-- ---------------------------------------------------------------------------
--
-- Three dimensions in one call, discriminated by a `dimension` column -- the
-- same `union all` trick `team_task_stats` uses for its two date bases. One
-- round trip serves five charts, and every rate on the Leads tab is computed
-- over the same cohort, so the breakdowns reconcile with each other by
-- construction instead of by luck.
--
-- ATTRIBUTION, and its limit. `won_amount` is the only path in this schema from
-- an origin to revenue: `leads.converted_deal_id` -> `deals`. It exists ONLY
-- for leads converted with `create_deal := true`; a deal typed straight into
-- the kanban has no traceable origin at all, because `deals` has no `source`
-- column. So this answers "of the revenue we CAN attribute, which channel
-- produced it" -- the UI must show the attributable share beside the figure or
-- it will be read as the whole business.
--
-- `bucket` carries a raw key for source and status (the frontend resolves the
-- label from the application configuration) but a resolved NAME for owner,
-- because the client cannot turn a `sales_id` into a person without a second
-- query.
--
create or replace function public.lead_breakdown_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    dimension           text,
    bucket              text,
    nb_leads            bigint,
    nb_converted        bigint,
    nb_won_deals        bigint,
    won_amount          numeric,
    pipeline_amount     numeric,
    avg_conversion_days numeric
)
language sql
stable
set search_path to ''
as $$
    with cohort as (
        select l.id,
               l.source,
               l.status,
               l.sales_id,
               l.created_at,
               l.converted_at,
               l.converted_deal_id
          from public.leads l
         where l.created_at::date between p_from and p_to
           and (p_sales_id is null or l.sales_id = p_sales_id)
    ),
    enriched as (
        select c.source,
               c.status,
               c.sales_id,
               c.created_at,
               c.converted_at,
               d.stage                        as deal_stage,
               coalesce(d.amount, 0)::numeric as deal_amount
          from cohort c
          left join public.deals d
                 on d.id = c.converted_deal_id
                and d.archived_at is null
    )
    select 'source'::text,
           coalesce(nullif(btrim(e.source), ''), 'unknown'),
           count(*)::bigint,
           count(*) filter (where e.converted_at is not null)::bigint,
           count(*) filter (where e.deal_stage = 'won')::bigint,
           coalesce(sum(e.deal_amount) filter (where e.deal_stage = 'won'), 0)::numeric,
           coalesce(sum(e.deal_amount) filter (
               where e.deal_stage is not null
                 and e.deal_stage not in ('won', 'lost')), 0)::numeric,
           round(avg(extract(epoch from (e.converted_at - e.created_at)) / 86400.0)
                     filter (where e.converted_at is not null), 1)
      from enriched e
     group by 1, 2
    union all
    select 'status'::text,
           coalesce(nullif(btrim(e.status), ''), 'unknown'),
           count(*)::bigint,
           count(*) filter (where e.converted_at is not null)::bigint,
           count(*) filter (where e.deal_stage = 'won')::bigint,
           coalesce(sum(e.deal_amount) filter (where e.deal_stage = 'won'), 0)::numeric,
           coalesce(sum(e.deal_amount) filter (
               where e.deal_stage is not null
                 and e.deal_stage not in ('won', 'lost')), 0)::numeric,
           round(avg(extract(epoch from (e.converted_at - e.created_at)) / 86400.0)
                     filter (where e.converted_at is not null), 1)
      from enriched e
     group by 1, 2
    union all
    select 'owner'::text,
           coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
                    'unassigned'),
           count(*)::bigint,
           count(*) filter (where e.converted_at is not null)::bigint,
           count(*) filter (where e.deal_stage = 'won')::bigint,
           coalesce(sum(e.deal_amount) filter (where e.deal_stage = 'won'), 0)::numeric,
           coalesce(sum(e.deal_amount) filter (
               where e.deal_stage is not null
                 and e.deal_stage not in ('won', 'lost')), 0)::numeric,
           round(avg(extract(epoch from (e.converted_at - e.created_at)) / 86400.0)
                     filter (where e.converted_at is not null), 1)
      from enriched e
      left join public.sales s on s.id = e.sales_id
     group by 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: monthly flow
-- ---------------------------------------------------------------------------
--
-- The company-wide counterpart of `team_task_stats`, and it exists separately
-- for a reason that is not duplication: that cube resolves tasks through
-- `team_members`, so a rep who is in no team is invisible in it, and a rep in
-- two teams is counted twice. This one hangs tasks off their owner directly.
--
-- Two date bases again: a task belongs to the month it was created AND to the
-- month it was completed. The gap between the two series IS the backlog
-- forming, which is the only shape that shows a team accumulating work rather
-- than working it.
--
-- ON TIME: a task with no due date counts as on time, so the denominator is
-- exactly `nb_completed`. Excluding it instead would make the two counters look
-- comparable while they are not, which is how a rate ends up above 100 %.
--
-- CYCLE: measured `completed_at - created_at`, never from
-- `tasks.total_open_seconds`. That counter is trigger-maintained and reads 0 on
-- every task predating the trigger, and a chart cannot tell "instant" from
-- "never recorded". The subtraction is exact for every row, always.
--
create or replace function public.task_flow_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    month                date,
    nb_created           bigint,
    nb_completed         bigint,
    nb_completed_on_time bigint,
    avg_cycle_hours      numeric
)
language sql
stable
set search_path to ''
as $$
    with events as (
        select date_trunc('month', tk.created_at)::date as m,
               1              as created,
               0              as completed,
               0              as on_time,
               null::numeric  as cycle_seconds
          from public.tasks tk
         where tk.deleted_at is null
           and tk.created_at::date between p_from and p_to
           and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
        union all
        select date_trunc('month', tk.completed_at)::date,
               0,
               1,
               case when tk.due_date is null or tk.completed_at <= tk.due_date
                    then 1 else 0 end,
               extract(epoch from (tk.completed_at - tk.created_at))::numeric
          from public.tasks tk
         where tk.deleted_at is null
           and tk.completed_at is not null
           and tk.completed_at::date between p_from and p_to
           and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
    )
    select e.m,
           sum(e.created)::bigint,
           sum(e.completed)::bigint,
           sum(e.on_time)::bigint,
           -- Null, not 0, for a month where nothing was completed: `avg` over
           -- no rows has no answer, and 0 would draw a bar claiming tasks
           -- closed instantly.
           round(avg(e.cycle_seconds) / 3600.0, 1)
      from events e
     group by e.m
     order by e.m;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: stock, per owner
-- ---------------------------------------------------------------------------
--
-- "How many are open" has no month, which is why none of this lives in the
-- flow function above. Returned per owner rather than as three scalars so the
-- tab's headline tiles and its per-owner chart come from ONE call and cannot
-- contradict each other; the tiles are the sum of these rows.
--
-- OPEN is counted on the COLUMNS (`completed_at`, `canceled_at`, `deleted_at`,
-- `archived_at` all null), never on `task_statuses.is_open`. The two disagree
-- on an archived task and on a task completed without its status following, and
-- the columns are what every partial index and every task-list filter use -- so
-- this counter equals the list a user lands on when they click it
-- (`OPEN_TASK_FILTER` in `taskBuckets.ts`).
--
-- `nb_overdue` is a SUBSET of `nb_open`, never a sibling. Anything stacking
-- them must subtract first or every late task is drawn twice; `workloadOf()`
-- does that subtraction once, for every caller.
--
-- One pass per owner with `count(*) filter (...)`, not three subqueries over
-- the same rows -- the shape `team_workload_summary` settled on after measuring
-- 330 ms against 35 ms.
--
create or replace function public.task_stock_stats(
    p_sales_id bigint default null
) returns table (
    sales_id       bigint,
    owner_name     text,
    nb_open        bigint,
    nb_overdue     bigint,
    nb_due_next_7d bigint
)
language sql
stable
set search_path to ''
as $$
    with agg as (
        select tk.owner_sales_id as owner_id,
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
                     and tk.due_date < now() + interval '7 days') as due_next_7d
          from public.tasks tk
         where tk.deleted_at is null
           and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
         group by tk.owner_sales_id
    )
    select a.owner_id,
           nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
           a.open_tasks::bigint,
           a.overdue::bigint,
           a.due_next_7d::bigint
      from agg a
      join public.sales s on s.id = a.owner_id;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: activity mix by type
-- ---------------------------------------------------------------------------
--
-- Counted on COMPLETED tasks, not on created ones: the question is what work
-- actually happened, and a planned call that never took place is not activity.
-- `task_types` is the only activity-type vocabulary in the schema -- there are
-- no call, email or meeting records, so "a meeting" here means "a task of type
-- meeting that somebody closed".
--
create or replace function public.task_type_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    type_key     text,
    type_label   text,
    nb_completed bigint
)
language sql
stable
set search_path to ''
as $$
    select ty.key,
           ty.label,
           count(*)::bigint
      from public.tasks tk
      join public.task_types ty on ty.id = tk.task_type_id
     where tk.deleted_at is null
       and tk.completed_at is not null
       and tk.completed_at::date between p_from and p_to
       and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
     group by ty.key, ty.label;
$$;

-- ---------------------------------------------------------------------------
-- The one index this module ships
-- ---------------------------------------------------------------------------
--
-- Backs every period-scoped deal figure: the won/lost branch of
-- `deal_flow_stats` and the decided counters on `deal_owner_stats`, both of
-- which range-filter `expected_closing_date`.
--
-- MEASURED, because an index that does not change a plan is pure write cost.
-- 200k deals, 40 owners, three years, local Postgres 15, three runs each:
--
--   12-month window:  50.5 / 49.0 / 51.5 ms  ->  43.0 / 42.6 / 45.8 ms  (-12%)
--    1-month window:  34.5 / 33.3 / 35.5 ms  ->  24.0 / 24.3 / 26.1 ms  (-28%)
--
-- The planner switches from a parallel sequential scan to a bitmap index scan
-- in both cases, and the narrower the window the more it wins -- which is the
-- shape of the period presets the UI actually offers.
--
-- Two candidates were measured and REJECTED rather than shipped on intuition:
--   * `deals (created_at)` -- never chosen by the planner. A 12-month window is
--     a third of the table, so the creation branch stays a sequential scan.
--   * `leads (created_at)` -- moved `lead_flow_stats` from 17.2 ms to 17.0 ms,
--     which is noise.
--
create index if not exists deals_expected_closing_date_idx
    on public.deals (expected_closing_date)
    where archived_at is null;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE to PUBLIC by default, which would reach `anon`.
-- RLS would still return nothing to an anonymous caller (every policy on these
-- tables is `to authenticated`), but revoking first is the same defence in
-- depth the rest of this schema applies.
--
revoke all on function public.deal_stage_stats(bigint, bigint) from public, anon;
revoke all on function public.deal_flow_stats(date, date, bigint, bigint) from public, anon;
revoke all on function public.deal_owner_stats(date, date, bigint) from public, anon;
revoke all on function public.lead_flow_stats(date, date, bigint) from public, anon;
revoke all on function public.lead_breakdown_stats(date, date, bigint) from public, anon;
revoke all on function public.task_flow_stats(date, date, bigint) from public, anon;
revoke all on function public.task_stock_stats(bigint) from public, anon;
revoke all on function public.task_type_stats(date, date, bigint) from public, anon;

grant execute on function public.deal_stage_stats(bigint, bigint) to authenticated, service_role;
grant execute on function public.deal_flow_stats(date, date, bigint, bigint) to authenticated, service_role;
grant execute on function public.deal_owner_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.lead_flow_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.lead_breakdown_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.task_flow_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.task_stock_stats(bigint) to authenticated, service_role;
grant execute on function public.task_type_stats(date, date, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
