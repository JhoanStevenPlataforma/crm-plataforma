--
-- Task module — Phase 1, step 9: storage policy hardening (§17.3 P0).
--
-- The `attachments` bucket currently grants every authenticated user `select`
-- on any object (`07_storage.sql`). Reusing that bucket for task attachments
-- would make every task attachment readable org-wide. This migration:
--
--   - scopes task attachments to `tasks/<task_id>/…` and checks task
--     visibility (`can_see_task()`) in the policy, so a user can only read,
--     write or delete attachments of tasks they can see;
--   - preserves the pre-existing behavior for note attachments (legacy flat
--     paths, NOT under `tasks/`), so the current note feature does not
--     regress. Note attachments are removed through the
--     `delete_note_attachments` edge function (service_role), which bypasses
--     RLS, and their read/insert/delete stays authenticated-only.
--
-- Path convention (§17.3): `tasks/<task_id>/<filename>`.
--

-- Drop the org-wide policies.
drop policy if exists "Attachments 1mt4rzk_0" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_1" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_3" on storage.objects;

-- Task attachments follow task visibility for reads.
create policy "Task attachments follow task visibility for reads"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = 'tasks'
        and public.can_see_task((storage.foldername(name))[2]::bigint)
    );

-- Task attachments can be added only by users who can see the task.
create policy "Task attachments can be added by visible-task users"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = 'tasks'
        and public.can_see_task((storage.foldername(name))[2]::bigint)
    );

-- Task attachments can be deleted only by users who can see the task.
create policy "Task attachments can be deleted by visible-task users"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = 'tasks'
        and public.can_see_task((storage.foldername(name))[2]::bigint)
    );

-- Note attachments (legacy flat paths, not under `tasks/`) keep the previous
-- authenticated-only, org-wide behavior.
create policy "Note attachments remain available to authenticated users"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'attachments'
        and coalesce((storage.foldername(name))[1], '') <> 'tasks'
    );

create policy "Note attachments can be added by authenticated users"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'attachments'
        and coalesce((storage.foldername(name))[1], '') <> 'tasks'
    );

create policy "Note attachments can be deleted by authenticated users"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'attachments'
        and coalesce((storage.foldername(name))[1], '') <> 'tasks'
    );
