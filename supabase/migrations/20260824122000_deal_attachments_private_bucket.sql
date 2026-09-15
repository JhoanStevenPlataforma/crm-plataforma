--
-- Deal stage-change files move to a PRIVATE bucket.
--
-- `move_deal_stage()` records the files that justify a stage move -- contracts,
-- pricing sheets, the email that closed it. They were being uploaded through
-- `uploadToBucket`, which targets `attachments`, and `attachments` was created
-- with `public = true` in the initial migration. A public bucket serves any
-- object to whoever holds the URL, signed in or not; the storage policies on it
-- gate the API while the object path stays open.
--
-- The task module already made this call and wrote down why (see
-- `20260805140000_task_attachments.sql`): a private bucket plus short-lived
-- signed URLs is the only arrangement where a file actually follows the
-- visibility of the record it belongs to. Stage-change evidence is at least as
-- sensitive as a task file and was getting the weaker treatment.
--
-- Scope: NEW uploads only. The `attachments` bucket keeps serving contact and
-- deal notes, and the rows already written keep their public `src`. Making that
-- bucket private is a separate change -- it has to rewrite every stored URL in
-- `contact_notes.attachments` and `deal_notes.attachments` -- and shipping it
-- half-done is what leaves a system reading as secure while it is not.
--

--
-- 1. Deal visibility as a callable predicate.
--
-- Mirrors `can_see_task()`. The storage policy needs the same answer the deals
-- policies give, and a policy cannot join to a table the reader may not read,
-- so it goes through a SECURITY DEFINER function with a pinned search_path.
--
create or replace function public.can_see_deal(p_deal_id bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
    select (select public.can_manage_all())
        or exists (
            select 1
              from public.deals d
             where d.id = p_deal_id
               and d.sales_id = (select public.current_sale_id())
        );
$$;

comment on function public.can_see_deal(bigint) is
    'True when the current user may see the deal: a manager or admin, or its owner. Mirrors the select policy on public.deals so storage policies can ask the same question.';

revoke all on function public.can_see_deal(bigint) from public;
grant execute on function public.can_see_deal(bigint) to authenticated, service_role;

--
-- 2. The bucket.
--
insert into storage.buckets (id, name, public)
values ('deal-attachments', 'deal-attachments', false)
on conflict (id) do nothing;

--
-- 3. Policies, laid out as `<deal_id>/<file>` exactly like task attachments.
--
-- The regex guard matters: `foldername(name)[1]` is user-controlled text, and
-- casting a non-numeric first folder to bigint would raise instead of denying.
--
drop policy if exists "Deal attachments follow deal visibility for reads" on storage.objects;
drop policy if exists "Deal attachments can be added by users who see the deal" on storage.objects;
drop policy if exists "Deal attachments can be deleted by users who see the deal" on storage.objects;

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

notify pgrst, 'reload schema';
