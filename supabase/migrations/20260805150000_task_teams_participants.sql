--
-- Teams, participants and the assignment audit trail (deliverable 2.4, §7).
--
-- Phase 1 created `teams` / `team_members` as read-only reference data and let
-- `tasks_seed_assignments_links` open the first `owner` row. Everything after
-- that was missing: nobody could create a team, nobody could add a watcher or a
-- collaborator, and — the actual bug — reassigning a task wrote
-- `tasks.owner_sales_id` without touching `task_assignments`, so the history
-- table that is supposed to answer "who owned this, when, and who moved it"
-- silently kept pointing at the first owner forever (§7.2).
--
-- Hand-written, ADD-only: no column of `public.tasks` changes, so `db diff`
-- never gets the chance to drop `tasks_summary` / `contacts_summary`.
--

--
-- 1. RLS on task_assignments already gates writes on `can_see_task()`. What was
--    missing is authorship: a row that says who joined but not who put them
--    there is not an audit trail.
--
create or replace function public.task_assignments_before_write() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if tg_op = 'INSERT' then
        new.assigned_by := coalesce(new.assigned_by, public.current_sale_id());
        new.assigned_at := coalesce(new.assigned_at, now());
    elsif new.unassigned_at is not null and old.unassigned_at is null then
        new.unassigned_by := coalesce(new.unassigned_by, public.current_sale_id());
    end if;

    return new;
end;
$$;

--
-- 2. Joining and leaving a task are events like any other (§5.2).
--
-- The `owner` role is deliberately silent here. An owner change already emits
-- `task.reassigned` from `tasks_audit`, and the assignment rows it opens and
-- closes are the same fact seen from the other side; emitting both would put
-- three entries in the timeline for one action.
--
create or replace function public.task_assignments_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_event public.task_event_type;
    v_actor bigint;
begin
    if tg_op = 'INSERT' then
        if new.role = 'owner' then
            return new;
        end if;
        v_event := case new.role
                       when 'watcher' then 'task.watcher_added'
                       when 'team'    then 'task.team_assigned'
                       else 'task.assigned'
                   end;
        v_actor := new.assigned_by;
    elsif new.unassigned_at is not null and old.unassigned_at is null then
        if new.role = 'owner' then
            return new;
        end if;
        v_event := case new.role
                       when 'watcher' then 'task.watcher_removed'
                       else 'task.unassigned'
                   end;
        v_actor := new.unassigned_by;
    else
        return new;
    end if;

    perform public.emit_task_event(
        new.task_id, v_event, v_actor, null, null,
        jsonb_build_object('assignment_id', new.id,
                           'role', new.role,
                           'sales_id', new.sales_id,
                           'team_id', new.team_id),
        nullif(btrim(coalesce(new.reason, '')), ''),
        case when v_actor is null then 'system' else 'user' end);

    return new;
end;
$$;

--
-- 3. The projection and the history cannot drift (§7.2).
--
-- `tasks.owner_sales_id` is the hot-path column ("my tasks" must not join a
-- history table); `task_assignments` is the record of how it got there. This
-- trigger is the only thing that keeps the second true when the first changes.
--
create or replace function public.tasks_sync_owner_assignment() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := coalesce(public.current_sale_id(), new.owner_sales_id);
begin
    update public.task_assignments
       set unassigned_at = now(),
           unassigned_by = v_actor
     where task_id = new.id
       and role = 'owner'
       and unassigned_at is null
       and sales_id is distinct from new.owner_sales_id;

    if new.owner_sales_id is not null then
        insert into public.task_assignments (task_id, sales_id, role, assigned_by)
        select new.id, new.owner_sales_id, 'owner', coalesce(v_actor, new.owner_sales_id)
        where not exists (select 1 from public.task_assignments a
                          where a.task_id = new.id
                            and a.role = 'owner'
                            and a.unassigned_at is null);
    end if;

    return new;
end;
$$;

create or replace trigger task_assignments_before_write
    before insert or update on public.task_assignments
    for each row execute function public.task_assignments_before_write();

create or replace trigger task_assignments_audit
    after insert or update on public.task_assignments
    for each row execute function public.task_assignments_audit();

create or replace trigger tasks_sync_owner_assignment
    after update on public.tasks
    for each row
    when (old.owner_sales_id is distinct from new.owner_sales_id)
    execute function public.tasks_sync_owner_assignment();

--
-- 4. Backfill the drift Phase 1 accumulated: every task whose owner moved after
--    creation has an assignment row pointing at somebody who no longer owns it.
--
update public.task_assignments a
   set unassigned_at = coalesce(t.updated_at, now())
  from public.tasks t
 where a.task_id = t.id
   and a.role = 'owner'
   and a.unassigned_at is null
   and a.sales_id is distinct from t.owner_sales_id;

insert into public.task_assignments (task_id, sales_id, role, assigned_by, assigned_at)
select t.id, t.owner_sales_id, 'owner', t.created_by, coalesce(t.updated_at, t.created_at)
  from public.tasks t
 where t.owner_sales_id is not null
   and not exists (select 1 from public.task_assignments a
                   where a.task_id = t.id
                     and a.role = 'owner'
                     and a.unassigned_at is null);

--
-- 5. Every task RLS check runs `team_id in (select team_id from team_members
--    where sales_id = …)`. The `unique (team_id, sales_id)` index cannot serve
--    that lookup — its leading column is the wrong one.
--
create index if not exists team_members_sales_id_idx
    on public.team_members (sales_id, team_id);

--
-- 6. Teams stop being read-only reference data.
--
-- Who may edit them is the same question as who may reassign work, so it gets
-- the same answer: `can_manage_all()` — admin or manager. `for all` is OR'd
-- with the existing permissive select policy, so reads stay open to everyone;
-- a rep still needs to see the team a task is assigned to.
--
create policy "Teams are manageable by managers and admins"
    on public.teams for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

create policy "Team memberships are manageable by managers and admins"
    on public.team_members for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

grant insert, update, delete on table public.teams to authenticated;
grant insert, update, delete on table public.team_members to authenticated;
grant usage, select on sequence public.teams_id_seq to authenticated;
grant usage, select on sequence public.team_members_id_seq to authenticated;

--
-- 7. The list view. `nb_members` is a scalar subquery, not a join plus GROUP BY
--    — the same rule `contacts_summary` documents.
--
create or replace view public.teams_summary with (security_invoker = on) as
select
    t.id,
    t.name,
    t.description,
    t.created_at,
    (select count(*) from public.team_members m where m.team_id = t.id) as nb_members
from public.teams t;

grant select on table public.teams_summary to authenticated;
grant all on table public.teams_summary to service_role;

grant all on function public.task_assignments_before_write() to service_role;
grant all on function public.task_assignments_audit() to service_role;
grant all on function public.tasks_sync_owner_assignment() to service_role;

notify pgrst, 'reload schema';
