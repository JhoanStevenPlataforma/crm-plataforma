--
-- Task module — checklists (§11).
--
-- Two things make a checklist more than a text field:
--   * every tick is attributed and timestamped, like every other state change;
--   * `tasks.checklist_total` / `checklist_done` stay in step with the items,
--     so a list view can render "3/7" without touching the child table (§3.4).
--
-- Those counters shipped with Phase 1 but nothing maintained them. These tests
-- pin down that they now follow the rows, in both directions.
--
begin;

select plan(21);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1111111-0000-0000-0000-000000000001', 'owner.cl@test.local', '{"first_name":"Own","last_name":"Er"}'::jsonb),
  ('f2222222-0000-0000-0000-000000000002', 'mate.cl@test.local',  '{"first_name":"Team","last_name":"Mate"}'::jsonb);

update public.sales set id = 9301, role = 'rep' where user_id = 'f1111111-0000-0000-0000-000000000001';
update public.sales set id = 9302, role = 'rep' where user_id = 'f2222222-0000-0000-0000-000000000002';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9301, 'Ana', 'Ruiz', 9301);

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9301, 9301, 'Preparar la renovación', 'call',
        '2026-09-01 09:00:00+00', 9301, 9301);

select set_config(
    'request.jwt.claims',
    '{"sub":"f1111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. Adding steps: authorship and ordering come from the database, so the
--    common path (typing steps one after another) needs no client-side rank.
--
insert into public.task_checklist_items (id, task_id, label)
values (9401, 9301, 'Revisar el contrato actual');
insert into public.task_checklist_items (id, task_id, label)
values (9402, 9301, 'Pedir precios a finanzas');
insert into public.task_checklist_items (id, task_id, label)
values (9403, 9301, 'Enviar la propuesta');

select results_eq(
    $$select id from public.task_checklist_items
       where task_id = 9301 and deleted_at is null order by position$$,
    $$values (9401::bigint), (9402::bigint), (9403::bigint)$$,
    'items default to the end of the list, in the order they were added');

select is(
    (select created_by from public.task_checklist_items where id = 9401), 9301::bigint,
    'the author of a step comes from the session');

select is(
    (select checklist_total from public.tasks where id = 9301), 3,
    'checklist_total follows the items (the Phase 1 counter nothing maintained)');

select is(
    (select checklist_done from public.tasks where id = 9301), 0,
    'nothing is done yet');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9301 and event_type = 'checklist.item_added'),
    3,
    'each step lands in the same event stream as everything else (§11.3)');

--
-- 2. Ticking a step records WHO and WHEN — the whole point of §11.3.
--
update public.task_checklist_items set is_done = true where id = 9401;

select is(
    (select done_by from public.task_checklist_items where id = 9401), 9301::bigint,
    'ticking a step attributes it to whoever ticked it');

select isnt(
    (select done_at from public.task_checklist_items where id = 9401), null,
    'ticking a step timestamps it');

select is(
    (select checklist_done from public.tasks where id = 9301), 1,
    'checklist_done follows the tick');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9301 and event_type = 'checklist.item_completed'),
    1,
    'completing a step emits checklist.item_completed');

-- A client cannot claim the tick for somebody else: the trigger overwrites it.
update public.task_checklist_items set is_done = false where id = 9401;
update public.task_checklist_items set is_done = true, done_by = 9302 where id = 9401;

select is(
    (select done_by from public.task_checklist_items where id = 9401), 9301::bigint,
    'a step cannot be ticked on somebody else''s behalf');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9301 and event_type = 'checklist.item_reopened'),
    1,
    'un-ticking a step emits checklist.item_reopened rather than erasing it');

--
-- 3. Un-ticking clears the stamp on the row. The history keeps both facts,
--    which is exactly the W3 defect (a lost completion) not repeated here.
--
update public.task_checklist_items set is_done = false where id = 9401;

select is(
    (select done_at from public.task_checklist_items where id = 9401), null,
    'un-ticking clears the completion stamp on the row');

select is(
    (select checklist_done from public.tasks where id = 9301), 0,
    'checklist_done follows the un-tick back down');

select ok(
    (select count(*) from public.task_events
      where task_id = 9301
        and event_type in ('checklist.item_completed', 'checklist.item_reopened')) >= 4,
    'every tick and un-tick is still in the history');

--
-- 4. Reordering is a single-row update thanks to the fractional position.
--
update public.task_checklist_items set position = 0.5 where id = 9403;

select results_eq(
    $$select id from public.task_checklist_items
       where task_id = 9301 and deleted_at is null order by position$$,
    $$values (9403::bigint), (9401::bigint), (9402::bigint)$$,
    'a step moves to the front by writing one fractional position');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9301 and event_type = 'checklist.item_reordered'),
    1,
    'reordering is recorded too');

--
-- 5. Removal is soft, and the counters follow.
--
update public.task_checklist_items set deleted_at = now() where id = 9402;

select is(
    (select checklist_total from public.tasks where id = 9301), 2,
    'a removed step stops counting');

select is(
    (select label from public.task_checklist_items where id = 9402),
    'Pedir precios a finanzas',
    'the removed step is still on disk, for the audit view');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9301 and event_type = 'checklist.item_removed'),
    1,
    'removing a step emits checklist.item_removed');

--
-- 6. A step created already ticked still gets its attribution: the trigger
--    fills it in rather than letting an unattributed completion reach the
--    consistency constraint. Either way the audit hole cannot be reintroduced
--    by a direct write — this is the path that keeps the row, so it is the one
--    worth pinning down.
--
insert into public.task_checklist_items (id, task_id, label, is_done)
values (9404, 9301, 'Ya estaba hecho', true);

select isnt(
    (select done_at from public.task_checklist_items where id = 9404), null,
    'a step inserted already ticked is timestamped by the database');

select is(
    (select done_by from public.task_checklist_items where id = 9404), 9301::bigint,
    'a step inserted already ticked is attributed to whoever inserted it');

select * from finish();
rollback;
