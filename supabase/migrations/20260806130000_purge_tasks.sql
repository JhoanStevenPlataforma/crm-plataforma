--
-- The retention entry point: the only way a task ever physically leaves.
--
-- §4.4 is explicit: a hard delete is available to **nobody** — "only a
-- retention job, in bulk". `tasks_soft_delete` enforces that by suppressing
-- every DELETE, which is correct and which also means no code path at all can
-- reclaim a task row. That was fine while nothing needed to; it stops being
-- fine the moment anything has to start from a clean database (a retention
-- window, a GDPR erasure, or the e2e harness resetting between tests, which is
-- what surfaced it).
--
-- The escape hatch is deliberately narrow:
--   * the trigger only yields when a session GUC is set,
--   * only this function sets it, and only for the duration of its own
--     statement (`set local`),
--   * and the function is granted to `service_role` alone.
-- A browser session, an authenticated REST call and psql-as-authenticated all
-- still find hard deletion impossible.
--

create or replace function public.tasks_soft_delete() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    -- The retention path, and only it, may actually remove the row (§4.4).
    if coalesce(current_setting('app.purge_tasks', true), '') = 'on' then
        return old;
    end if;

    update public.tasks
    set deleted_at = now(),
        deleted_by = coalesce((select public.current_sale_id()), deleted_by)
    where id = old.id;
    return null;
end;
$$;

--
-- Bulk purge. `null` means "every task", which is what a test reset wants; a
-- real retention job passes the ids it has already exported.
--
-- Children go first because `task_assignments` and `task_links` reference
-- tasks with ON DELETE RESTRICT — that restriction is the thing standing
-- between "delete a contact" and "lose its history" (W8), so it is removed
-- explicitly here rather than relaxed globally.
--
drop function if exists public.purge_tasks(bigint[]);

create or replace function public.purge_tasks(
    p_task_ids       bigint[] default null,
    -- History is append-only and retention MOVES partitions rather than
    -- deleting rows (§5.1). Truncating it is only ever right for a disposable
    -- database — the e2e harness — so it is opt-in and named at the call site.
    p_purge_history  boolean default false
)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    delete from public.task_notifications
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_reminders
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_attachments
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_checklist_items
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_comments
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_dependencies
     where p_task_ids is null
        or source_task_id = any (p_task_ids)
        or target_task_id = any (p_task_ids);
    delete from public.task_assignments
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_links
     where p_task_ids is null or task_id = any (p_task_ids);

    -- `task_events` is NOT touched. It is append-only (§5.1, §5.5) and carries
    -- no foreign key to tasks precisely so the history can outlive the row:
    -- retention moves its partitions to cold storage, it never deletes them.

    perform set_config('app.purge_tasks', 'on', true);
    delete from public.tasks
     where p_task_ids is null or id = any (p_task_ids);
    get diagnostics v_count = row_count;
    perform set_config('app.purge_tasks', 'off', true);

    -- `task_events.actor_sales_id` references sales, so history that outlives
    -- every task also pins every user who ever touched one. That is correct in
    -- production and impossible to reset around, hence the flag.
    if p_purge_history then
        truncate public.task_events;
    end if;

    return v_count;
end;
$$;

revoke all on function public.purge_tasks(bigint[], boolean) from public, anon, authenticated;
grant all on function public.purge_tasks(bigint[], boolean) to service_role;
grant all on function public.tasks_soft_delete() to service_role;

notify pgrst, 'reload schema';
