--
-- Task module — the tasks_summary projection (proposal §3.4, §15).
--
-- Lists render a status chip, a priority badge, a type icon, the owner and the
-- record the task hangs off. Without this view each of those is a client-side
-- round trip per row; with a join + GROUP BY it would reintroduce the
-- regression documented on companies_summary. Catalogues are small joins, the
-- primary link is a LATERAL ... LIMIT 1 evaluated only for surviving rows.
--
-- Writes still target `public.tasks` (and `transition_task()` for status).
--
--
-- The list/detail projection of a task (proposal §3.4, §15).
--
-- Every task list has to render a status chip, a priority badge, a type icon
-- and the record the task hangs off. Resolving those from the client would be
-- four extra round trips per page; resolving them with a join + GROUP BY would
-- reintroduce exactly the regression documented on `companies_summary`. The
-- catalogues are small, so they are plain joins; the primary link is a LATERAL
-- with LIMIT 1, which — like a scalar subquery — is only evaluated for the rows
-- that survive ORDER BY ... LIMIT.
--
-- Writes never go through this view: the frontend writes `public.tasks` (and
-- `transition_task()` for status changes), and reads this.
--
create or replace view public.tasks_summary with (security_invoker = on) as
select
    t.id,

    -- content
    t.title,
    t.description,

    -- classification
    t.task_type_id,
    t.status_id,
    t.priority_id,

    -- scheduling
    t.due_date,
    t.start_at,
    t.completed_at,
    t.completed_by,
    t.canceled_at,
    t.cancel_reason,

    -- ownership
    t.owner_sales_id,
    t.created_by,

    -- lifecycle bookkeeping
    t.created_at,
    t.updated_at,
    t.deleted_at,
    t.deleted_by,
    t.archived_at,

    -- traceability counters (§3.4) — what the list badges render
    t.reschedule_count,
    t.reassign_count,
    t.comment_count,
    t.attachment_count,
    t.checklist_total,
    t.checklist_done,
    t.blocked_seconds,
    t.total_open_seconds,
    t.source,

    -- legacy shims: the current frontend still reads these (Appendix C step 7)
    t.contact_id,
    t.text,
    t.type,
    t.done_date,
    t.sales_id,

    -- denormalized catalogues
    s.key as status_key,
    s.label as status_label,
    s.color as status_color,
    s.is_open as status_is_open,
    s.is_terminal as status_is_terminal,
    s.counts_as_done,

    p.key as priority_key,
    p.label as priority_label,
    p.color as priority_color,
    p.rank as priority_rank,
    p.sla_hours,

    ty.key as type_key,
    ty.label as type_label,
    ty.icon as type_icon,

    -- Same reasoning as contacts_summary.company_name: the owner's name is on
    -- every row of every list, so it is resolved once here.
    nullif(btrim(concat_ws(' ', o.first_name, o.last_name)), '') as owner_name,

    -- The primary link drives the breadcrumb and the "regarding" label (§14.2).
    pl.entity_type::text as primary_entity_type,
    pl.entity_id         as primary_entity_id,
    pl.entity_label      as primary_entity_label,

    -- Display-only. Real filtering uses the raw columns so the partial indexes
    -- `tasks_overdue` / `tasks_owner_open_due` still apply (§18.3).
    (t.due_date < now()
     and t.completed_at is null
     and t.canceled_at is null
     and t.deleted_at is null) as is_overdue
from public.tasks t
    join public.task_statuses s on s.id = t.status_id
    join public.task_priorities p on p.id = t.priority_id
    join public.task_types ty on ty.id = t.task_type_id
    left join public.sales o on o.id = t.owner_sales_id
    left join lateral (
        select l.entity_type, l.entity_id, l.entity_label
        from public.task_links l
        where l.task_id = t.id
          and l.is_primary
          and l.unlinked_at is null
        limit 1
    ) pl on true;

-- Reads only: `authenticated` writes the base table, never the view.
grant select on table public.tasks_summary to authenticated;
grant select on table public.tasks_summary to service_role;
