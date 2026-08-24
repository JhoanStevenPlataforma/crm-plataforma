--
-- Task module — attaching a task to any record (proposal §14.2).
--
-- A task can hang off a contact, a lead, a company or a deal. Creating that
-- link from the client would need three statements (demote the current primary,
-- insert the new row, emit the event) with no way to keep them consistent, and
-- `linked_by` would be whatever the client claimed. This function does the lot
-- server-side and resolves the actor from the session, exactly like
-- `transition_task()` does for status.
--
-- Idempotent: re-linking a record that is already attached promotes it instead
-- of creating a duplicate, so a double click cannot corrupt the graph.
--
create or replace function public.link_task_to_entity(
    p_task_id     bigint,
    p_entity_type public.task_entity,
    p_entity_id   bigint,
    p_label       text default null,
    p_primary     boolean default true
) returns public.task_links
    language plpgsql security invoker
    set search_path to ''
as $$
declare
    v_actor bigint := public.current_sale_id();
    v_link  public.task_links;
begin
    if not public.can_see_task(p_task_id) then
        raise exception 'no permission to link task %', p_task_id
            using errcode = 'insufficient_privilege';
    end if;

    -- Only one primary link at a time (enforced by task_links_single_primary).
    if coalesce(p_primary, false) then
        update public.task_links
           set is_primary = false
         where task_id = p_task_id
           and unlinked_at is null
           and is_primary
           and not (entity_type = p_entity_type and entity_id = p_entity_id);
    end if;

    insert into public.task_links (
        task_id, entity_type, entity_id, is_primary, linked_by, entity_label
    )
    values (
        p_task_id, p_entity_type, p_entity_id,
        coalesce(p_primary, false), v_actor, p_label
    )
    on conflict do nothing
    returning * into v_link;

    if v_link.id is null then
        -- Already linked: promote and refresh the label snapshot instead.
        update public.task_links
           set is_primary   = coalesce(p_primary, is_primary),
               entity_label = coalesce(p_label, entity_label)
         where task_id = p_task_id
           and entity_type = p_entity_type
           and entity_id = p_entity_id
           and unlinked_at is null
        returning * into v_link;
    else
        perform public.emit_task_event(
            p_task_id,
            'link.added',
            v_actor,
            null,
            jsonb_build_object(
                'entity_type', p_entity_type,
                'entity_id', p_entity_id
            ),
            jsonb_build_object('is_primary', coalesce(p_primary, false)),
            null,
            case when v_actor is null then 'system' else 'user' end
        );
    end if;

    return v_link;
end;
$$;

grant all on function public.link_task_to_entity(bigint, public.task_entity, bigint, text, boolean) to authenticated;
grant all on function public.link_task_to_entity(bigint, public.task_entity, bigint, text, boolean) to service_role;
