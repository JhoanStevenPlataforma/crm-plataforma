--
-- Task module — attachments and comment reactions (§3.2, §8.2, §17.3).
--
-- An attachment is the one artefact of this module whose bytes live outside
-- Postgres, so two things have to hold at once:
--   * the row is attributed, counted and audited like every other child of a
--     task, and its removal keeps the row on disk;
--   * the row and the storage object agree on which task owns the file. The
--     storage policy reads the task id out of the object path, so a row
--     pointing somewhere else would describe a file the reader cannot open —
--     or one belonging to a task they are not allowed to see.
--
begin;

select plan(20);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-0000-0000-0000-000000000001', 'owner.at@test.local',   '{"first_name":"Own","last_name":"Er"}'::jsonb),
  ('a2222222-0000-0000-0000-000000000002', 'outsider.at@test.local','{"first_name":"Out","last_name":"Sider"}'::jsonb);

update public.sales set id = 9501, role = 'rep' where user_id = 'a1111111-0000-0000-0000-000000000001';
update public.sales set id = 9502, role = 'rep' where user_id = 'a2222222-0000-0000-0000-000000000002';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9501, 'Ana', 'Ruiz', 9501);

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9501, 9501, 'Preparar la renovación', 'call',
        '2026-09-01 09:00:00+00', 9501, 9501),
       (9502, 9501, 'Otra tarea', 'call',
        '2026-09-01 09:00:00+00', 9501, 9501);

select set_config(
    'request.jwt.claims',
    '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

insert into public.task_comments (id, task_id, body)
values (9601, 9501, 'Adjunto el contrato firmado');

--
-- 1. A task-level file: attribution, counter and event.
--
insert into public.task_attachments
    (id, task_id, storage_path, file_name, mime_type, size_bytes, checksum)
values (9701, 9501, '9501/contrato.pdf', 'contrato.pdf', 'application/pdf', 24680,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

select is(
    (select uploaded_by from public.task_attachments where id = 9701), 9501::bigint,
    'the uploader comes from the session, not from the client');

select is(
    (select attachment_count from public.tasks where id = 9501), 1,
    'tasks.attachment_count follows the files (the Phase 1 counter nothing maintained)');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9501 and event_type = 'attachment.added'),
    1,
    'attaching a file lands in the same event stream as everything else');

select is(
    (select metadata ->> 'file_name' from public.task_events
      where task_id = 9501 and event_type = 'attachment.added' order by seq desc limit 1),
    'contrato.pdf',
    'the event carries what was attached, so the history reads without the row');

--
-- 2. A comment-level file is the same row with `comment_id` set.
--
insert into public.task_attachments
    (id, task_id, comment_id, storage_path, file_name, mime_type)
values (9702, 9501, 9601, '9501/anexo.pdf', 'anexo.pdf', 'application/pdf');

select is(
    (select attachment_count from public.tasks where id = 9501), 2,
    'a comment attachment counts on its task too');

select throws_ok(
    $$insert into public.task_attachments (task_id, comment_id, storage_path, file_name)
      values (9502, 9601, '9502/robado.pdf', 'robado.pdf')$$,
    'comment 9601 belongs to another task',
    'a file cannot be hung off a comment of a different task');

--
-- 3. Row and object must agree on the owning task (§17.3): the storage policy
--    gates the download on the task id in the path.
--
select throws_ok(
    $$insert into public.task_attachments (task_id, storage_path, file_name)
      values (9501, '9502/ajeno.pdf', 'ajeno.pdf')$$,
    'attachment path 9502/ajeno.pdf is not under task 9501',
    'a row cannot point at an object stored under another task');

select throws_ok(
    $$insert into public.task_attachments (task_id, storage_path, file_name)
      values (9501, 'suelto.pdf', 'suelto.pdf')$$,
    'attachment path suelto.pdf is not under task 9501',
    'a row cannot point at an object outside the per-task folders');

select throws_ok(
    $$insert into public.task_attachments (task_id, storage_path, file_name)
      values (9501, '9501/contrato.pdf', 'contrato-otra-vez.pdf')$$,
    '23505', null::text,
    'the same stored object cannot be registered twice');

--
-- 4. What a file IS never moves. Only the soft delete is a legitimate update.
--
update public.task_attachments
   set task_id = 9502, storage_path = '9502/otro.pdf', uploaded_by = 9502
 where id = 9701;

select results_eq(
    $$select task_id, storage_path, uploaded_by from public.task_attachments where id = 9701$$,
    $$values (9501::bigint, '9501/contrato.pdf', 9501::bigint)$$,
    'the task, the object and the uploader are fixed at insert');

--
-- 5. Removal is soft: the counter drops, the row and its bytes' metadata stay,
--    and the removal is attributed.
--
update public.task_attachments set deleted_at = now() where id = 9701;

select is(
    (select attachment_count from public.tasks where id = 9501), 1,
    'a removed file stops counting');

select is(
    (select file_name from public.task_attachments where id = 9701), 'contrato.pdf',
    'the removed file is still on disk, for the audit view');

select is(
    (select deleted_by from public.task_attachments where id = 9701), 9501::bigint,
    'removing a file records who removed it');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9501 and event_type = 'attachment.removed'),
    1,
    'removing a file emits attachment.removed');

--
-- 6. Visibility follows the task, like every other child table (§7.3).
--
create temporary table attachment_probe (who text, attachment_id bigint);
grant insert on attachment_probe to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into attachment_probe select 'owner', id from public.task_attachments;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"a2222222-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into attachment_probe select 'outsider', id from public.task_attachments;
reset role;

select is(
    (select count(*)::int from attachment_probe where who = 'owner' and attachment_id = 9702),
    1,
    'somebody who can see the task can see its files');

select is(
    (select count(*)::int from attachment_probe where who = 'outsider' and attachment_id = 9702),
    0,
    'a rep with no claim on the task cannot see its files');

--
-- 7. The private bucket is what actually protects the bytes: the notes bucket
--    is public, so a path-scoped policy on it would gate the API and leave the
--    object URL open (§17.3 P0).
--
select is(
    (select public from storage.buckets where id = 'task-attachments'), false,
    'task files live in a PRIVATE bucket');

select is(
    (select count(*)::int from storage.buckets where id = 'task-attachments'), 1,
    'the task-attachments bucket exists');

--
-- 8. Reactions are addressable by a single id, which is how the UI removes one.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"a1111111-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

insert into public.task_comment_reactions (comment_id, emoji) values (9601, '👍');

select isnt(
    (select id from public.task_comment_reactions
      where comment_id = 9601 and emoji = '👍'), null,
    'a reaction has a surrogate id, so react-admin can address the row');

select throws_ok(
    $$insert into public.task_comment_reactions (comment_id, sales_id, emoji)
      values (9601, 9501, '👍')$$,
    '23505', null::text,
    'the same person still cannot register the same emoji twice');

select * from finish();
rollback;
