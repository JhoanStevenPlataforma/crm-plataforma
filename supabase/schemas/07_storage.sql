--
-- Storage
-- This file declares storage bucket policies.
--

-- Task attachments (§17.3) live in their own PRIVATE bucket, laid out as
-- `<task_id>/<file>`, and every operation is gated on `can_see_task()`.
--
-- Not the `attachments` bucket the notes use: that one is public
-- (`insert into storage.buckets … public = true` in the initial migration), and
-- a public bucket serves any object to anybody holding the URL, signed in or
-- not. Path-scoped policies on it would gate the *API* while the CDN path
-- stayed wide open, which is the kind of half-fix that reads as secure and is
-- not. Reads here go through short-lived signed URLs instead.
create policy "Task attachments follow task visibility for reads"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'task-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_task((storage.foldername(name))[1]::bigint)
    );

create policy "Task attachments can be added by visible-task users"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'task-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_task((storage.foldername(name))[1]::bigint)
    );

create policy "Task attachments can be deleted by visible-task users"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'task-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_task((storage.foldername(name))[1]::bigint)
    );

-- Deal stage-change files (A3) get the same treatment as task files, and for
-- the same reason. `move_deal_stage()` stores the evidence behind a move --
-- contracts, pricing, the email that closed it -- and those were going to the
-- PUBLIC `attachments` bucket below, readable by anyone holding the URL. The
-- layout is `<deal_id>/<file>` so the policy can read the id back out; the
-- regex guard is there because `foldername(name)[1]` is user-controlled and a
-- bad cast would raise instead of denying.
create policy "Deal attachments follow deal visibility for reads"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'deal-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_deal((storage.foldername(name))[1]::bigint)
    );

create policy "Deal attachments can be added by users who see the deal"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'deal-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_deal((storage.foldername(name))[1]::bigint)
    );

create policy "Deal attachments can be deleted by users who see the deal"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'deal-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_deal((storage.foldername(name))[1]::bigint)
    );

-- Note attachments keep the previous authenticated-only, org-wide behavior in
-- the public `attachments` bucket. They are removed through the
-- `delete_note_attachments` edge function (service_role), which bypasses RLS.
create policy "Note attachments remain available to authenticated users"
    on storage.objects for select to authenticated
    using (bucket_id = 'attachments');

create policy "Note attachments can be added by authenticated users"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'attachments');

create policy "Note attachments can be deleted by authenticated users"
    on storage.objects for delete to authenticated
    using (bucket_id = 'attachments');

-- Quote files (quotes §7): a PRIVATE bucket laid out as `<quote_id>/<file>`,
-- gated on `can_see_quote()`, for the same reasons as the task and deal buckets
-- above -- commercial terms and pricing are exactly what a public bucket must
-- never hold. The regex guard comes BEFORE the cast because
-- `foldername(name)[1]` is user-controlled and a bad cast raises instead of
-- denying. Reads go through signed URLs minted per click (60 s TTL), never
-- rendered into the page.
create policy "Quote attachments follow quote visibility for reads"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'quote-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_quote((storage.foldername(name))[1]::bigint)
    );

create policy "Quote attachments can be added by users who see the quote"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'quote-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_quote((storage.foldername(name))[1]::bigint)
    );

create policy "Quote attachments can be deleted by users who see the quote"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'quote-attachments'
        and (storage.foldername(name))[1] ~ '^[0-9]+$'
        and public.can_see_quote((storage.foldername(name))[1]::bigint)
    );
