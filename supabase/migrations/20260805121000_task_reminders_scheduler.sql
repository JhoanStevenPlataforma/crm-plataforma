--
-- The reminder scheduler and the in-app delivery transport (§9.3, §9.4).
--
-- Deliberately NOT in `supabase/schemas/`: a cron job is a row in `cron.job`
-- and a publication membership is cluster state, neither of which is part of
-- the declarative schema. Putting them there would make every `db diff` try to
-- reconcile infrastructure it does not own.
--

--
-- 1. The tick.
--
-- Guarded: `pg_cron` needs `shared_preload_libraries`, which a bare Postgres
-- (or a CI container) may not have. A missing scheduler must degrade to
-- "reminders are not dispatched" — a visible, recoverable state — rather than
-- fail the whole migration chain and leave the database half-built.
-- `dispatch_due_reminders()` is idempotent and safe to call from anywhere, so
-- an external scheduler can drive it instead where pg_cron is unavailable.
--
do $$
begin
    create extension if not exists pg_cron;

    -- Re-running the migration must not stack duplicate jobs.
    perform cron.unschedule('dispatch-task-reminders')
      where exists (select 1 from cron.job where jobname = 'dispatch-task-reminders');

    perform cron.schedule(
        'dispatch-task-reminders',
        '* * * * *',
        $cron$select public.dispatch_due_reminders();$cron$);
exception
    when others then
        raise warning
            'pg_cron unavailable (%): task reminders will not fire until a scheduler calls public.dispatch_due_reminders()',
            sqlerrm;
end;
$$;

--
-- 2. In-app delivery (deliverable 2.2).
--
-- An in-app notification needs no worker: the outbox row IS the delivery, and
-- Realtime streams the insert straight to the recipient's browser. RLS on
-- `task_notifications` already restricts a row to its own recipient, and
-- Realtime honours RLS, so adding the table to the publication does not widen
-- who can see what.
--
do $$
begin
    alter publication supabase_realtime add table public.task_notifications;
exception
    when duplicate_object then null;   -- already published
    when undefined_object then
        raise warning 'publication supabase_realtime missing: in-app notifications will not stream';
end;
$$;

-- Realtime needs the full row on insert to build the payload the client reads.
alter table public.task_notifications replica identity full;
