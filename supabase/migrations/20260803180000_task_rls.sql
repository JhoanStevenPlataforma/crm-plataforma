--
-- Task module — Phase 1, step 7: RLS for `tasks` (§7.3) + write-path bridge.
--
-- Two halves:
--
--   A. RLS rewrite. The pre-migration policies derived visibility from the
--      legacy `contact_id` ("tasks follow their contact"). The new policies
--      inline the §7.3 access rule, which keys off assignments, team
--      membership, creator and linked records:
--
--          a task is visible to you if you are
--            1. an active owner/collaborator/watcher, or
--            2. a member of an assigned team, or
--            3. the creator (of a task that is not deleted), or
--            4. the owner of a linked record (contact/lead/company/deal), or
--            5. can_manage_all() — admin or manager.
--
--      The `exists` clauses are inlined (not `can_see_task()`) so the planner
--      can drive them off `task_assignments_active_by_sale` /
--      `task_links_entity` as semi-joins (proposal performance note).
--
--   B. Write-path bridge. The current frontend still creates tasks with only
--      the legacy columns (`contact_id`, `type`, `text`, `due_date`,
--      `sales_id`) — it does not send the new NOT NULL columns nor the
--      assignment/link rows the §7.3 rule reads. Until the frontend ships
--      (Phase 1 steps 1.8+), two triggers keep inserts working and the task
--      visible to its creator:
--
--        - `tasks_defaults_on_insert`   (BEFORE) fills the new NOT NULL
--          columns from the legacy shims and the current user.
--        - `tasks_seed_assignments_links` (AFTER) creates the owner
--          assignment and the primary contact link from the legacy
--          `contact_id`, idempotently, so both the old frontend and a future
--          dataProvider that sends the rows explicitly keep working.
--
--      A note on the DELETE policy: §17.1 reserves soft delete for
--      managers/admins and hard delete for nobody (revoked at role level in
--      step 8). Until the frontend stops hard-deleting, DELETE is restricted
--      to `can_manage_all()`; step 8 revokes it from `authenticated` entirely
--      and the UI moves to soft delete.
--

-- ---------------------------------------------------------------------------
-- A. RLS rewrite
-- ---------------------------------------------------------------------------

drop policy if exists "Tasks follow their contact for reads"   on public.tasks;
drop policy if exists "Tasks follow their contact for writes"  on public.tasks;
drop policy if exists "Tasks follow their contact for updates" on public.tasks;
drop policy if exists "Tasks follow their contact for deletes" on public.tasks;

create policy "Tasks are visible per the §7.3 access rule"
    on public.tasks for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.task_assignments a
            where a.task_id = tasks.id
              and a.unassigned_at is null
              and (a.sales_id = (select public.current_sale_id())
                   or a.team_id in (select tm.team_id from public.team_members tm
                                    where tm.sales_id = (select public.current_sale_id())))
        )
        or (tasks.created_by = (select public.current_sale_id())
            and tasks.deleted_at is null)
        or exists (
            select 1 from public.task_links l
            where l.task_id = tasks.id
              and l.unlinked_at is null
              and (
                  (l.entity_type = 'contact'
                   and exists (select 1 from public.contacts c
                               where c.id = l.entity_id
                                 and c.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'lead'
                      and exists (select 1 from public.leads ld
                                  where ld.id = l.entity_id
                                    and ld.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'company'
                      and exists (select 1 from public.companies co
                                  where co.id = l.entity_id
                                    and co.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'deal'
                      and exists (select 1 from public.deals d
                                  where d.id = l.entity_id
                                    and d.sales_id = (select public.current_sale_id())))
              )
        )
    );

create policy "Tasks can be created by their creator or linked-record owners"
    on public.tasks for insert to authenticated
    with check (
        (select public.can_manage_all())
        or tasks.created_by = (select public.current_sale_id())
        -- preserve the legacy guard: a task may not be pinned to a contact
        -- the user does not own (§7.3 rule 4)
        or (tasks.contact_id is not null
            and exists (select 1 from public.contacts c
                        where c.id = tasks.contact_id
                          and c.sales_id = (select public.current_sale_id())))
    );

create policy "Tasks can be updated by the §7.3 access rule"
    on public.tasks for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.task_assignments a
            where a.task_id = tasks.id
              and a.unassigned_at is null
              and (a.sales_id = (select public.current_sale_id())
                   or a.team_id in (select tm.team_id from public.team_members tm
                                    where tm.sales_id = (select public.current_sale_id())))
        )
        or (tasks.created_by = (select public.current_sale_id())
            and tasks.deleted_at is null)
        or exists (
            select 1 from public.task_links l
            where l.task_id = tasks.id
              and l.unlinked_at is null
              and (
                  (l.entity_type = 'contact'
                   and exists (select 1 from public.contacts c
                               where c.id = l.entity_id
                                 and c.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'lead'
                      and exists (select 1 from public.leads ld
                                  where ld.id = l.entity_id
                                    and ld.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'company'
                      and exists (select 1 from public.companies co
                                  where co.id = l.entity_id
                                    and co.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'deal'
                      and exists (select 1 from public.deals d
                                  where d.id = l.entity_id
                                    and d.sales_id = (select public.current_sale_id())))
              )
        )
    )
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.task_assignments a
            where a.task_id = tasks.id
              and a.unassigned_at is null
              and (a.sales_id = (select public.current_sale_id())
                   or a.team_id in (select tm.team_id from public.team_members tm
                                    where tm.sales_id = (select public.current_sale_id())))
        )
        or (tasks.created_by = (select public.current_sale_id())
            and tasks.deleted_at is null)
        or exists (
            select 1 from public.task_links l
            where l.task_id = tasks.id
              and l.unlinked_at is null
              and (
                  (l.entity_type = 'contact'
                   and exists (select 1 from public.contacts c
                               where c.id = l.entity_id
                                 and c.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'lead'
                      and exists (select 1 from public.leads ld
                                  where ld.id = l.entity_id
                                    and ld.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'company'
                      and exists (select 1 from public.companies co
                                  where co.id = l.entity_id
                                    and co.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'deal'
                      and exists (select 1 from public.deals d
                                  where d.id = l.entity_id
                                    and d.sales_id = (select public.current_sale_id())))
              )
        )
    );

-- §17.1: soft delete is reserved for managers/admins; hard delete is revoked
-- at role level in step 8. Until the frontend switches to soft delete, keep a
-- hard-delete path but only for managers/admins.
create policy "Tasks can be deleted by managers or admins only"
    on public.tasks for delete to authenticated
    using ((select public.can_manage_all()));

-- ---------------------------------------------------------------------------
-- B. Write-path bridge
-- ---------------------------------------------------------------------------

-- BEFORE INSERT: fill the new NOT NULL columns from the legacy shims and the
-- current user, so the not-yet-migrated frontend keeps working.
create or replace function public.tasks_defaults_on_insert() returns trigger
    language plpgsql security definer set search_path to ''
    as $$
begin
    -- title/description split (§3.3): `title` is the whole text until the
    -- frontend sends both columns.
    if new.title is null then
        new.title := left(coalesce(nullif(new.text, ''), '(sin título)'), 120);
    end if;

    if new.task_type_id is null then
        select id into new.task_type_id from public.task_types
        where key = coalesce(nullif(new.type, ''), 'none');
    end if;

    if new.status_id is null then
        select id into new.status_id from public.task_statuses
        where key = case when new.done_date is null then 'pending' else 'completed' end;
    end if;

    if new.priority_id is null then
        select id into new.priority_id from public.task_priorities where key = 'normal';
    end if;

    if new.owner_sales_id is null then
        new.owner_sales_id := coalesce(new.sales_id, (select public.current_sale_id()));
    end if;

    if new.created_by is null then
        new.created_by := coalesce(new.sales_id, (select public.current_sale_id()));
    end if;

    if new.completed_at is null and new.done_date is not null then
        new.completed_at := new.done_date;
        new.completed_by := coalesce(new.created_by, (select public.current_sale_id()));
    end if;

    return new;
end;
$$;

create trigger tasks_defaults_on_insert
    before insert on public.tasks
    for each row execute function public.tasks_defaults_on_insert();

-- AFTER INSERT: seed the owner assignment and the primary contact link from
-- the legacy columns. Idempotent, so a dataProvider that sends the rows
-- explicitly does not double them up (unique partial indexes would reject it).
create or replace function public.tasks_seed_assignments_links() returns trigger
    language plpgsql security definer set search_path to ''
    as $$
begin
    insert into public.task_assignments (task_id, sales_id, role, assigned_by, assigned_at)
    select new.id, new.owner_sales_id, 'owner', new.created_by, new.created_at
    where new.owner_sales_id is not null
      and not exists (select 1 from public.task_assignments a
                      where a.task_id = new.id and a.role = 'owner' and a.unassigned_at is null);

    insert into public.task_links (task_id, entity_type, entity_id, is_primary, linked_by, entity_label)
    select new.id, 'contact', new.contact_id, true, new.created_by,
           nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '')
    from public.contacts c
    where new.contact_id is not null and c.id = new.contact_id
      and not exists (select 1 from public.task_links l
                      where l.task_id = new.id and l.unlinked_at is null);

    return new;
end;
$$;

create trigger tasks_seed_assignments_links
    after insert on public.tasks
    for each row execute function public.tasks_seed_assignments_links();
