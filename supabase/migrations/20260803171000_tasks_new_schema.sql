--
-- Task module — Phase 1, step 2: widen `tasks` in place.
--
-- Implements proposal §3.3 (new task columns) following Appendix C steps 2,
-- 3, 6 and 7: additive ALTERs first, then a backfill, then constraints, then
-- the removal of the destructive `ON DELETE CASCADE`.
--
-- The legacy columns (`contact_id`, `type`, `text`, `due_date`, `done_date`,
-- `sales_id`) are KEPT as read-only compatibility shims. Reads move to the
-- new columns and to `task_links` over the course of this phase; the shims are
-- dropped one release later (Appendix C step 7 note).
--

-- ---------------------------------------------------------------------------
-- Step 2 — add the new columns (all nullable at first, so the backfill can
-- run without violating NOT NULL).
-- ---------------------------------------------------------------------------

alter table public.tasks
    add column title             text,
    add column description       text,
    add column task_type_id      bigint,
    add column status_id         bigint,
    add column priority_id       bigint,
    add column start_at          timestamp with time zone,
    add column completed_at      timestamp with time zone,
    add column completed_by      bigint,
    add column canceled_at       timestamp with time zone,
    add column cancel_reason     text,
    add column owner_sales_id    bigint,
    add column created_by        bigint,
    add column created_at        timestamp with time zone not null default now(),
    add column updated_at        timestamp with time zone not null default now(),
    add column deleted_at        timestamp with time zone,
    add column deleted_by        bigint,
    add column archived_at       timestamp with time zone,
    add column reschedule_count  integer not null default 0,
    add column reassign_count    integer not null default 0,
    add column comment_count     integer not null default 0,
    add column attachment_count  integer not null default 0,
    add column checklist_total   integer not null default 0,
    add column checklist_done    integer not null default 0,
    add column blocked_seconds   bigint  not null default 0,
    add column total_open_seconds bigint not null default 0,
    add column source            text not null default 'manual'
        check (source in ('manual', 'automation', 'import', 'api', 'email'));

-- Full-text search column (§3.3).
alter table public.tasks
    add column search_tsv tsvector generated always as (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'B')
    ) stored;

-- ---------------------------------------------------------------------------
-- Step 3 — backfill from what exists.
-- ---------------------------------------------------------------------------

-- Split `text` into title (first 120 chars, list-friendly) and description
-- (the rest, kept only when there is more than the title).
update public.tasks set
    title          = left(coalesce(text, '(sin título)'), 120),
    description    = case when length(coalesce(text, '')) > 120 then text end,
    task_type_id   = (select id from public.task_types
                      where key = coalesce(nullif(type, ''), 'none')),
    status_id      = (select id from public.task_statuses
                      where key = case when done_date is null then 'pending' else 'completed' end),
    priority_id    = (select id from public.task_priorities where key = 'normal'),
    owner_sales_id = coalesce(sales_id,
                              (select c.sales_id from public.contacts c where c.id = contact_id)),
    created_by     = coalesce(sales_id,
                              (select c.sales_id from public.contacts c where c.id = contact_id)),
    completed_at   = done_date,
    completed_by   = coalesce(sales_id,
                              (select c.sales_id from public.contacts c where c.id = contact_id)),
    -- No creation date exists (W5). The honest reconstruction, flagged as such
    -- in the seeded history event (step 5 of the plan).
    created_at     = coalesce(done_date, due_date, now());

-- `start_at` drives the `scheduled` state (§4.1); we cannot know it
-- retroactively, so tasks that are not started stay in `pending`.

-- ---------------------------------------------------------------------------
-- Step 6 — constraints, once the data is clean.
-- ---------------------------------------------------------------------------

alter table public.tasks
    alter column title set not null,
    alter column task_type_id set not null,
    alter column status_id set not null,
    alter column priority_id set not null,
    alter column owner_sales_id set not null,
    alter column created_by set not null;

-- Fixes W7: `sales_id` never had a foreign key.
alter table public.tasks
    add constraint tasks_sales_id_fkey foreign key (sales_id) references public.sales(id);

alter table public.tasks
    add constraint tasks_task_type_id_fkey
        foreign key (task_type_id) references public.task_types(id);
alter table public.tasks
    add constraint tasks_status_id_fkey
        foreign key (status_id) references public.task_statuses(id);
alter table public.tasks
    add constraint tasks_priority_id_fkey
        foreign key (priority_id) references public.task_priorities(id);
alter table public.tasks
    add constraint tasks_owner_sales_id_fkey
        foreign key (owner_sales_id) references public.sales(id);
alter table public.tasks
    add constraint tasks_created_by_fkey
        foreign key (created_by) references public.sales(id);
alter table public.tasks
    add constraint tasks_completed_by_fkey
        foreign key (completed_by) references public.sales(id);
alter table public.tasks
    add constraint tasks_deleted_by_fkey
        foreign key (deleted_by) references public.sales(id);

-- §3.3: completed_at and completed_by always travel together.
alter table public.tasks
    add constraint tasks_completed_consistency
        check ((completed_at is null) = (completed_by is null));

-- ---------------------------------------------------------------------------
-- Step 7 — drop the cascade that destroys history (W8). `contact_id` is kept,
-- nullable, as a compatibility shim; reads move to `task_links`.
-- ---------------------------------------------------------------------------

alter table public.tasks drop constraint tasks_contact_id_fkey;
alter table public.tasks alter column contact_id drop not null;

-- ---------------------------------------------------------------------------
-- Indexes (§18.3) — each mirrors a real query; none is write amplification.
-- ---------------------------------------------------------------------------

-- "My open tasks by due date" — the single hottest query in the product.
create index tasks_owner_open_due
    on public.tasks (owner_sales_id, due_date)
    where deleted_at is null and completed_at is null and canceled_at is null;

-- Overdue triage (manager inbox).
create index tasks_overdue
    on public.tasks (due_date)
    where deleted_at is null and completed_at is null and canceled_at is null;

-- Status boards / Kanban.
create index tasks_status_due on public.tasks (status_id, due_date)
    where deleted_at is null;

-- Full-text search.
create index tasks_search on public.tasks using gin (search_tsv);

-- ---------------------------------------------------------------------------
-- `updated_at` maintenance (the repo already has `set_updated_at`).
-- ---------------------------------------------------------------------------

create or replace trigger tasks_set_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keep the legacy `type` shim in sync with the new `task_type_id` FK, and the
-- legacy `done_date` shim in sync with the completed state, so code that has
-- not migrated yet (FakeRest, imports) keeps working. The reverse direction is
-- handled by `transition_task()` (§4.5), which is the only write path for
-- status changes.
-- ---------------------------------------------------------------------------

create or replace function public.tasks_keep_legacy_shims() returns trigger
    language plpgsql security definer set search_path to ''
    as $$
declare
    v_status_key text;
begin
    -- type <-> task_type_id
    if new.type is distinct from old.type or old.task_type_id is null then
        if new.type is not null and new.type <> '' then
            select id into new.task_type_id from public.task_types where key = new.type;
        end if;
    elsif new.task_type_id is distinct from old.task_type_id then
        select key into new.type from public.task_types where id = new.task_type_id;
    end if;

    -- status <-> done_date (read shim only; real completion lives in status_id)
    select key into v_status_key from public.task_statuses where id = new.status_id;
    if v_status_key = 'completed' and new.done_date is null then
        new.done_date := coalesce(new.completed_at, now());
    elsif v_status_key <> 'completed' then
        new.done_date := null;
    end if;

    return new;
end;
$$;

create or replace trigger tasks_keep_legacy_shims
    before insert or update on public.tasks
    for each row execute function public.tasks_keep_legacy_shims();
