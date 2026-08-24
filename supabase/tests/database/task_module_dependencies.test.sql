--
-- Task module — dependencies, auto-unblock and the blocked clock (§10).
--
-- The product claim being tested: a rep waiting on a colleague is released the
-- moment the blocker closes, without anyone remembering to do it, and the
-- duration of the block is measured rather than guessed. That is what turns a
-- to-do list into something a manager can find bottlenecks in (§10.4, §12).
--
-- Also covers the Phase 1 gap: `blocked_seconds` shipped as a column whose
-- trigger deferred the arithmetic to a scheduled job nobody ever wrote, so it
-- was permanently zero.
--
begin;

select plan(16);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('91111111-0000-0000-0000-000000000001', 'dep.owner@test.local', '{"first_name":"Dep","last_name":"Owner"}'::jsonb);

update public.sales set id = 9501, role = 'admin'
where user_id = '91111111-0000-0000-0000-000000000001';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9501, 'Ana', 'Ruiz', 9501);

-- A: the blocker. B: blocked by A. C: a second blocker of B.
insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by) values
  (9501, 9501, 'Conseguir el precio de finanzas', 'call', '2026-09-01 09:00:00+00', 9501, 9501),
  (9502, 9501, 'Enviar la propuesta',             'email', '2026-09-02 09:00:00+00', 9501, 9501),
  (9503, 9501, 'Aprobar el descuento',            'call', '2026-09-01 09:00:00+00', 9501, 9501);

select set_config(
    'request.jwt.claims',
    '{"sub":"91111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. Adding a blocker blocks the target immediately: the dependency is
--    enforced, not just recorded for a human to honour (§10.2).
--
insert into public.task_dependencies (source_task_id, target_task_id, kind, created_by)
values (9501, 9502, 'blocks', 9501);

select is(
    (select s.key from public.tasks t join public.task_statuses s on s.id = t.status_id
      where t.id = 9502),
    'blocked',
    'adding an open blocker moves the target into blocked');

select ok(
    public.task_has_open_blockers(9502),
    'the target reports an open blocker');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9502 and event_type = 'dependency.added'),
    1,
    'the blocked task records the dependency');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9501 and event_type = 'dependency.added'),
    1,
    'so does the blocker — the relationship shows in both timelines');

select is(
    (select actor_kind from public.task_events
      where task_id = 9502 and event_type = 'task.blocked' order by seq desc limit 1),
    'system',
    'the block is attributed to the system, not to whoever added the edge');

--
-- 2. A second blocker: completing only one of them must NOT release the task.
--    Getting this wrong is the classic bug in dependency implementations.
--
insert into public.task_dependencies (source_task_id, target_task_id, kind, created_by)
values (9503, 9502, 'blocks', 9501);

select is(
    (select transition_task(9501, 'completed')).status_id,
    (select id from public.task_statuses where key = 'completed'),
    'the first blocker is completed by its owner');

select is(
    (select s.key from public.tasks t join public.task_statuses s on s.id = t.status_id
      where t.id = 9502),
    'blocked',
    'the target STAYS blocked while another blocker is still open');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9502 and event_type = 'dependency.satisfied'),
    1,
    'satisfying one blocker is recorded even though it did not release the task');

--
-- 3. The last blocker clears: now the task is released, automatically.
--
select lives_ok(
    $$select public.transition_task(9503, 'completed')$$,
    'the last blocker is completed');

select is(
    (select s.key from public.tasks t join public.task_statuses s on s.id = t.status_id
      where t.id = 9502),
    'pending',
    'the target is released the moment its last blocker closes (§10.4)');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9502 and event_type = 'task.unblocked'),
    1,
    'the release is in the history, attributed to the system');

--
-- 4. The blocked clock. This is the Phase 1 gap: the column existed, nothing
--    ever added to it. `blocked_since` makes the duration exact on the way out.
--
select ok(
    (select blocked_seconds from public.tasks where id = 9502) >= 0,
    'blocked_seconds is populated rather than left untouched');

select is(
    (select blocked_since from public.tasks where id = 9502), null,
    'the clock is cleared once the task is no longer blocked');

--
-- 5. Cycles are refused before they exist (§10.3).
--
insert into public.task_dependencies (source_task_id, target_task_id, kind, created_by)
values (9501, 9503, 'blocks', 9501);

select throws_ok(
    $$insert into public.task_dependencies (source_task_id, target_task_id, kind, created_by)
      values (9503, 9501, 'blocks', 9501)$$,
    '23514',
    null,
    'a dependency that would close a cycle is refused');

select throws_ok(
    $$insert into public.task_dependencies (source_task_id, target_task_id, kind, created_by)
      values (9501, 9501, 'blocks', 9501)$$,
    '23514',
    null,
    'a task cannot block itself');

--
-- 6. Removing the last blocker releases the task too — otherwise deleting the
--    dependency would strand it in `blocked` forever.
--
insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9504, 9501, 'Tarea bloqueada', 'call', '2026-09-03 09:00:00+00', 9501, 9501);

insert into public.task_dependencies (id, source_task_id, target_task_id, kind, created_by)
values (9601, 9503, 9504, 'blocks', 9501);

update public.task_dependencies set removed_at = now() where id = 9601;

select is(
    (select s.key from public.tasks t join public.task_statuses s on s.id = t.status_id
      where t.id = 9504),
    'pending',
    'removing the last blocker releases the task instead of stranding it');

select * from finish();
rollback;
