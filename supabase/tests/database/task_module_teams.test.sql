--
-- Task module — teams, participants and the assignment history (§7).
--
-- The product claim being tested: delegation is recorded, not just performed.
-- After this suite, "who owned this task in June, who added the watcher, and
-- who took the team off it" are answerable from the database alone.
--
-- Also covers the Phase 1 drift bug: `tasks.owner_sales_id` moved without
-- `task_assignments` following it, so the history table quietly kept naming the
-- original owner forever (§7.2).
--
begin;

select plan(19);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('96111111-0000-0000-0000-000000000001', 'team.admin@test.local', '{"first_name":"Tea","last_name":"Admin"}'::jsonb),
  ('96111111-0000-0000-0000-000000000002', 'team.rep@test.local',   '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('96111111-0000-0000-0000-000000000003', 'team.mate@test.local',  '{"first_name":"Marco","last_name":"Mate"}'::jsonb);

update public.sales set id = 9601, role = 'admin'
where user_id = '96111111-0000-0000-0000-000000000001';
update public.sales set id = 9602, role = 'rep'
where user_id = '96111111-0000-0000-0000-000000000002';
update public.sales set id = 9603, role = 'rep'
where user_id = '96111111-0000-0000-0000-000000000003';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9601, 'Ana', 'Ruiz', 9601);

insert into public.teams (id, name, description)
values (9601, 'Renovaciones', 'Equipo de renovaciones');

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9601, 9601, 'Llamar sobre la renovacion', 'call',
        '2026-09-01 09:00:00+00', 9601, 9601);

select set_config(
    'request.jwt.claims',
    '{"sub":"96111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. Creation still seeds exactly one owner assignment, and it stays silent in
--    the timeline: `task.created` already says who owns it.
--
select is(
    (select count(*)::int from public.task_assignments
      where task_id = 9601 and role = 'owner' and unassigned_at is null),
    1,
    'a new task has exactly one active owner assignment');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9601 and event_type = 'task.assigned'),
    0,
    'the seeded owner does not duplicate task.created with an assigned event');

--
-- 2. Reassignment: the projection moves AND the history follows (§7.2).
--    This is the Phase 1 bug.
--
update public.tasks set owner_sales_id = 9602 where id = 9601;

select is(
    (select count(*)::int from public.task_assignments
      where task_id = 9601 and role = 'owner' and unassigned_at is null),
    1,
    'reassignment leaves exactly one active owner');

select is(
    (select sales_id from public.task_assignments
      where task_id = 9601 and role = 'owner' and unassigned_at is null),
    9602::bigint,
    'the active owner assignment names the new owner');

select is(
    (select unassigned_by from public.task_assignments
      where task_id = 9601 and role = 'owner' and sales_id = 9601),
    9601::bigint,
    'the closed row records who removed the previous owner');

select isnt(
    (select unassigned_at from public.task_assignments
      where task_id = 9601 and role = 'owner' and sales_id = 9601),
    null,
    'the previous owner row is closed, not deleted');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9601 and event_type = 'task.reassigned'),
    1,
    'the reassignment is one event, not three');

--
-- 3. Watchers and collaborators: added by a human, attributed to that human.
--
insert into public.task_assignments (task_id, sales_id, role)
values (9601, 9603, 'watcher');

select is(
    (select assigned_by from public.task_assignments
      where task_id = 9601 and role = 'watcher' and sales_id = 9603),
    9601::bigint,
    'assigned_by is stamped from the session, not trusted from the client');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9601 and event_type = 'task.watcher_added'),
    1,
    'adding a watcher is in the timeline');

insert into public.task_assignments (task_id, sales_id, role)
values (9601, 9603, 'collaborator');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9601 and event_type = 'task.assigned'),
    1,
    'adding a collaborator emits task.assigned');

--
-- 4. A team on the task, and the membership that makes it mean something.
--
insert into public.task_assignments (task_id, team_id, role)
values (9601, 9601, 'team');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9601 and event_type = 'task.team_assigned'),
    1,
    'assigning a team is its own event type');

--
-- 5. Removal closes the row and records who did it.
--
update public.task_assignments
   set unassigned_at = now()
 where task_id = 9601 and role = 'watcher' and sales_id = 9603;

select is(
    (select unassigned_by from public.task_assignments
      where task_id = 9601 and role = 'watcher' and sales_id = 9603),
    9601::bigint,
    'unassigned_by is stamped on the way out too');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9601 and event_type = 'task.watcher_removed'),
    1,
    'removing a watcher is in the timeline');

--
-- 6. Team membership grants access to the team's tasks — the delegation fix
--    (W6/B2) applied to a whole team rather than one person.
--
insert into public.team_members (team_id, sales_id) values (9601, 9603);

select set_config(
    'request.jwt.claims',
    '{"sub":"96111111-0000-0000-0000-000000000003","role":"authenticated"}',
    true);

select ok(
    public.can_see_task(9601),
    'a team member sees a task assigned to their team');

set local role authenticated;

select is(
    (select count(*)::int from public.tasks where id = 9601),
    1,
    'and RLS agrees: the row is actually selectable');

--
-- 7. A rep may not invent or edit teams. Reference data a rep can rewrite is
--    not reference data.
--
select throws_ok(
    $$insert into public.teams (name) values ('Equipo pirata')$$,
    '42501',
    'new row violates row-level security policy for table "teams"',
    'a rep cannot create a team');

select throws_ok(
    $$insert into public.team_members (team_id, sales_id) values (9601, 9602)$$,
    '42501',
    'new row violates row-level security policy for table "team_members"',
    'a rep cannot add themselves to a team');

reset role;

--
-- 8. An admin can. The management UI has a backend to talk to.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"96111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);
set local role authenticated;

select lives_ok(
    $$insert into public.teams (name) values ('Equipo nuevo')$$,
    'an admin creates a team');

reset role;

--
-- 9. The list view counts members without aggregating the whole table.
--
select is(
    (select nb_members::int from public.teams_summary where id = 9601),
    1,
    'teams_summary reports the member count');

select * from finish();
rollback;
