--
-- A deal only advances once work was done on it.
--
-- The kanban already refuses a stage change with no written reason. A reason is
-- a claim, though, and a claim costs nothing: the board can still be full of
-- deals that "moved" because somebody dragged a card at the end of the quarter.
-- This adds the part that cannot be typed -- at least one task actually
-- completed on the deal since it entered the stage it is leaving.
--
-- Three pieces:
--
--   * `deal_stage_requirements`, the rule as data (per target stage), so it can
--     be tuned without a deploy and so it survives a customer renaming their
--     stages;
--   * `deal_stage_gate()`, the rule as ONE function, called both by the RPC that
--     enforces it and by the dialog that displays it -- the dialog cannot enable
--     a button for a move the server will refuse;
--   * an admin-only, written-down override, stored on the history row, because
--     a rule with no valve gets removed and a valve with no trace is the hole
--     coming back.
--
-- Scope note: `move_deal_stage()` is the enforced path. Changing `deals.stage`
-- by another route (the edit form, an import) still writes history with a null
-- reason and is NOT gated -- unchanged behaviour, deliberately left for the
-- follow-up round that closes the write path.
--

--
-- 1. The override's audit column
--

alter table public.deal_stage_changes
    add column if not exists override_reason text;

comment on column public.deal_stage_changes.override_reason is
    'Why an admin was allowed to skip the completed-task requirement. Null on every move that met it.';

--
-- 2. The rule, as data
--

create table if not exists public.deal_stage_requirements (
    to_stage text primary key,
    min_completed_tasks smallint not null default 0
        check (min_completed_tasks >= 0),
    -- Compared against the moment the deal entered its CURRENT stage, not
    -- against now(): a deal parked in a stage since before the rule existed
    -- gets its next move for free and is governed from then on. Without that,
    -- switching this on freezes every deal in flight on deploy day.
    enforced_from timestamp with time zone,
    updated_at timestamp with time zone not null default now()
);

drop trigger if exists deal_stage_requirements_set_updated_at on public.deal_stage_requirements;
create trigger deal_stage_requirements_set_updated_at
    before update on public.deal_stage_requirements
    for each row execute function public.set_updated_at();

alter table public.deal_stage_requirements enable row level security;

drop policy if exists "Deal stage requirements are readable by everyone" on public.deal_stage_requirements;
create policy "Deal stage requirements are readable by everyone"
    on public.deal_stage_requirements for select to authenticated
    using (true);

drop policy if exists "Deal stage requirements are tuned by admins" on public.deal_stage_requirements;
create policy "Deal stage requirements are tuned by admins"
    on public.deal_stage_requirements for all to authenticated
    using ((select public.current_sales_role()) = 'admin'::public.sales_role)
    with check ((select public.current_sales_role()) = 'admin'::public.sales_role);

grant select, insert, update, delete on table public.deal_stage_requirements to authenticated;
grant all on table public.deal_stage_requirements to service_role;

-- The six stages `defaultConfiguration.ts` ships, all gated at one completed
-- task. `enforced_from = now()` grandfathers the current hop of every deal
-- already on the board; their next one is governed.
--
-- `on conflict do nothing`: re-running this migration must not quietly reset a
-- threshold an admin has since tuned.
insert into public.deal_stage_requirements (to_stage, min_completed_tasks, enforced_from)
values
    ('opportunity',    1, now()),
    ('proposal-sent',  1, now()),
    ('in-negociation', 1, now()),
    ('won',            1, now()),
    ('lost',           1, now()),
    ('delayed',        1, now())
on conflict (to_stage) do nothing;

--
-- 3. The gate
--

create or replace function public.deal_stage_gate(
    p_deal_id  bigint,
    p_to_stage text
) returns jsonb
    language plpgsql stable security definer
    set search_path to ''
as $$
declare
    v_deal      public.deals;
    v_req       public.deal_stage_requirements;
    v_since     timestamp with time zone;
    v_task_ids  bigint[];
    v_completed integer;
begin
    select * into v_deal from public.deals where id = p_deal_id;
    if not found or not (select public.can_see_deal(p_deal_id)) then
        raise exception 'deal % not found', p_deal_id
            using errcode = 'no_data_found';
    end if;

    v_since := coalesce(
        (select max(changed_at)
           from public.deal_stage_changes
          where deal_id = p_deal_id
            and to_stage = v_deal.stage),
        v_deal.created_at);

    select * into v_req
      from public.deal_stage_requirements
     where to_stage = p_to_stage;

    if not found
       or v_req.min_completed_tasks = 0
       or v_req.enforced_from is null
       or v_since < v_req.enforced_from then
        return jsonb_build_object(
            'deal_id', p_deal_id,
            'to_stage', p_to_stage,
            'required', 0,
            'completed', 0,
            'ok', true,
            'since', v_since,
            'qualifying_task_ids', '[]'::jsonb);
    end if;

    select coalesce(array_agg(t.id order by t.completed_at), '{}'::bigint[])
      into v_task_ids
      from public.tasks t
     where t.completed_at is not null
       and t.completed_at >= v_since
       and t.canceled_at is null
       and t.deleted_at is null
       and exists (
           select 1
             from public.task_links l
            where l.task_id = t.id
              and l.entity_type = 'deal'
              and l.entity_id = p_deal_id
              and l.unlinked_at is null);

    v_completed := coalesce(array_length(v_task_ids, 1), 0);

    return jsonb_build_object(
        'deal_id', p_deal_id,
        'to_stage', p_to_stage,
        'required', v_req.min_completed_tasks,
        'completed', v_completed,
        'ok', v_completed >= v_req.min_completed_tasks,
        'since', v_since,
        'qualifying_task_ids', to_jsonb(v_task_ids));
end;
$$;

revoke all on function public.deal_stage_gate(bigint, text) from public, anon;
grant execute on function public.deal_stage_gate(bigint, text) to authenticated, service_role;

--
-- 4. The history trigger carries the override through
--

create or replace function public.deals_log_stage_change() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_reason      text  := nullif(btrim(coalesce(current_setting('app.deal_stage_reason', true), '')), '');
    v_attachments jsonb := nullif(coalesce(current_setting('app.deal_stage_attachments', true), ''), '')::jsonb;
    v_override    text  := nullif(btrim(coalesce(current_setting('app.deal_stage_override', true), '')), '');
    v_for_deal    text  := coalesce(current_setting('app.deal_stage_deal_id', true), '');
begin
    if v_for_deal <> new.id::text then
        v_reason := null;
        v_attachments := null;
        v_override := null;
    end if;

    insert into public.deal_stage_changes
        (deal_id, from_stage, to_stage, reason, sales_id, attachments, override_reason)
    values (
        new.id,
        old.stage,
        new.stage,
        v_reason,
        public.current_sale_id(),
        case
            when v_attachments is null or jsonb_typeof(v_attachments) <> 'array' then null
            else (select array_agg(element)
                    from jsonb_array_elements(v_attachments) as element)
        end,
        v_override
    );

    return null;
end;
$$;

--
-- 5. Enforcement, on the documented write path
--
-- Dropped rather than replaced: the new signature adds a defaulted parameter,
-- and leaving both in place makes every existing five-argument call ambiguous.
--

drop function if exists public.move_deal_stage(bigint, text, text, integer, jsonb);

create or replace function public.move_deal_stage(
    p_deal_id         bigint,
    p_to_stage        text,
    p_reason          text,
    p_index           integer default null,
    p_attachments     jsonb   default '[]'::jsonb,
    p_override_reason text    default null
) returns public.deals
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_deal     public.deals;
    v_actor    bigint := public.current_sale_id();
    v_gate     jsonb;
    v_override text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
    if coalesce(btrim(p_to_stage), '') = '' then
        raise exception 'a target stage is required'
            using errcode = 'check_violation';
    end if;

    if coalesce(btrim(p_reason), '') = '' then
        raise exception 'a reason is required to move a deal to another stage'
            using errcode = 'check_violation';
    end if;

    select * into v_deal from public.deals where id = p_deal_id for update;
    if not found then
        raise exception 'deal % not found', p_deal_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_manage_all()) and v_deal.sales_id is distinct from v_actor then
        raise exception 'no permission to move deal %', p_deal_id
            using errcode = 'insufficient_privilege';
    end if;

    if v_deal.stage = p_to_stage then
        raise exception 'deal % is already in stage %', p_deal_id, p_to_stage
            using errcode = 'check_violation';
    end if;

    -- Evaluated inside the row lock taken above, so two concurrent moves cannot
    -- both pass the gate on the strength of the same single completed task.
    v_gate := public.deal_stage_gate(p_deal_id, p_to_stage);

    if not (v_gate->>'ok')::boolean then
        -- Only an admin overrides, and only in writing. A manager can move the
        -- deal, but not past the rule.
        if v_override is null
           or (select public.current_sales_role()) is distinct from 'admin'::public.sales_role then
            raise exception 'deal % needs % completed task(s) since it entered stage % to move to %',
                    p_deal_id, v_gate->>'required', v_deal.stage, p_to_stage
                using errcode = 'check_violation',
                      detail  = 'deal_stage_requires_completed_tasks',
                      hint    = v_gate::text;
        end if;
    else
        -- The gate was satisfied, so nothing was overridden. Recording a motive
        -- here would put a skipped-the-rule marker on a move that met it.
        v_override := null;
    end if;

    perform set_config('app.deal_stage_deal_id', p_deal_id::text, true);
    perform set_config('app.deal_stage_reason', p_reason, true);
    perform set_config('app.deal_stage_attachments', coalesce(p_attachments, '[]'::jsonb)::text, true);
    perform set_config('app.deal_stage_override', coalesce(v_override, ''), true);

    update public.deals
       set stage = p_to_stage,
           index = coalesce(p_index, index),
           updated_at = now()
     where id = p_deal_id
    returning * into v_deal;

    perform set_config('app.deal_stage_deal_id', '', true);
    perform set_config('app.deal_stage_reason', '', true);
    perform set_config('app.deal_stage_attachments', '', true);
    perform set_config('app.deal_stage_override', '', true);

    return v_deal;
end;
$$;

revoke all on function public.move_deal_stage(bigint, text, text, integer, jsonb, text) from public, anon;
grant execute on function public.move_deal_stage(bigint, text, text, integer, jsonb, text) to authenticated, service_role;

--
-- 6. The override reaches the deal timeline
--
-- Copied verbatim from `supabase/schemas/03_views.sql` so the two cannot drift.
-- Only the payload gains a key: the view's own columns are unchanged, which is
-- what lets `create or replace` work on a view this many things read.
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
from public.deal_notes dn

union all

-- Stage transitions. The one event on this timeline the user did not write as
-- prose: the reason and the files travel in the payload so the deal page can
-- render "why" next to "when", without a second query per row.
select
    'deal_stage_change:' || sc.id, sc.changed_at, 'deal.stage_changed',
    'deal_stage_change',
    null::bigint, sc.sales_id, 'user',
    'deal', sc.deal_id,
    jsonb_build_object('from_stage', sc.from_stage, 'to_stage', sc.to_stage,
                       'reason', sc.reason, 'deal_id', sc.deal_id,
                       'attachments', to_jsonb(sc.attachments),
                       'override_reason', sc.override_reason)
from public.deal_stage_changes sc;

notify pgrst, 'reload schema';
