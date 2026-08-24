--
-- Task module — Phase 1, step 8: soft delete, link close and grant cleanup.
--
-- Implements §4.4 ("→ deleted" = soft delete only; hard delete = nobody),
-- the W8 fix (deleting a parent closes the link and emits an event instead of
-- cascading a delete) and §17.3 P1 (no `anon` grants on task tables).
--
--   A. `tasks_soft_delete`   — a BEFORE DELETE trigger converts every hard
--      DELETE of a task into a soft delete (`deleted_at`/`deleted_by`) and
--      emits `task.deleted` through the existing `tasks_audit` trigger. The
--      row is retained, history stays intact. This lets the not-yet-migrated
--      frontend keep calling `dataProvider.delete` while the DB already
--      behaves the way the state machine says. The Phase-3 retention job will
--      introduce an explicit override flag for bulk purging with an export
--      receipt (§4.4).
--
--   B. `close_task_links_for_entity` — BEFORE DELETE triggers on contacts,
--      leads, companies and deals close the task's active links
--      (`unlinked_at`) and emit `link.removed`, instead of leaving dangling
--      polymorphic rows. For contacts it also nulls the legacy `tasks
--      .contact_id` shim, keeping the old frontend's reads coherent.
--
--   C. `contacts_summary` — the pending-task count excludes soft-deleted
--      tasks (`deleted_at is null`), kept as a scalar subquery.
--
--   D. Grant cleanup — revoke the legacy `grant all ... to anon` on `tasks`
--      and its sequence (the diff in `baseline_diff.txt`).
--

-- ---------------------------------------------------------------------------
-- A. Soft delete for tasks
-- ---------------------------------------------------------------------------

create or replace function public.tasks_soft_delete() returns trigger
    language plpgsql security definer set search_path to ''
    as $$
begin
    update public.tasks
    set deleted_at = now(),
        deleted_by = coalesce((select public.current_sale_id()), deleted_by)
    where id = old.id;
    -- The UPDATE fires `tasks_audit`, which emits `task.deleted` (the
    -- event_type_for_field mapping for `deleted_at`). RETURN NULL suppresses
    -- the actual hard delete.
    return null;
end;
$$;

create trigger tasks_soft_delete
    before delete on public.tasks
    for each row execute function public.tasks_soft_delete();

-- ---------------------------------------------------------------------------
-- B. Link close on parent delete (fixes W8)
-- ---------------------------------------------------------------------------

-- Generic for the four parents that exist today; the entity type is passed as
-- trigger argument so the same function serves all four tables.
create or replace function public.close_task_links_for_entity() returns trigger
    language plpgsql security definer set search_path to ''
    as $$
declare
    v_entity_type public.task_entity := tg_argv[0]::public.task_entity;
    v_actor       bigint             := (select public.current_sale_id());
    v_link        record;
begin
    -- Keep the legacy shim coherent: when the linked contact is deleted, the
    -- old frontend must no longer see a contact_id on the task.
    if v_entity_type = 'contact' then
        update public.tasks set contact_id = null where contact_id = old.id;
    end if;

    -- Close every active link to the record being deleted, emitting one
    -- `link.removed` event per affected task.
    for v_link in
        select id, task_id from public.task_links
        where entity_type = v_entity_type
          and entity_id = old.id
          and unlinked_at is null
    loop
        update public.task_links
        set unlinked_at = now()
        where id = v_link.id;

        perform public.emit_task_event(
            v_link.task_id,
            'link.removed',
            v_actor,
            jsonb_build_object(
                'entity_type', v_entity_type,
                'entity_id',   old.id
            ),
            null,
            jsonb_build_object(
                'entity_type', v_entity_type,
                'reason',      'parent record deleted'
            ),
            null,
            case when v_actor is null then 'system' else 'user' end
        );
    end loop;

    return old;
end;
$$;

create trigger tasks_close_links_on_contact_delete
    before delete on public.contacts
    for each row execute function public.close_task_links_for_entity('contact');
create trigger tasks_close_links_on_lead_delete
    before delete on public.leads
    for each row execute function public.close_task_links_for_entity('lead');
create trigger tasks_close_links_on_company_delete
    before delete on public.companies
    for each row execute function public.close_task_links_for_entity('company');
create trigger tasks_close_links_on_deal_delete
    before delete on public.deals
    for each row execute function public.close_task_links_for_entity('deal');

-- ---------------------------------------------------------------------------
-- C. contacts_summary — exclude soft-deleted tasks from the pending count
-- ---------------------------------------------------------------------------

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    -- Same rewrite as companies_summary: the previous join + GROUP BY over
    -- tasks aggregated all 200k contacts before the LIMIT (~1.1 s per page for
    -- a manager). As a subquery, page 1 costs well under a millisecond.
    -- Soft-deleted tasks do not count as open work.
    (select count(*) from public.tasks t
      where t.contact_id = co.id
        and t.done_date is null
        and t.deleted_at is null) as nb_tasks
from public.contacts co
    left join public.companies c on co.company_id = c.id;

-- Keep the partial index in sync with the new predicate so the subquery stays
-- index-driven (the scalar-subquery cost is bounded by the LIMIT regardless).
-- A plain `create index if not exists` would silently skip because
-- `20260803140000_list_query_performance.sql` already created it with the old
-- `where done_date is null` predicate, so drop and recreate it.
drop index if exists tasks_pending_contact_id_idx;
create index tasks_pending_contact_id_idx
    on public.tasks using btree (contact_id) where done_date is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- D. Grant cleanup (§17.3 P1)
-- ---------------------------------------------------------------------------

-- The legacy `init_db` migration granted `all ... to anon` on `tasks`; the
-- task tables are PostgREST-facing and must only be reachable by
-- `authenticated` (RLS-enforced) and `service_role`.
revoke all on table public.tasks from anon;
revoke all on sequence public.tasks_id_seq from anon;
