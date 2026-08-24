--
-- Deal stage history — the audit trail behind the kanban dialog.
--
-- The product claim: after this change, "why is this deal in 'proposal sent'?"
-- always has an answer in the database, and that answer cannot be forged.
-- Three things have to hold for that, and none of them is visible from the UI:
--
--   * every stage change is recorded, including the ones that never touch the
--     kanban (the edit form, an import) — otherwise the timeline is a partial
--     history, which is worse than none because it reads as complete;
--   * the reason typed in the dialog belongs to the deal it was typed for, and
--     to no other deal updated in the same transaction (the kanban reindexes
--     its neighbours on every drop, so this is the normal case, not an edge);
--   * the trail is append-only for users. A history a rep can rewrite proves
--     nothing about what happened.
--
begin;

select plan(17);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('96222222-0000-0000-0000-000000000001', 'stage.admin@test.local', '{"first_name":"Alba","last_name":"Admin"}'::jsonb),
  ('96222222-0000-0000-0000-000000000002', 'stage.rep@test.local',   '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('96222222-0000-0000-0000-000000000003', 'stage.other@test.local', '{"first_name":"Otto","last_name":"Otro"}'::jsonb);

update public.sales set id = 9601, role = 'admin' where user_id = '96222222-0000-0000-0000-000000000001';
update public.sales set id = 9602, role = 'rep'   where user_id = '96222222-0000-0000-0000-000000000002';
update public.sales set id = 9603, role = 'rep'   where user_id = '96222222-0000-0000-0000-000000000003';

-- Two deals owned by the rep (the second one is the neighbour the kanban
-- reindexes on a drop) and one owned by somebody else.
insert into public.deals (id, name, stage, amount, sales_id, index, expected_closing_date)
values
  (9601, 'Renovacion Norte', 'opportunity', 120000, 9602, 0, current_date),
  (9602, 'Vecino en la misma columna', 'opportunity', 90000, 9602, 1, current_date),
  (9603, 'Deal de otro comercial', 'opportunity', 50000, 9603, 0, current_date);

-- A transition on the other rep's deal, so the isolation assertion below has
-- something real to fail to see rather than an empty table.
update public.deals set stage = 'in-negociation' where id = 9603;

--
-- 1. The documented path: the move and its justification are one transaction.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"96222222-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
    $$select public.move_deal_stage(
        9601, 'proposal-sent', 'Propuesta enviada tras la visita del martes', 0,
        '[{"src":"https://example.test/propuesta.pdf","title":"propuesta.pdf","type":"application/pdf"}]'::jsonb)$$,
    'the owner moves their own deal through move_deal_stage()');

reset role;

select is(
    (select stage from public.deals where id = 9601),
    'proposal-sent',
    'the deal actually moved');

select is(
    (select reason from public.deal_stage_changes where deal_id = 9601),
    'Propuesta enviada tras la visita del martes',
    'the reason typed in the dialog is on the history row');

select is(
    (select from_stage || ' -> ' || to_stage from public.deal_stage_changes where deal_id = 9601),
    'opportunity -> proposal-sent',
    'both ends of the transition are recorded, not just the new stage');

select is(
    (select sales_id from public.deal_stage_changes where deal_id = 9601),
    9602::bigint,
    'the mover is attributed from the session, not from the request body');

select is(
    (select (attachments[1] ->> 'title') from public.deal_stage_changes where deal_id = 9601),
    'propuesta.pdf',
    'the files that justified the move travel with it');

--
-- 2. The reason belongs to one deal. The kanban reindexes the neighbours of a
--    drop in the same transaction; if the settings leaked, the neighbour's own
--    later stage change would inherit a reason nobody typed for it.
--
update public.deals set index = 5 where id = 9602;

select is(
    (select count(*)::int from public.deal_stage_changes where deal_id = 9602),
    0,
    'reindexing a neighbour writes no history: only the stage matters here');

--
-- 3. A stage change that never goes through the dialog is still recorded —
--    with a null reason, so an undocumented move stays visible as one.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"96222222-0000-0000-0000-000000000002","role":"authenticated"}', true);

update public.deals set stage = 'in-negociation' where id = 9602;

reset role;

select is(
    (select count(*)::int from public.deal_stage_changes where deal_id = 9602),
    1,
    'the edit form path is recorded too — the trail has no blind spot');

select is(
    (select reason from public.deal_stage_changes where deal_id = 9602),
    null,
    'an undocumented move records a null reason rather than a borrowed one');

--
-- 4. What the RPC refuses.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"96222222-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
    $$select public.move_deal_stage(9601, 'won', '   ')$$,
    '23514',
    null,
    'a blank reason is refused: the dialog cannot be clicked past');

select throws_ok(
    $$select public.move_deal_stage(9601, 'proposal-sent', 'ya esta ahi')$$,
    '23514',
    null,
    'moving a deal to the stage it is already in is not a transition');

select throws_ok(
    $$select public.move_deal_stage(9603, 'won', 'me lo apunto yo')$$,
    '42501',
    null,
    'a rep cannot move a deal they do not own, RPC or not');

--
-- 5. Append-only. The trail is not editable by the people it describes.
--
select throws_ok(
    $$insert into public.deal_stage_changes (deal_id, from_stage, to_stage, reason)
      values (9601, 'won', 'opportunity', 'historia inventada')$$,
    '42501',
    null,
    'a user cannot forge a history row');

select throws_ok(
    $$update public.deal_stage_changes set reason = 'otra cosa' where deal_id = 9601$$,
    '42501',
    null,
    'a user cannot rewrite the reason after the fact');

select throws_ok(
    $$delete from public.deal_stage_changes where deal_id = 9601$$,
    '42501',
    null,
    'a user cannot erase a transition');

--
-- 6. Visibility follows the deal, and the timeline carries the whole story.
--
select is(
    (select count(*)::int from public.deal_stage_changes where deal_id = 9603),
    0,
    'a rep does not read the history of somebody else''s deal');

select is(
    (select payload ->> 'reason'
       from public.timeline_events
      where entity_type = 'deal' and entity_id = 9601
        and event_type = 'deal.stage_changed'),
    'Propuesta enviada tras la visita del martes',
    'the deal timeline serves the reason, so the page needs no second query');

reset role;

select * from finish();
rollback;
