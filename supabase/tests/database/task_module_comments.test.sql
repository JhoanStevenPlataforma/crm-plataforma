--
-- Task module — collaboration: comments, revisions, mentions, reactions (§8).
--
-- The point of putting comments in the CRM rather than in a chat tool is that
-- the coordination becomes auditable. So these tests are less about "a comment
-- can be written" and more about the guarantees that make it evidence:
--   * the author is resolved server-side and cannot be forged or rewritten;
--   * an edit always leaves the previous body behind;
--   * a delete is soft — the body survives for the audit view;
--   * mentions are derived from the body, never taken from the client;
--   * a private comment is invisible to a colleague who can see the task.
--
begin;

select plan(30);

alter table public.contacts disable trigger "20_contact_saved";

--
-- Fixtures: an author (A), a colleague who shares the task (B), an outsider (C)
-- and a manager (M). Users go through `on_auth_user_created` like a real signup,
-- then their ids are pinned to keep the assertions readable.
--
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-0000-0000-0000-000000000001', 'author@test.local',    '{"first_name":"Aut","last_name":"Hor"}'::jsonb),
  ('b2222222-0000-0000-0000-000000000002', 'colleague@test.local', '{"first_name":"Col","last_name":"League"}'::jsonb),
  ('c3333333-0000-0000-0000-000000000003', 'outsider@test.local',  '{"first_name":"Out","last_name":"Sider"}'::jsonb),
  ('d4444444-0000-0000-0000-000000000004', 'boss@test.local',      '{"first_name":"The","last_name":"Boss"}'::jsonb);

update public.sales set id = 9201, role = 'rep'     where user_id = 'a1111111-0000-0000-0000-000000000001';
update public.sales set id = 9202, role = 'rep'     where user_id = 'b2222222-0000-0000-0000-000000000002';
update public.sales set id = 9203, role = 'rep'     where user_id = 'c3333333-0000-0000-0000-000000000003';
update public.sales set id = 9204, role = 'manager' where user_id = 'd4444444-0000-0000-0000-000000000004';

-- A disabled user must never become a mention target.
insert into auth.users (id, email, raw_user_meta_data)
values ('e5555555-0000-0000-0000-000000000005', 'gone@test.local', '{"first_name":"Ex","last_name":"Employee"}'::jsonb);
update public.sales set id = 9205, disabled = true
where user_id = 'e5555555-0000-0000-0000-000000000005';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9201, 'Ana', 'Ruiz', 9201);

-- Task owned by A; B is an active collaborator, so B can see it (§7.3 rule 1).
insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9201, 9201, 'Renovación Acme', 'call', '2026-09-01 09:00:00+00', 9201, 9201);

insert into public.task_assignments (task_id, sales_id, role, assigned_by)
values (9201, 9202, 'collaborator', 9201);

-- A second task, to prove a reply cannot cross task boundaries.
insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9202, 9201, 'Otra tarea', 'call', '2026-09-01 09:00:00+00', 9201, 9201);

select set_config(
    'request.jwt.claims',
    '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. Creation: counter, event, and authorship resolved from the session.
--
-- `author_id` is deliberately set to somebody else here: the trigger must
-- overwrite it with the session's identity, otherwise a client could post in a
-- colleague's name and the audit trail would be worthless.
--
insert into public.task_comments (id, task_id, author_id, body)
values (9301, 9201, 9203, 'Llamé al cliente, sin respuesta.');

select is(
    (select author_id from public.task_comments where id = 9301), 9201::bigint,
    'the author comes from the session, not from what the client sent');

select is(
    (select comment_count from public.tasks where id = 9201), 1,
    'commenting bumps the denormalized counter the list view reads (§3.4)');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9201 and event_type = 'comment.created'),
    1,
    'a comment emits comment.created into the one event stream (§8.3)');

select is(
    (select note from public.task_events
      where task_id = 9201 and event_type = 'comment.created'),
    'Llamé al cliente, sin respuesta.',
    'the event carries the body, so the timeline can render it without a join');

--
-- 2. Threads are one level deep (§8.2): a reply to a reply re-parents to the
--    root rather than being rejected — losing the comment would be worse than
--    losing the indentation.
--
insert into public.task_comments (id, task_id, parent_id, body)
values (9302, 9201, 9301, 'Reintento mañana.');

insert into public.task_comments (id, task_id, parent_id, body)
values (9303, 9201, 9302, 'De acuerdo.');

select is(
    (select parent_id from public.task_comments where id = 9303), 9301::bigint,
    'a reply to a reply attaches to the thread root instead of nesting deeper');

select throws_ok(
    $$insert into public.task_comments (task_id, parent_id, body)
      values (9202, 9301, 'reply across tasks')$$,
    '23514',
    null,
    'a reply cannot be attached to a comment on a different task');

--
-- 3. Editing: the previous body survives as a revision (§8.2). "Edited" without
--    the old text is not an audit trail.
--
update public.task_comments
   set body = 'Llamé al cliente, contestó el buzón.'
 where id = 9301;

select is(
    (select body from public.task_comment_revisions where comment_id = 9301 and revision = 1),
    'Llamé al cliente, sin respuesta.',
    'the body before an edit is kept as a revision');

select is(
    (select edit_count from public.task_comments where id = 9301), 1,
    'edit_count is stamped by the trigger, so "editado xN" cannot be faked');

select isnt(
    (select edited_at from public.task_comments where id = 9301), null,
    'edited_at is stamped on edit');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9201 and event_type = 'comment.edited'),
    1,
    'an edit emits comment.edited');

select is(
    (select old_value ->> 'body' from public.task_events
      where task_id = 9201 and event_type = 'comment.edited'),
    'Llamé al cliente, sin respuesta.',
    'the edit event carries the before value, which is what a diff needs');

--
-- 4. The three facts the audit hangs off are not editable, whatever the client
--    sends: who wrote it, when, and on which task.
--
update public.task_comments
   set author_id = 9203, created_at = '2000-01-01', task_id = 9202
 where id = 9301;

select is(
    (select author_id from public.task_comments where id = 9301), 9201::bigint,
    'authorship cannot be rewritten by an update');

select is(
    (select task_id from public.task_comments where id = 9301), 9201::bigint,
    'a comment cannot be moved to another task');

select ok(
    (select created_at from public.task_comments where id = 9301) > '2020-01-01'::timestamptz,
    'the creation date cannot be backdated');

--
-- 5. Revisions are as immutable as the event stream (§5.1).
--
select throws_ok(
    $$update public.task_comment_revisions set body = 'rewritten' where comment_id = 9301$$,
    '42501',
    null,
    'a revision cannot be rewritten');

select throws_ok(
    $$delete from public.task_comment_revisions where comment_id = 9301$$,
    '42501',
    null,
    'a revision cannot be deleted');

--
-- 6. Mentions are parsed from the body, server-side (§8.2).
--
insert into public.task_comments (id, task_id, body)
values (9304, 9201,
        '@[Col](sales:9202) @[Boss](sales:9204) @[Ex](sales:9205) @[Ghost](sales:9999) miradlo');

select results_eq(
    $$select mentioned_sales_id from public.task_comment_mentions
       where comment_id = 9304 order by 1$$,
    $$values (9202::bigint), (9204::bigint)$$,
    'only real, active people become mentions — a stale id and a disabled user are dropped');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9201 and event_type = 'mention.created'),
    2,
    'each resolved mention emits its own event');

-- Re-parsing on edit: the mention the author removed goes, the one they kept
-- stays — along with the read receipt it had already collected.
update public.task_comment_mentions set read_at = now()
 where comment_id = 9304 and mentioned_sales_id = 9202;

update public.task_comments
   set body = '@[Col](sales:9202) al final solo tú'
 where id = 9304;

select results_eq(
    $$select mentioned_sales_id from public.task_comment_mentions where comment_id = 9304$$,
    $$values (9202::bigint)$$,
    'a mention removed from the body is removed from the inbox');

select isnt(
    (select read_at from public.task_comment_mentions
      where comment_id = 9304 and mentioned_sales_id = 9202),
    null,
    'a mention that survived an edit keeps its read receipt');

--
-- 7. Deletion is soft (§8.2): the counter drops but the body stays readable.
--
update public.task_comments set deleted_at = now() where id = 9304;

select is(
    (select comment_count from public.tasks where id = 9201), 3,
    'a soft-deleted comment stops counting');

select is(
    (select body from public.task_comments where id = 9304),
    '@[Col](sales:9202) al final solo tú',
    'the body survives a delete, for the audit view');

select is(
    (select deleted_by from public.task_comments where id = 9304), 9201::bigint,
    'the delete is attributed to whoever performed it');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9201 and event_type = 'comment.deleted'),
    1,
    'a delete emits comment.deleted');

--
-- 8. Reactions are acknowledgements, so they are audited too (§8.2).
--
insert into public.task_comment_reactions (comment_id, sales_id, emoji)
values (9301, 9203, '👍');

select is(
    (select sales_id from public.task_comment_reactions where comment_id = 9301), 9201::bigint,
    'a reaction is always recorded as your own, whoever the client named');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9201 and event_type = 'comment.reaction_added'),
    1,
    'adding a reaction emits comment.reaction_added');

--
-- 9. Visibility under RLS. A private comment is an internal note: the colleague
--    who shares the task must not see it, the manager must.
--
insert into public.task_comments (id, task_id, body, is_private)
values (9305, 9201, 'Nota de coaching: revisar su discurso.', true);

create temporary table comment_probe (who text, comment_id bigint);
grant insert on comment_probe to authenticated;

-- The colleague: sees the task, so sees the public comments — but not the note.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"b2222222-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into comment_probe select 'colleague', id from public.task_comments;
reset role;

-- The outsider: no access to the task at all.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"c3333333-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into comment_probe select 'outsider', id from public.task_comments;
reset role;

-- The manager: sees everything, including private notes.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"d4444444-0000-0000-0000-000000000004","role":"authenticated"}', true);
insert into comment_probe select 'manager', id from public.task_comments;
reset role;

select is(
    (select count(*)::int from comment_probe
      where who = 'colleague' and comment_id = 9301),
    1,
    'a collaborator on the task can read its comments');

select is(
    (select count(*)::int from comment_probe
      where who = 'colleague' and comment_id = 9305),
    0,
    'a private comment is invisible to a colleague who can otherwise see the task');

select is(
    (select count(*)::int from comment_probe
      where who = 'manager' and comment_id = 9305),
    1,
    'a manager reads private comments (§8.2 coaching notes)');

select is(
    (select count(*)::int from comment_probe
      where who = 'outsider' and comment_id in (9301, 9305)),
    0,
    'someone with no access to the task reads none of its comments');

select * from finish();
rollback;
