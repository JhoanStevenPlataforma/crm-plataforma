-- Close two RLS-evasion holes in the task audit trail (audit AUD-002 / AUD-003).
--
-- 1. task_events is partitioned by month. Row level security on the PARENT is
--    not inherited by a partition, and `alter default privileges` (06_grants.sql)
--    grants anon/authenticated every privilege on each partition as it is
--    created. So a direct query to public.task_events_YYYY_MM returned every
--    row regardless of owner, and anon could read the whole trail -- including
--    the IP addresses and user agents stored as evidence. This migration
--    secures every existing partition and rewrites ensure_task_events_partitions()
--    so future partitions are born closed.
--
-- 2. A set of internal SECURITY DEFINER helpers kept the EXECUTE-to-PUBLIC grant
--    Postgres gives every new function, so any browser session (some even anon)
--    could forge audit events, cancel invisible tasks, or create tables. Their
--    legitimate callers are triggers/definer functions running as the owner, so
--    revoking direct EXECUTE is safe.
--
-- Idempotent: enable/force RLS and revoke are no-ops when already applied.

--
-- 1a. Secure every existing task_events partition.
--
do $$
declare
    part regclass;
begin
    for part in
        select inhrelid::regclass
          from pg_inherits
         where inhparent = 'public.task_events'::regclass
    loop
        execute format('alter table %s enable row level security', part);
        execute format('alter table %s force row level security', part);
        execute format('revoke all on table %s from anon, authenticated', part);
    end loop;
end;
$$;

--
-- 1b. Future partitions are born closed. Same body as before, plus the three
--     securing statements on each newly created partition.
--
create or replace function public.ensure_task_events_partitions(
    p_months_ahead integer default 3)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_month   date;
    v_name    text;
    v_created integer := 0;
    i         integer;
begin
    for i in 0..greatest(p_months_ahead, 0) loop
        v_month := (date_trunc('month', now()) + make_interval(months => i))::date;
        v_name  := 'task_events_' || to_char(v_month, 'YYYY_MM');

        if exists (select 1
                     from pg_catalog.pg_class c
                     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public'
                      and c.relname = v_name) then
            continue;
        end if;

        begin
            execute format(
                'create table public.%I partition of public.task_events '
                'for values from (%L) to (%L)',
                v_name,
                v_month,
                (v_month + interval '1 month')::date);
            -- A partition is a table in its own right: the parent's row level
            -- security is NOT inherited, and `alter default privileges` in
            -- 06_grants.sql has just handed anon/authenticated every privilege
            -- on it. Close it here, on the same statement that opened it, so
            -- the window never exists.
            execute format(
                'alter table public.%I enable row level security', v_name);
            execute format(
                'alter table public.%I force row level security', v_name);
            execute format(
                'revoke all on table public.%I from anon, authenticated', v_name);
            v_created := v_created + 1;
        exception
            when others then
                -- The realistic cause is rows already sitting in the default
                -- partition for this month: Postgres refuses to attach a
                -- partition it would have to steal rows for. Those rows are
                -- safe where they are, so warn and keep going.
                raise warning
                    'task_events: could not create partition % (%). Rows for that month are probably in task_events_default and must be moved before the partition can be attached.',
                    v_name, sqlerrm;
        end;
    end loop;

    return v_created;
end;
$$;

--
-- 2. Revoke the internal SECURITY DEFINER helpers from everyone but service_role.
--    `revoke ... from public` removes the built-in EXECUTE-to-PUBLIC; the two
--    named roles cover the direct grants alter-default-privileges may have added.
--
revoke all on function public.emit_task_event(bigint, public.task_event_type, bigint, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.set_task_status_system(bigint, text, public.task_event_type, jsonb) from public, anon, authenticated;
revoke all on function public.sync_comment_mentions(bigint, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.refresh_attachment_counter(bigint) from public, anon, authenticated;
revoke all on function public.refresh_checklist_counters(bigint) from public, anon, authenticated;
revoke all on function public.reminder_recipient_ids(jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_due_reminders(integer) from public, anon, authenticated;
revoke all on function public.ensure_task_events_partitions(integer) from public, anon, authenticated;

--
-- 3. UI-facing SECURITY DEFINER functions leaked to anon via EXECUTE-to-PUBLIC.
--    Keep authenticated (its grant is independent), close anon. Verified that
--    authenticated retains every one of these after the revoke.
--
revoke all on function public.can_manage_all() from public, anon;
revoke all on function public.can_see_deal(bigint) from public, anon;
revoke all on function public.can_see_task(bigint) from public, anon;
revoke all on function public.compute_reminder_next_fire(jsonb, timestamp with time zone) from public, anon;
revoke all on function public.current_sale_id() from public, anon;
revoke all on function public.current_sales_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.task_has_open_blockers(bigint) from public, anon;
revoke all on function public.transition_task(bigint, text, text, jsonb) from public, anon;
