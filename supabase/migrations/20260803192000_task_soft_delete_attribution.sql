--
-- Task module — attribute a soft delete to whoever performed it (§5, §17.1).
--
-- `tasks_soft_delete` converts a real DELETE into an update and stamps
-- `deleted_by` on the way. But a real DELETE returns no rows through PostgREST
-- (the BEFORE trigger suppresses it), so the client issues the soft delete as
-- an explicit UPDATE instead — and that path had nobody filling `deleted_by`.
--
-- Without this, "who deleted this task?" is answerable from `task_events` but
-- not from the row itself, and the two could disagree. Stamping it in a trigger
-- means every write path agrees, whichever one the client used.
--
create or replace function public.tasks_stamp_deleted_by() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if old.deleted_at is null
       and new.deleted_at is not null
       and new.deleted_by is null then
        new.deleted_by := (select public.current_sale_id());
    end if;

    -- Restoring a task clears the attribution: it is no longer deleted, and the
    -- history keeps the record of both events.
    if new.deleted_at is null then
        new.deleted_by := null;
    end if;

    return new;
end;
$$;

create or replace trigger tasks_stamp_deleted_by
    before update on public.tasks
    for each row
    when (old.deleted_at is distinct from new.deleted_at)
    execute function public.tasks_stamp_deleted_by();

grant all on function public.tasks_stamp_deleted_by() to service_role;
