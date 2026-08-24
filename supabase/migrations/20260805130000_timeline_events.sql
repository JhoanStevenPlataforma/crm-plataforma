--
-- The unified timeline (proposal §6, deliverable 2.8).
--
-- Additive only: a new view plus its grants. Nothing existing is dropped, so
-- this cannot lose `tasks_summary` / `contacts_summary` the way a generated
-- diff does when a task column changes.
--
--
-- The unified timeline (§6.2)
--
-- `activity_log` unions five tables and omits tasks entirely (W9): the CRM's
-- own timeline does not know tasks exist. This view is the replacement — the
-- task event stream merged with the surrounding note activity, so a user reads
-- one chronological story instead of three disconnected ones.
--
-- `security_invoker = on` means every branch is filtered by its own table's
-- RLS: task events resolve through `can_see_task`, notes through their
-- ownership policies. There is no place here where the union widens access.
--
-- PERFORMANCE CAVEAT (§6.2). A `UNION ALL` cannot push a LIMIT into every
-- branch once the sort spans branches, so this is the Phase-2 shape and not the
-- final one. At the volumes in §18 it becomes a materialized `timeline` table
-- fed by the same triggers. The column list is deliberately the shape that
-- table will have, so the swap is invisible to the frontend: filter on
-- `entity_type` + `entity_id` and never on a computed column.
--
create or replace view public.timeline_events with (security_invoker = on) as
select
    'task_event:' || e.id            as id,
    e.occurred_at                    as occurred_at,
    e.event_type::text               as event_type,
    'task'                           as source,
    e.task_id                        as task_id,
    e.actor_sales_id                 as actor_sales_id,
    e.actor_kind                     as actor_kind,
    -- The entity the event hangs off, so a contact or deal page can filter
    -- without joining task_links itself.
    pl.entity_type::text             as entity_type,
    pl.entity_id                     as entity_id,
    jsonb_build_object('field', e.field, 'old', e.old_value,
                       'new', e.new_value, 'meta', e.metadata,
                       'note', e.note)  as payload
from public.task_events e
    left join lateral (
        select l.entity_type, l.entity_id
        from public.task_links l
        where l.task_id = e.task_id
          and l.is_primary
          and l.unlinked_at is null
        limit 1
    ) pl on true

union all

select
    'contact_note:' || n.id, n.date, 'note.created', 'contact_note',
    null::bigint, n.sales_id, 'user',
    'contact', n.contact_id,
    jsonb_build_object('text', n.text, 'status', n.status,
                       'contact_id', n.contact_id)
from public.contact_notes n

union all

select
    'deal_note:' || dn.id, dn.date, 'note.created', 'deal_note',
    null::bigint, dn.sales_id, 'user',
    'deal', dn.deal_id,
    jsonb_build_object('text', dn.text, 'deal_id', dn.deal_id)
from public.deal_notes dn;

grant select on table public.timeline_events to authenticated;
grant select on table public.timeline_events to service_role;

notify pgrst, 'reload schema';
