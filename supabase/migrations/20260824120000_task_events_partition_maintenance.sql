--
-- task_events partition maintenance.
--
-- `task_events` is range-partitioned on `occurred_at`, and the original
-- migration created exactly five monthly partitions (2026-08 .. 2026-12) under
-- a comment promising "created ahead of time by a scheduled job". That job was
-- never written, so on 2027-01-01 every insert would have failed with
--
--     ERROR: no partition of relation "task_events" found for row
--
-- and because `tasks_audit` fires AFTER INSERT OR UPDATE ON public.tasks and
-- writes through emit_task_event(), the failing insert aborts the whole
-- transaction: creating or editing ANY task stops working.
--
-- Two independent mechanisms, on purpose. The scheduled job keeps real monthly
-- partitions ahead of the clock; the DEFAULT partition guarantees that a month
-- when the job did not run degrades into "rows land somewhere slower" instead
-- of "the task module is down".
--

--
-- 1. The safety net.
--
-- A DEFAULT partition can never be the primary mechanism — everything that
-- lands in it is outside the pruning the monthly layout exists to provide —
-- but it converts a hard outage into a performance problem, which is the
-- trade every audit trail should take.
--
create table if not exists public.task_events_default
    partition of public.task_events default;

--
-- 2. The job's worker.
--
-- Idempotent by name lookup rather than `if not exists`, because `create table
-- ... partition of` has no IF NOT EXISTS form that also checks the bound.
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
            v_created := v_created + 1;
        exception
            when others then
                -- The realistic cause is rows already sitting in the default
                -- partition for this month: Postgres refuses to attach a
                -- partition it would have to steal rows for. Those rows are
                -- safe where they are, so warn and keep going rather than
                -- aborting the run and taking the remaining months with it.
                raise warning
                    'task_events: could not create partition % (%). Rows for that month are probably in task_events_default and must be moved before the partition can be attached.',
                    v_name, sqlerrm;
        end;
    end loop;

    return v_created;
end;
$$;

comment on function public.ensure_task_events_partitions(integer) is
    'Creates the current month''s task_events partition plus p_months_ahead more, skipping any that exist. Returns how many were created.';

-- Nobody but the scheduler and an operator has any business calling this.
revoke all on function public.ensure_task_events_partitions(integer) from public;
grant execute on function public.ensure_task_events_partitions(integer) to service_role;

--
-- 3. Immediate runway.
--
-- Twelve months now, so the fix does not depend on the scheduler having run
-- even once, and so 2027-01 exists the moment this migration is applied.
--
select public.ensure_task_events_partitions(12);

--
-- 4. The schedule.
--
-- Same shape as the reminder and notification jobs: unschedule first so a
-- re-run cannot stack duplicates, and degrade to a warning where pg_cron is
-- unavailable rather than failing the migration.
--
do $$
begin
    create extension if not exists pg_cron;

    perform cron.unschedule('create-task-events-partitions')
      where exists (select 1 from cron.job
                     where jobname = 'create-task-events-partitions');

    -- 03:00 on the 1st. The window between the run and the month it prepares
    -- for is three months wide, so a couple of missed runs are survivable.
    perform cron.schedule(
        'create-task-events-partitions',
        '0 3 1 * *',
        $cron$select public.ensure_task_events_partitions(3);$cron$);
exception
    when others then
        raise warning
            'pg_cron unavailable (%): task_events partitions will not be created automatically. Call public.ensure_task_events_partitions() from an external scheduler.',
            sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
