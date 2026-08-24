--
-- Task module — the §7.3 access rule, enforced by Postgres.
--
-- The headline fix: under the original policies a task was visible only to the
-- owner of its parent CONTACT, so a manager could not delegate a task to a rep
-- on somebody else's contact — the assignee simply could not read the row
-- (§1.3 W6 / §1.7 B2). These tests pin the new rule down.
--
-- Every probe runs as the `authenticated` role with a real JWT claim, so RLS is
-- actually exercised; the assertions themselves run as postgres against the
-- probe table.
--
begin;

select plan(14);

alter table public.contacts disable trigger "20_contact_saved";

--
-- Four users: the contact owner (A), the delegate (B), an unrelated rep (C)
-- and a sales manager (M).
--
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rep.a@test.local', '{"first_name":"Rep","last_name":"A"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'rep.b@test.local', '{"first_name":"Rep","last_name":"B"}'::jsonb),
  ('cccccccc-0000-0000-0000-000000000003', 'rep.c@test.local', '{"first_name":"Rep","last_name":"C"}'::jsonb),
  ('dddddddd-0000-0000-0000-000000000004', 'mgr@test.local',   '{"first_name":"Sales","last_name":"Manager"}'::jsonb);

update public.sales set id = 9101, role = 'rep'     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.sales set id = 9102, role = 'rep'     where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
update public.sales set id = 9103, role = 'rep'     where user_id = 'cccccccc-0000-0000-0000-000000000003';
update public.sales set id = 9104, role = 'manager' where user_id = 'dddddddd-0000-0000-0000-000000000004';

-- A owns the contact. C owns a different one.
insert into public.contacts (id, first_name, last_name, sales_id) values
  (9101, 'Ana', 'Ruiz', 9101),
  (9103, 'Carlos', 'Vega', 9103);

--
-- The delegated task: created by A, on A's contact, but OWNED BY B.
-- This is the exact shape the old policies made unreadable for B.
--
insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9101, 9101, 'Llamar a Ana sobre la renovación', 'call',
        '2026-09-01 09:00:00+00', 9102, 9101);

-- A task that belongs to nobody in this test but C, to prove isolation.
insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9103, 9103, 'Tarea privada de C', 'call',
        '2026-09-01 09:00:00+00', 9103, 9103);

--
-- Probe table: filled by each user under RLS, asserted on as postgres.
--
create temporary table rls_probe (who text, task_id bigint);
grant insert on rls_probe to authenticated;

-- Rep B — the delegate.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into rls_probe select 'rep_b', id from public.tasks;
reset role;

-- Rep A — creator and owner of the linked contact.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into rls_probe select 'rep_a', id from public.tasks;
reset role;

-- Rep C — unrelated to task 9101.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into rls_probe select 'rep_c', id from public.tasks;
reset role;

-- Manager — sees everything.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);
insert into rls_probe select 'manager', id from public.tasks;
reset role;

--
-- 1. The fix: the assignee can read a task delegated to them on somebody
--    else's contact.
--
select is(
    (select count(*)::int from rls_probe where who = 'rep_b' and task_id = 9101),
    1,
    'the ASSIGNEE can see a task delegated to them on another rep''s contact (fixes W6/B2)');

select is(
    (select count(*)::int from rls_probe where who = 'rep_b' and task_id = 9103),
    0,
    'the assignee sees only what is theirs — no blanket read');

--
-- 2. Nothing regresses for the previous behaviour: the owner of the linked
--    contact still sees the task (§7.3 rule 4).
--
select is(
    (select count(*)::int from rls_probe where who = 'rep_a' and task_id = 9101),
    1,
    'the owner of the linked contact still sees the task (§7.3 rule 4)');

select is(
    (select count(*)::int from rls_probe where who = 'rep_a' and task_id = 9103),
    0,
    'the contact owner does not gain access to unrelated tasks');

--
-- 3. Isolation.
--
select is(
    (select count(*)::int from rls_probe where who = 'rep_c' and task_id = 9101),
    0,
    'an unrelated rep cannot see the delegated task');

select is(
    (select count(*)::int from rls_probe where who = 'rep_c' and task_id = 9103),
    1,
    'a rep still sees their own task');

--
-- 4. Managers and admins see everything (§7.3 rule 5).
--
-- Asserted per task rather than as a total: the local database may hold other
-- rows, and a manager seeing "exactly 2" would be an assertion about the
-- fixture rather than about the policy.
select is(
    (select count(*)::int from rls_probe
      where who = 'manager' and task_id in (9101, 9103)),
    2,
    'a sales manager sees every task, including ones they own no part of (§7.3 rule 5)');

--
-- 5. Writes are scoped too: a rep may not pin a task to a contact they do not
--    own (the legacy guard, preserved).
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
    $$ insert into public.tasks (contact_id, text, type, due_date, created_by, owner_sales_id)
       values (9101, 'Tarea colada en el contacto de A', 'call',
               '2026-09-01 09:00:00+00', 9101, 9101) $$,
    '42501',
    null,
    'a rep cannot create a task attributed to another user on their contact');

--
-- 6. The state machine enforces capabilities, not just legality (§4.5).
--
select throws_ok(
    $$ select public.transition_task(9101, 'in_progress') $$,
    '42501',
    null,
    'an unrelated rep cannot transition somebody else''s task');

reset role;

--
-- The delegate CAN transition it: that is the whole point of delegation.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
    $$ select public.transition_task(9101, 'in_progress') $$,
    'the assignee CAN transition the task delegated to them');

reset role;

select is(
    (select s.key from public.tasks t join public.task_statuses s on s.id = t.status_id
      where t.id = 9101),
    'in_progress',
    'the delegated transition actually landed');

select is(
    (select actor_sales_id from public.task_events
      where task_id = 9101 and event_type = 'task.started'),
    9102::bigint,
    'the event is attributed to the delegate, not to the contact owner');

--
-- 7. Deleting the contact must not destroy the task (fixes W8 / B5).
--
delete from public.contacts where id = 9101;

select is(
    (select count(*)::int from public.tasks where id = 9101 and deleted_at is null),
    1,
    'deleting the contact leaves the task intact (fixes W8 — no more ON DELETE CASCADE)');

select is(
    (select count(*)::int from public.task_links
      where task_id = 9101 and entity_type = 'contact' and unlinked_at is not null),
    1,
    'the link is CLOSED rather than the task destroyed (§14.3)');

select * from finish();

rollback;
