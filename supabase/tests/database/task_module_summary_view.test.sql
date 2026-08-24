--
-- Task module — the tasks_summary read projection (proposal §3.4, §15).
--
-- The view is what every list and panel reads. Two things must hold: it
-- denormalizes the catalogues so the client never resolves them row by row,
-- and it inherits the task RLS (security_invoker) so it cannot become a
-- read-around of the §7.3 access rule.
--
begin;

select plan(20);

select has_view('public', 'tasks_summary', 'tasks_summary exists');

--
-- The OTHER views that read public.tasks. They are listed here because adding
-- a column to `tasks` forces Postgres to drop every view that depends on it,
-- and `supabase db diff` duly emits the drops — with the recreations far lower
-- down the generated file. Hand-trimming that diff has already lost a
-- recreation once, which takes the contact list down with a schema-cache miss
-- and nothing in the suite noticing. These four assertions are the tripwire.
--
select has_view('public', 'contacts_summary', 'contacts_summary still exists');
select has_column('public', 'contacts_summary', 'nb_tasks',
    'contacts_summary still exposes nb_tasks (the reason it reads tasks at all)');
select has_view('public', 'companies_summary', 'companies_summary still exists');
select has_view('public', 'activity_log', 'activity_log still exists');

select has_column('public', 'tasks_summary', 'status_key',           'status_key is exposed');
select has_column('public', 'tasks_summary', 'priority_key',         'priority_key is exposed');
select has_column('public', 'tasks_summary', 'type_key',             'type_key is exposed');
select has_column('public', 'tasks_summary', 'owner_name',           'owner_name is exposed');
select has_column('public', 'tasks_summary', 'primary_entity_type',  'the primary link type is exposed');
select has_column('public', 'tasks_summary', 'reschedule_count',     'the traceability counters are exposed');
select has_column('public', 'tasks_summary', 'is_overdue',           'is_overdue is exposed for display');

--
-- The view must be security_invoker, or it would bypass the task policies.
--
select ok(
    (select reloptions::text from pg_class where relname = 'tasks_summary')
        like '%security_invoker=on%',
    'tasks_summary runs with security_invoker (§17.2 — no read-around)');

--
-- Fixtures.
--
alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'owner.v@test.local', '{"first_name":"Vera","last_name":"Owner"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-0000000000f2', 'other.v@test.local', '{"first_name":"Otto","last_name":"Other"}'::jsonb);

update public.sales set id = 9301, role = 'rep' where user_id = 'aaaaaaaa-0000-0000-0000-0000000000f1';
update public.sales set id = 9302, role = 'rep' where user_id = 'bbbbbbbb-0000-0000-0000-0000000000f2';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9301, 'Ana', 'Ruiz', 9301);

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9301, 9301, 'Llamar a Ana', 'call', '2020-01-01 09:00:00+00', 9301, 9301);

--
-- Denormalization.
--
select is(
    (select status_key from public.tasks_summary where id = 9301), 'pending',
    'the status catalogue is resolved in the view');

select is(
    (select priority_key from public.tasks_summary where id = 9301), 'normal',
    'the priority catalogue is resolved in the view');

select is(
    (select type_key from public.tasks_summary where id = 9301), 'call',
    'the type catalogue is resolved in the view');

select is(
    (select owner_name from public.tasks_summary where id = 9301), 'Vera Owner',
    'the owner name is resolved in the view (no N+1 from the list)');

select is(
    (select primary_entity_type from public.tasks_summary where id = 9301), 'contact',
    'the primary link is resolved in the view (§14.2)');

select ok(
    (select is_overdue from public.tasks_summary where id = 9301),
    'a task due in 2020 reads as overdue');

--
-- RLS inheritance: an unrelated rep must not see the row THROUGH THE VIEW.
--
create temporary table view_probe (who text, task_id bigint);
grant insert on view_probe to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
insert into view_probe select 'other', id from public.tasks_summary;
reset role;

select is(
    (select count(*)::int from view_probe where who = 'other' and task_id = 9301),
    0,
    'the view does not leak tasks past the §7.3 access rule');

select * from finish();

rollback;
