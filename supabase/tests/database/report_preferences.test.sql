--
-- Per-user report preferences.
--
-- One thing is pinned here above all: a preference is PRIVATE, with no manager
-- or admin override anywhere. That is a deliberate departure from every other
-- table in this schema, so it is the assertion most likely to be "fixed" by
-- somebody adding a `can_manage_all()` branch for consistency. A manager has no
-- business reading how a rep prefers to look at a chart, and an admin quietly
-- changing somebody's saved view would be indistinguishable from a bug.
--
-- The second thing is the upsert: exactly one saved view per person per report,
-- because "the last configuration" has to mean one row, not a history.
--
begin;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('97555555-0000-0000-0000-000000000001', 'prefs.admin@test.local', '{"first_name":"Pia","last_name":"Admin"}'::jsonb),
  ('97555555-0000-0000-0000-000000000002', 'prefs.rep@test.local',   '{"first_name":"Ravi","last_name":"Rep"}'::jsonb),
  ('97555555-0000-0000-0000-000000000003', 'prefs.peer@test.local',  '{"first_name":"Pere","last_name":"Peer"}'::jsonb);

update public.sales set id = 9701, role = 'admin' where user_id = '97555555-0000-0000-0000-000000000001';
update public.sales set id = 9702, role = 'rep'   where user_id = '97555555-0000-0000-0000-000000000002';
update public.sales set id = 9703, role = 'rep'   where user_id = '97555555-0000-0000-0000-000000000003';

-- Report 1 is a seeded built-in, which is the case this feature exists for.
select ok(
    (select is_builtin from public.reports where id = 1),
    'report 1 is a built-in, so it is the read-only case preferences serve');

-- =========================================================================
-- 1. A reader keeps their own view
-- =========================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"97555555-0000-0000-0000-000000000002"}';

select lives_ok(
    $$ insert into public.report_preferences (sales_id, report_id, spec)
       values (9702, 1, '{"dataset":"deals","metrics":["deal_count"],"visualisation":"donut"}'::jsonb) $$,
    'a rep may store a preference for a built-in they cannot edit');

select is(
    (select spec ->> 'visualisation' from public.report_preferences
      where report_id = 1),
    'donut',
    'and reads their own back');

--
-- The upsert: a second adjustment REPLACES, it does not accumulate. The
-- frontend saves on a debounce, so this path runs constantly; a table that grew
-- a row per keystroke would be a history nobody asked for.
--
select lives_ok(
    $$ insert into public.report_preferences (sales_id, report_id, spec)
       values (9702, 1, '{"dataset":"deals","metrics":["amount_sum"],"visualisation":"bar"}'::jsonb)
       on conflict (sales_id, report_id) do update set spec = excluded.spec $$,
    'saving again upserts rather than failing on the primary key');

select is(
    (select count(*)::int from public.report_preferences where report_id = 1),
    1,
    'exactly one saved view per person per report');

select is(
    (select spec ->> 'visualisation' from public.report_preferences
      where report_id = 1),
    'bar',
    'and it is the latest one');

-- The built-in itself is untouched: restoring must always be possible.
select is(
    (select spec ->> 'visualisation' from public.reports where id = 1),
    'funnel',
    'the built-in report is not modified by anybody storing a preference for it');

-- =========================================================================
-- 2. Isolation
-- =========================================================================

select throws_ok(
    $$ insert into public.report_preferences (sales_id, report_id, spec)
       values (9703, 1, '{"dataset":"deals","metrics":["deal_count"],"visualisation":"kpi"}'::jsonb) $$,
    '42501',
    null,
    'a rep cannot store a preference on somebody else''s behalf');

set local request.jwt.claims to '{"sub":"97555555-0000-0000-0000-000000000003"}';

select is(
    (select count(*)::int from public.report_preferences),
    0,
    'a peer sees none of the first rep''s preferences');

--
-- The one that guards the design decision. If somebody later adds a
-- `can_manage_all()` branch "for consistency with the rest of the schema", this
-- fails -- which is the entire point of asserting it.
--
set local request.jwt.claims to '{"sub":"97555555-0000-0000-0000-000000000001"}';

select is(
    (select count(*)::int from public.report_preferences),
    0,
    'an ADMIN sees no preferences either -- these are private, with no override');

select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public'
        and tablename = 'report_preferences'
        and qual like '%can_manage_all%'),
    0,
    'no policy on report_preferences grants a manager or admin override');

reset role;

select * from finish();
rollback;
