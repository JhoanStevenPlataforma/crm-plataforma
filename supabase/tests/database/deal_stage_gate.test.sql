--
-- The completed-task rule: a deal only advances once work was done on it.
--
-- The product claim: a card cannot cross a column boundary on the strength of a
-- sentence somebody typed. Four things have to hold, and none of them is
-- visible from the UI:
--
--   * the count is anchored on the deal's entry into its CURRENT stage. Count
--     every task the deal ever completed and the first one unlocks the whole
--     pipeline forever, which is exactly the inspection this rule exists to
--     force;
--   * only work that is really on this deal, really finished, and still there
--     counts — not a deleted task, not an unlinked one, not somebody else's;
--   * a deal that was already parked in a stage when the rule shipped gets its
--     current move for free, or the board freezes on deploy day;
--   * the escape valve is admin-only and always leaves a row behind. A manager
--     may move anybody's deal, but not past the rule.
--
-- NOTE for whoever edits this: `now()` is the TRANSACTION timestamp, so every
-- call inside this test returns the same instant. The temporal assertions below
-- depend on that — they place completions explicitly before or after it rather
-- than trusting statements to run at different times.
--
begin;

select plan(19);

alter table public.contacts disable trigger "20_contact_saved";

--
-- 0. What the migration shipped, before the test bends it.
--
select is(
    (select count(*)::int from public.deal_stage_requirements
      where min_completed_tasks >= 1 and enforced_from is not null),
    6,
    'every stage the default configuration ships is gated at one completed task');

-- From here on the rule is pinned to a known instant, so "before" and "after"
-- are the test's to decide rather than the migration's.
update public.deal_stage_requirements
   set min_completed_tasks = 1,
       enforced_from = now() - interval '30 days';

--
-- An admin, the rep who owns the deals, and a sales manager.
--
insert into auth.users (id, email, raw_user_meta_data) values
  ('97333333-0000-0000-0000-000000000001', 'gate.admin@test.local', '{"first_name":"Ada","last_name":"Admin"}'::jsonb),
  ('97333333-0000-0000-0000-000000000002', 'gate.rep@test.local',   '{"first_name":"Rosa","last_name":"Rep"}'::jsonb),
  ('97333333-0000-0000-0000-000000000003', 'gate.mgr@test.local',   '{"first_name":"Mario","last_name":"Manager"}'::jsonb);

update public.sales set id = 9701, role = 'admin'   where user_id = '97333333-0000-0000-0000-000000000001';
update public.sales set id = 9702, role = 'rep'     where user_id = '97333333-0000-0000-0000-000000000002';
update public.sales set id = 9703, role = 'manager' where user_id = '97333333-0000-0000-0000-000000000003';

--
-- Six deals, all owned by the rep. `created_at` is explicit because it is the
-- anchor for a deal that has never moved.
--
insert into public.deals (id, name, stage, amount, sales_id, index, expected_closing_date, created_at)
values
  (9701, 'Sin trabajo hecho',    'opportunity', 10000, 9702, 0, current_date, now() - interval '10 days'),
  (9702, 'Con trabajo hecho',    'opportunity', 20000, 9702, 1, current_date, now() - interval '10 days'),
  (9703, 'Trabajo de antes',     'opportunity', 30000, 9702, 2, current_date, now() - interval '10 days'),
  (9704, 'Aparcado desde antes', 'opportunity', 40000, 9702, 3, current_date, now() - interval '60 days'),
  (9705, 'Para el override',     'opportunity', 50000, 9702, 4, current_date, now() - interval '10 days'),
  (9706, 'Tarea borrada',        'opportunity', 60000, 9702, 5, current_date, now() - interval '10 days');

--
-- Tasks. `done_date` drives `completed_at` through `tasks_defaults_on_insert`,
-- which is how a completed task is created without going through the state
-- machine for a rule that reads the columns anyway.
--
insert into public.tasks (id, text, type, due_date, done_date, owner_sales_id, created_by) values
  -- Finished an hour ago: recent enough for the deal's first move, and — once
  -- that move happens — too old for the next one.
  (9701, 'Llamada de descubrimiento', 'call', now(), now() - interval '1 hour', 9702, 9702),
  -- Finished before deal 9703 even existed in its current stage.
  (9702, 'Llamada de hace un mes',    'call', now(), now() - interval '20 days', 9702, 9702),
  -- Completed, then deleted. The work is gone; the row is not.
  (9703, 'Tarea que se borro',        'call', now(), now() - interval '1 hour', 9702, 9702),
  -- Completed, but its link to deal 9701 was removed afterwards.
  (9704, 'Tarea desvinculada',        'call', now(), now() - interval '1 hour', 9702, 9702);

insert into public.task_links (task_id, entity_type, entity_id, is_primary, linked_by, unlinked_at) values
  (9701, 'deal', 9702, true, 9702, null),
  (9702, 'deal', 9703, true, 9702, null),
  (9703, 'deal', 9706, true, 9702, null),
  -- Was on 9701, is not any more.
  (9704, 'deal', 9701, true, 9702, now() - interval '10 minutes');

-- Soft delete, exactly as `tasks_soft_delete()` leaves it.
update public.tasks set deleted_at = now(), deleted_by = 9702 where id = 9703;

--
-- 1. A deal with nothing done on it.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97333333-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
    (public.deal_stage_gate(9701, 'proposal-sent') ->> 'ok')::boolean,
    false,
    'a deal with no completed task has not earned the next stage');

select is(
    (public.deal_stage_gate(9701, 'proposal-sent') ->> 'completed')::int,
    0,
    'a completed task whose link was removed stops counting for that deal');

select throws_ok(
    $$select public.move_deal_stage(9701, 'proposal-sent', 'el cliente dice que si')$$,
    '23514',
    null,
    'a written reason is not enough on its own: the move is refused');

reset role;

select is(
    (select stage from public.deals where id = 9701),
    'opportunity',
    'the refused deal did not move');

select is(
    (select count(*)::int from public.deal_stage_changes where deal_id = 9701),
    0,
    'a refused move leaves no history row');

--
-- 2. The anchor: one completed task buys ONE stage, not the pipeline.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97333333-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
    (public.deal_stage_gate(9702, 'proposal-sent') ->> 'ok')::boolean,
    true,
    'a task completed while the deal sat in this stage opens the next one');

select lives_ok(
    $$select public.move_deal_stage(9702, 'proposal-sent', 'Propuesta enviada tras la llamada')$$,
    'the move goes through once the work behind it exists');

select throws_ok(
    $$select public.move_deal_stage(9702, 'in-negociation', 'seguimos avanzando')$$,
    '23514',
    null,
    'the SAME completed task does not open a second stage: it predates the new one');

reset role;

-- New work, finished now — that is, at or after the moment the deal entered
-- 'proposal-sent', which the move above stamped with the same now().
insert into public.tasks (id, text, type, due_date, done_date, owner_sales_id, created_by)
values (9705, 'Revision de la propuesta con el cliente', 'call', now(), now(), 9702, 9702);
insert into public.task_links (task_id, entity_type, entity_id, is_primary, linked_by)
values (9705, 'deal', 9702, true, 9702);

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97333333-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
    $$select public.move_deal_stage(9702, 'in-negociation', 'Entramos en negociacion')$$,
    'new work in the new stage opens the stage after it');

--
-- 3. What does not count as work on this deal.
--
select is(
    (public.deal_stage_gate(9703, 'proposal-sent') ->> 'completed')::int,
    0,
    'a task completed before the deal entered its current stage does not count');

select is(
    (public.deal_stage_gate(9706, 'proposal-sent') ->> 'completed')::int,
    0,
    'a completed task that was deleted does not count');

-- Deal 9702 has two completed tasks by now, and other deals have their own.
-- Naming the ids it counted is the assertion that pins BOTH exclusions at once:
-- the deal's own older task (wrong side of the anchor) and everybody else's.
select is(
    public.deal_stage_gate(9702, 'won') -> 'qualifying_task_ids',
    '[9705]'::jsonb,
    'the gate names the work it counted, and counts nothing else');

--
-- 4. The deals that were already on the board when the rule shipped.
--
select lives_ok(
    $$select public.move_deal_stage(9704, 'proposal-sent', 'Retomamos el contacto')$$,
    'a deal parked in its stage since before the rule moves once without a task');

--
-- 5. The override is admin-only, and written down.
--
select throws_ok(
    $$select public.move_deal_stage(9705, 'proposal-sent', 'lo muevo yo', null, '[]'::jsonb, 'porque lo digo yo')$$,
    '23514',
    null,
    'a rep cannot let themselves through by filling in the override');

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97333333-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
    $$select public.move_deal_stage(9705, 'proposal-sent', 'lo muevo yo', null, '[]'::jsonb, 'urge cerrar el trimestre')$$,
    '23514',
    null,
    'a manager may move anybody''s deal, but not past the rule');

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97333333-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
    $$select public.move_deal_stage(9705, 'proposal-sent', 'Contrato firmado por fuera del CRM', null, '[]'::jsonb, 'Firma recibida por email, la tarea se registra manana')$$,
    'an admin overrides the rule when they say why');

reset role;

-- Ordered by id, not by `changed_at`: every row written in this transaction
-- carries the same `now()`, so a timestamp sort picks a row at random.
select is(
    (select override_reason from public.deal_stage_changes
      where deal_id = 9705 order by id desc limit 1),
    'Firma recibida por email, la tarea se registra manana',
    'the override is written on the history row, so skipped moves are countable');

select is(
    (select override_reason from public.deal_stage_changes
      where deal_id = 9702 order by id asc limit 1)::text,
    null::text,
    'a move that met the rule is not marked as an override');

select * from finish();
rollback;
