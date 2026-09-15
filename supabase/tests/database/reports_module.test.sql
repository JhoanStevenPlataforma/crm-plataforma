--
-- The reports module: the catalogue, the executor, and the saved reports.
--
-- Three classes of thing are pinned here, and the first one cannot be caught
-- anywhere else in the stack:
--
--   1. THE INJECTION BOUNDARY. `run_report()` builds SQL from a spec the client
--      controls. Everything that keeps that safe is asserted directly: unknown
--      keys are refused rather than interpolated, a metric cannot be used as a
--      dimension, operators are matched against a fixed set per type, and a
--      value carrying SQL comes back as a literal instead of as code. These are
--      the tests that would fail if somebody "simplified" the catalogue lookup
--      into string concatenation.
--
--   2. SECURITY INVOKER. `run_report()` must never become `security definer`.
--      On the eight /analytics aggregates that would leak one set of figures;
--      on a GENERIC engine it leaks every row of five tables to every rep, and
--      nothing in the UI would look different. `prosecdef` is asserted, then
--      the consequence is exercised with a real rep session.
--
--   3. THE CATALOGUE IS NOT USER-WRITABLE. `report_fields.sql_expr` reaches the
--      executed statement verbatim. A user who could write it could run
--      arbitrary SQL as themselves. Both mechanisms that prevent it -- the
--      missing policy and the withheld grant -- are checked.
--
-- FIXTURE ISOLATION. The local database holds real data and these aggregates
-- run globally, so no assertion uses a global count. Every call is scoped to
-- the fixture's own owner, and every fixture date sits in 2032 -- far outside
-- any range real rows occupy.
--
begin;

select plan(39);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('97444444-0000-0000-0000-000000000001', 'reports.admin@test.local', '{"first_name":"Rita","last_name":"Admin"}'::jsonb),
  ('97444444-0000-0000-0000-000000000002', 'reports.rep@test.local',   '{"first_name":"Raul","last_name":"Rep"}'::jsonb),
  ('97444444-0000-0000-0000-000000000003', 'reports.peer@test.local',  '{"first_name":"Pia","last_name":"Peer"}'::jsonb);

update public.sales set id = 9801, role = 'admin' where user_id = '97444444-0000-0000-0000-000000000001';
update public.sales set id = 9802, role = 'rep'   where user_id = '97444444-0000-0000-0000-000000000002';
update public.sales set id = 9803, role = 'rep'   where user_id = '97444444-0000-0000-0000-000000000003';

--
-- Deals. The shape carries the assertions:
--   rep  owns A (open, 100), B (won, 300), C (lost, 200)
--   peer owns D (won, 999)  -- must be invisible to the rep
--
insert into public.deals (id, name, stage, amount, sales_id, created_at, expected_closing_date) values
  (9801, 'R-A open', 'opportunity',  100, 9802, '2032-03-05', '2032-04-10'),
  (9802, 'R-B won',  'won',          300, 9802, '2032-03-06', '2032-04-11'),
  (9803, 'R-C lost', 'lost',         200, 9802, '2032-03-07', '2032-04-12'),
  (9804, 'P-D won',  'won',          999, 9803, '2032-03-08', '2032-04-13'),
  -- Archived: excluded by `base_where`, so no report can be built that shows it.
  (9805, 'R-E arch', 'won',        50000, 9802, '2032-03-09', '2032-04-14');
update public.deals set archived_at = now() where id = 9805;

-- =========================================================================
-- 1. Security posture
-- =========================================================================

select is(
    (select prosecdef from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'run_report'),
    false,
    'run_report is SECURITY INVOKER -- a definer here leaks five tables to every rep');

select is(
    (select prosecdef from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'report_catalog'),
    false,
    'report_catalog is SECURITY INVOKER');

select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public' and tablename = 'report_fields'
        and cmd <> 'SELECT'),
    0,
    'report_fields has no write policy -- sql_expr is not user-authored');

select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public' and tablename = 'report_datasets'
        and cmd <> 'SELECT'),
    0,
    'report_datasets has no write policy');

select ok(
    not has_table_privilege('authenticated', 'public.report_fields', 'INSERT'),
    'authenticated cannot INSERT into report_fields -- privilege, not only policy');

select ok(
    not has_table_privilege('authenticated', 'public.report_fields', 'UPDATE'),
    'authenticated cannot UPDATE report_fields');

select ok(
    has_function_privilege('authenticated', 'public.report_filter_sql(text,text,text,jsonb)', 'EXECUTE'),
    'authenticated may execute report_filter_sql -- run_report is invoker and calls it internally');

-- =========================================================================
-- 2. The injection boundary
-- =========================================================================

select throws_ok(
    $$ select public.run_report('{"dataset":"deals; drop table public.deals","metrics":["deal_count"]}'::jsonb) $$,
    '22023',
    null,
    'an unknown dataset is refused, never interpolated');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
                                  "dimensions":["stage) from public.sales --"]}'::jsonb) $$,
    '22023',
    null,
    'an unknown dimension key is refused rather than concatenated');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["(select current_setting(''x''))"]}'::jsonb) $$,
    '22023',
    null,
    'an unknown metric key is refused');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["stage"]}'::jsonb) $$,
    '22023',
    null,
    'a dimension cannot be used as a metric');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],"dimensions":["amount_sum"]}'::jsonb) $$,
    '22023',
    null,
    'a metric cannot be used as a dimension');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
        "filters":[{"field":"amount_sum","op":"gt","value":1}]}'::jsonb) $$,
    '22023',
    null,
    'a metric cannot be filtered -- that is a HAVING clause, a different question');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
        "filters":[{"field":"created_at","op":"contains","value":"x"}]}'::jsonb) $$,
    '22023',
    null,
    'a text operator is refused on a date field');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
        "filters":[{"field":"stage","op":"gt","value":"a"}]}'::jsonb) $$,
    '22023',
    null,
    'a numeric operator is refused on a text field');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
        "filters":[{"field":"stage","op":"in","value":[]}]}'::jsonb) $$,
    '22023',
    null,
    'an empty IN list raises instead of silently matching everything');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
        "dimensions":["stage","owner","team"]}'::jsonb) $$,
    '22023',
    null,
    'more than two dimensions is refused');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":[]}'::jsonb) $$,
    '22023',
    null,
    'a report with no metric is refused');

select throws_ok(
    $$ select public.run_report('{"dataset":"deals","metrics":["deal_count"],
        "sort":{"field":"owner","direction":"desc"}}'::jsonb) $$,
    '22023',
    null,
    'sorting on a field that was not selected is refused');

--
-- The value path. A filter value carrying SQL must come back as a LITERAL, so
-- the statement matches nothing rather than executing anything.
--
select is(
    public.report_filter_sql('d.stage', 'text', 'eq',
        to_jsonb($x$won'; drop table public.deals; --$x$::text)),
    $x$(d.stage) = 'won''; drop table public.deals; --'$x$,
    'a value containing SQL is quoted as a literal, not interpolated as code');

--
-- Wildcard escaping, asserted on BEHAVIOUR rather than on the generated string.
--
-- The first version of this test compared the SQL text and failed against
-- correct code: quote_literal emits an E-string whenever the value contains a
-- backslash, which is right and is not something a test should pin. What
-- matters is that a user typing "50%" searches for those three characters and
-- does not accidentally write a pattern matching everything that starts with
-- "50".
--
create temp table wildcard_probe(stage text);
insert into wildcard_probe values ('50% off'), ('50 percent off'), ('anything');

create or replace function pg_temp.probe(p_needle text) returns int
language plpgsql as $fn$
declare n int;
begin
    execute format('select count(*) from wildcard_probe where %s',
                   public.report_filter_sql('wildcard_probe.stage', 'text',
                                            'contains', to_jsonb(p_needle)))
       into n;
    return n;
end;
$fn$;

select is(pg_temp.probe('50%'), 1,
    'a percent sign in a contains value is matched literally, not as a wildcard');

select is(pg_temp.probe('50'), 2,
    'an ordinary contains value still matches every row containing it');

select is(pg_temp.probe('_ off'), 0,
    'an underscore is matched literally too, so it does not stand for any character');

-- =========================================================================
-- 3. The executor produces correct figures
-- =========================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"97444444-0000-0000-0000-000000000001"}';

select is(
    (public.run_report('{"dataset":"deals","metrics":["deal_count","amount_sum"],
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'deal_count')::int,
    3,
    'the archived deal is excluded by base_where -- three, not four');

select is(
    (public.run_report('{"dataset":"deals","metrics":["amount_sum"],
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'amount_sum')::numeric,
    600::numeric,
    'amounts sum over the visible rows only (100 + 300 + 200)');

select is(
    (public.run_report('{"dataset":"deals","metrics":["win_rate"],
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'win_rate')::numeric,
    0.5::numeric,
    'win rate counts decided deals only: one won of two decided, the open one excluded');

select is(
    (public.run_report('{"dataset":"deals","metrics":["pipeline_amount"],
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'pipeline_amount')::numeric,
    100::numeric,
    'pipeline excludes both terminal stages, matching teams_summary');

select is(
    jsonb_array_length(
        public.run_report('{"dataset":"deals","metrics":["amount_sum"],"dimensions":["stage"],
          "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}]}'::jsonb) -> 'rows'),
    3,
    'grouping by stage returns one row per stage present');

select is(
    (public.run_report('{"dataset":"deals","metrics":["deal_count"],
      "period":{"field":"created_at","from":"2032-03-06","to":"2032-03-07"},
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'deal_count')::int,
    2,
    'the period filter bounds the rows inclusively at both ends');

select is(
    (public.run_report('{"dataset":"deals","metrics":["amount_sum"],"dimensions":["stage"],
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"}],
      "sort":{"field":"amount_sum","direction":"desc"}}'::jsonb)
      -> 'rows' -> 0 -> 'dimensions' ->> 'stage'),
    'won',
    'sorting by a metric orders the rows by that metric');

select is(
    (public.run_report('{"dataset":"deals","metrics":["deal_count"],
      "filters":[{"field":"owner","op":"eq","value":"Raul Rep"},
                 {"field":"stage","op":"in","value":["won","lost"]}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'deal_count')::int,
    2,
    'an IN filter over a text dimension narrows correctly');

select ok(
    (public.run_report('{"dataset":"deals","metrics":["deal_count"]}'::jsonb) ->> 'truncated')::boolean
        is false,
    'a small result is not reported as truncated');

-- =========================================================================
-- 4. RLS scopes the numbers, because the executor is invoker
-- =========================================================================

set local request.jwt.claims to '{"sub":"97444444-0000-0000-0000-000000000002"}';

select is(
    (public.run_report('{"dataset":"deals","metrics":["amount_sum"],
      "filters":[{"field":"owner","op":"eq","value":"Pia Peer"}]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'amount_sum')::numeric,
    0::numeric,
    'a rep asking for a peer''s figures aggregates nothing -- the owner filter is a filter, not an authorisation parameter');

select is(
    (public.run_report('{"dataset":"deals","metrics":["deal_count"]}'::jsonb)
      -> 'rows' -> 0 -> 'metrics' ->> 'deal_count')::int,
    3,
    'an unfiltered report run by a rep still returns only their own rows');

-- =========================================================================
-- 5. Saved reports
-- =========================================================================

select lives_ok(
    $$ insert into public.reports (name, spec, sales_id)
       values ('Mine', '{"dataset":"deals","metrics":["deal_count"]}'::jsonb, 9802) $$,
    'a rep may save a report of their own');

select throws_ok(
    $$ insert into public.reports (name, spec, sales_id)
       values ('Not mine', '{"dataset":"deals","metrics":["deal_count"]}'::jsonb, 9803) $$,
    '42501',
    null,
    'a rep cannot author a report attributed to somebody else');

select throws_ok(
    $$ insert into public.reports (name, spec, sales_id, is_builtin)
       values ('Fake builtin', '{"dataset":"deals","metrics":["deal_count"]}'::jsonb, null, true) $$,
    '42501',
    null,
    'a user cannot insert into the built-in library');

select is(
    (select count(*)::int from public.reports where id = 1),
    1,
    'the built-in library is readable by a rep');

select is(
    (select count(*)::int from public.reports
      where sales_id = 9803 and not is_builtin),
    0,
    'a rep cannot read another rep''s private report');

reset role;

select * from finish();
rollback;
