--
-- The eight aggregation functions behind /analytics.
--
-- Two classes of thing are pinned here, and neither can be caught anywhere else
-- in the stack:
--
--   1. SECURITY. Every function must stay SECURITY INVOKER, so RLS scopes the
--      numbers. A `security definer` slipped onto any of them would hand every
--      rep the whole company's figures, and nothing in the UI would look
--      different -- the charts would simply be wrong in the reader's favour.
--      `prosecdef` is asserted directly, and then the consequence is exercised:
--      a rep calling the functions aggregates only their own rows.
--
--   2. THE DEFINITIONS. Which date a row is filed under, what counts as open,
--      what counts as on time, and what is deliberately excluded. Every one of
--      these was a decision with an alternative that looks equally reasonable
--      in a diff, so each is nailed to a row here.
--
-- FIXTURE ISOLATION. The local database holds real data and these functions
-- aggregate globally, so no assertion may use a global count. Every call is
-- scoped to the fixture's own owner or team, and every fixture date sits in
-- 2031 -- far outside any range real rows occupy.
--
begin;

select plan(29);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('97333333-0000-0000-0000-000000000001', 'analytics.admin@test.local', '{"first_name":"Ana","last_name":"Admin"}'::jsonb),
  ('97333333-0000-0000-0000-000000000002', 'analytics.rep@test.local',   '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('97333333-0000-0000-0000-000000000003', 'analytics.peer@test.local',  '{"first_name":"Pau","last_name":"Peer"}'::jsonb);

update public.sales set id = 9901, role = 'admin'
where user_id = '97333333-0000-0000-0000-000000000001';
update public.sales set id = 9902, role = 'rep'
where user_id = '97333333-0000-0000-0000-000000000002';
update public.sales set id = 9903, role = 'rep'
where user_id = '97333333-0000-0000-0000-000000000003';

insert into public.teams (id, name) values (9901, 'Analytics');
insert into public.team_members (id, team_id, sales_id) values
  (9901, 9901, 9902),
  (9902, 9901, 9903);

--
-- Deals. The shape matters more than the amounts:
--   A, B  open      -- the only two that are "pipeline"
--   C     won       -- decided inside April
--   D     lost      -- decided inside April
--   E     archived  -- must vanish from every single figure
--   F     won, but with NO expected closing date -- contributes to the month it
--         was created in and to NO won month, because there is nothing to file
--         it under. Coalescing that to `created_at` would invent a close date.
--   G     owned by the peer rep -- the RLS probe at the end
--
insert into public.deals
  (id, name, stage, amount, sales_id, team_id, created_at, expected_closing_date, archived_at)
values
  (9901, 'A abierta',   'opportunity',   200000, 9902, 9901, '2031-02-10', '2031-06-30', null),
  (9902, 'B propuesta', 'proposal-sent', 100000, 9902, 9901, '2031-02-20', '2031-07-31', null),
  (9903, 'C ganada',    'won',           300000, 9902, 9901, '2031-03-05', '2031-04-30', null),
  (9904, 'D perdida',   'lost',          150000, 9902, 9901, '2031-03-06', '2031-04-30', null),
  (9905, 'E archivada', 'opportunity',   999999, 9902, 9901, '2031-03-07', '2031-06-30', now()),
  (9906, 'F sin fecha', 'won',           500000, 9902, 9901, '2031-03-08', null,         null),
  (9907, 'G del peer',  'opportunity',      111, 9903, 9901, '2031-02-11', '2031-06-30', null);

--
-- Leads. Two converted (one into a won deal, one into an open one) and one not,
-- so the cohort rate has a real denominator and the attribution join has both
-- an outcome and a still-open case to separate.
--
insert into public.leads
  (id, first_name, source, status, sales_id, created_at, converted_at, converted_deal_id)
values
  (9901, 'Uno',    'web',      'converted', 9902, '2031-01-10', '2031-01-20', 9903),
  (9902, 'Dos',    'web',      'new',       9902, '2031-01-15', null,         null),
  (9903, 'Tres',   'referral', 'converted', 9902, '2031-02-10', '2031-02-20', 9901),
  (9904, 'Cuatro', null,       'new',       9903, '2031-02-11', null,         null);

--
-- Tasks, all created inside May 2031 so the created bucket is unambiguous:
--   T1 completed LATE, and in a different month from its creation
--   T2 completed with NO due date -- counts as on time, so the denominator
--      stays equal to nb_completed
--   T3 open, due far in the future -- open only
--   T4 open, due in 2020 -- open AND overdue (overdue is a subset)
--   T5 ARCHIVED and not completed -- not open, even though its status says it is
--   T6 open, due inside the next 7 days
--
insert into public.tasks
  (id, title, task_type_id, status_id, priority_id, owner_sales_id, created_by,
   created_at, due_date, completed_at, completed_by, archived_at)
select
  t.id,
  t.title,
  (select id from public.task_types where key = 'call'),
  (select id from public.task_statuses where key = 'pending'),
  (select id from public.task_priorities where key = 'normal'),
  9902,
  9902,
  t.created_at,
  t.due_date,
  t.completed_at,
  case when t.completed_at is null then null else 9902 end,
  t.archived_at
from (values
  (9901, 'T1 tarde',     '2031-05-10'::timestamptz, '2031-05-20'::timestamptz, '2031-06-05'::timestamptz, null::timestamptz),
  (9902, 'T2 sin plazo', '2031-05-11'::timestamptz, null,                      '2031-05-15'::timestamptz, null),
  (9903, 'T3 abierta',   '2031-05-12'::timestamptz, '2031-05-25'::timestamptz, null,                      null),
  (9904, 'T4 vencida',   '2031-05-13'::timestamptz, '2020-01-01'::timestamptz, null,                      null),
  (9905, 'T5 archivada', '2031-05-14'::timestamptz, '2031-05-30'::timestamptz, null,                      now()),
  (9906, 'T6 pronto',    '2031-05-15'::timestamptz, now() + interval '3 days', null,                      null)
) as t(id, title, created_at, due_date, completed_at, archived_at);

-- ---------------------------------------------------------------------------
-- 1-2. The security contract
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('deal_stage_stats', 'deal_flow_stats', 'deal_owner_stats',
                        'lead_flow_stats', 'lead_breakdown_stats',
                        'task_flow_stats', 'task_stock_stats', 'task_type_stats')),
  8::bigint,
  'all eight analytics functions exist');

select is(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in ('deal_stage_stats', 'deal_flow_stats', 'deal_owner_stats',
                        'lead_flow_stats', 'lead_breakdown_stats',
                        'task_flow_stats', 'task_stock_stats', 'task_type_stats')),
  0::bigint,
  'no analytics function is SECURITY DEFINER -- RLS must do the role scoping');

-- ---------------------------------------------------------------------------
-- 3-5. deal_stage_stats: stock, open stages only
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.deal_stage_stats(p_sales_id => 9902)),
  2::bigint,
  'only the two OPEN stages are returned: won, lost and the archived deal are out');

select is(
  (select amount from public.deal_stage_stats(p_sales_id => 9902)
    where stage = 'opportunity'),
  200000::numeric,
  'the archived deal is excluded from its stage amount');

select is(
  (select nb_deals from public.deal_stage_stats(p_team_id => 9901)
    where stage = 'opportunity'),
  2::bigint,
  'the team filter aggregates every owner in the team');

-- ---------------------------------------------------------------------------
-- 6-10. deal_flow_stats: two date bases in one result
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.deal_flow_stats('2031-01-01', '2031-12-31', 9902)),
  3::bigint,
  'three months carry an event: two of creation, one of decision');

select is(
  (select nb_created from public.deal_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-02-01'),
  2::bigint,
  'deals are filed under the month they were created');

select is(
  (select nb_won from public.deal_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-04-01'),
  1::bigint,
  'a won deal is filed under its expected closing month, not its creation month');

select is(
  (select amount_won from public.deal_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-04-01'),
  300000::numeric,
  'the won amount lands in the decision month');

select is(
  (select coalesce(sum(nb_won), 0)::bigint
     from public.deal_flow_stats('2031-01-01', '2031-12-31', 9902)),
  1::bigint,
  'a won deal with no expected closing date is filed under NO month rather than a guessed one');

select is(
  (select round(sum(forecast_days_total) / nullif(sum(nb_forecast), 0))
     from public.deal_flow_stats('2031-01-01', '2031-12-31', 9902)),
  -- A 140d + B 161d + C 56d + D 55d = 412 over 4 deals. F carries no expected
  -- date, so it is absent from BOTH the sum and the count -- which is the whole
  -- point of returning them separately.
  103::numeric,
  'the forecast cycle divides a summed total by a summed count, never averaging averages');

-- ---------------------------------------------------------------------------
-- 11-13. deal_owner_stats: stock and flow in one row
-- ---------------------------------------------------------------------------

select is(
  (select nb_open from public.deal_owner_stats('2031-04-01', '2031-04-30', 9901)
    where sales_id = 9902),
  2::bigint,
  'pipeline is stock: it ignores the period, so April still reports the June and July deals');

select is(
  (select pipeline_amount from public.deal_owner_stats('2031-04-01', '2031-04-30', 9901)
    where sales_id = 9902),
  300000::numeric,
  'pipeline sums only the open stages, never the won or lost ones');

select is(
  (select nb_won from public.deal_owner_stats('2031-04-01', '2031-04-30', 9901)
    where sales_id = 9902),
  1::bigint,
  'the won counter IS scoped to the period, unlike the pipeline beside it');

-- ---------------------------------------------------------------------------
-- 14-16. lead_flow_stats: a cohort rate, not a flow rate
-- ---------------------------------------------------------------------------

select is(
  (select nb_created from public.lead_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-01-01'),
  2::bigint,
  'leads are counted in the month they arrived');

select is(
  (select nb_converted from public.lead_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-01-01'),
  1::bigint,
  'conversions are attributed to the COHORT month, not the month they happened in');

select is(
  (select avg_conversion_days from public.lead_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-01-01'),
  10.0::numeric,
  'time to conversion is measured converted_at - created_at');

-- ---------------------------------------------------------------------------
-- 17-19. lead_breakdown_stats: three dimensions, one cohort
-- ---------------------------------------------------------------------------

select is(
  (select won_amount from public.lead_breakdown_stats('2031-01-01', '2031-12-31', 9902)
    where dimension = 'source' and bucket = 'web'),
  300000::numeric,
  'revenue reaches its source through leads.converted_deal_id');

select is(
  (select pipeline_amount from public.lead_breakdown_stats('2031-01-01', '2031-12-31', 9902)
    where dimension = 'source' and bucket = 'referral'),
  200000::numeric,
  'a lead converted into a still-open deal counts as pipeline, never as won');

select is(
  (select nb_leads from public.lead_breakdown_stats('2031-01-01', '2031-12-31', 9902)
    where dimension = 'owner' and bucket = 'Rita Rep'),
  3::bigint,
  'the owner dimension resolves a name, because the client cannot turn an id into a person');

-- ---------------------------------------------------------------------------
-- 20-22. task_flow_stats: created and completed are different months
-- ---------------------------------------------------------------------------

select is(
  (select nb_created from public.task_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-05-01'),
  6::bigint,
  'every task created in May is counted there, whatever state it is in now');

select is(
  (select nb_completed_on_time from public.task_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-05-01'),
  1::bigint,
  'a task with no due date counts as on time, so the denominator stays nb_completed');

select is(
  (select nb_completed_on_time from public.task_flow_stats('2031-01-01', '2031-12-31', 9902)
    where month = '2031-06-01'),
  0::bigint,
  'a task completed after its due date is not on time, in the month it was COMPLETED');

-- ---------------------------------------------------------------------------
-- 23-26. task_stock_stats: open on the columns, overdue as a subset
-- ---------------------------------------------------------------------------

select is(
  (select nb_open from public.task_stock_stats(9902)),
  3::bigint,
  'open is counted on the columns: the archived task is out even though its status is open');

select is(
  (select nb_overdue from public.task_stock_stats(9902)),
  1::bigint,
  'overdue counts only open work that is already late');

select is(
  (select nb_due_next_7d from public.task_stock_stats(9902)),
  1::bigint,
  'due-soon is the actionable end of the same stock');

select is(
  (select nb_completed from public.task_type_stats('2031-01-01', '2031-12-31', 9902)
    where type_key = 'call'),
  2::bigint,
  'the activity mix counts completed work only, never what was merely planned');

-- ---------------------------------------------------------------------------
-- 27-28. The consequence of SECURITY INVOKER: a rep aggregates only their own
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"97333333-0000-0000-0000-000000000003","role":"authenticated"}', true);
set role authenticated;

select is(
  (select nb_deals from public.deal_stage_stats(p_team_id => 9901)
    where stage = 'opportunity'),
  1::bigint,
  'a rep asking for the whole team aggregates only the deals RLS lets them read');

select is(
  (select coalesce(sum(nb_leads), 0)::bigint
     from public.lead_breakdown_stats('2031-01-01', '2031-12-31')
    where dimension = 'source'),
  1::bigint,
  'a rep sees none of a teammate''s leads in the breakdown, filter or no filter');

reset role;

select * from finish();
rollback;
