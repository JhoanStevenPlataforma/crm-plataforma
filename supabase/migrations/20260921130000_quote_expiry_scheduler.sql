--
-- The quote validity sweep, scheduled (proposal §8, §13.6 #9, Phase 11).
--
-- `sweep_expired_quotes()` has existed since Phase 2 and nothing ever called
-- it. A function that can only be run by hand is not a sweeper: in practice an
-- offer nobody answered stayed `sent` forever, the `expired` status was
-- unreachable outside a test, and `quotes_expiring_idx` defended a query that
-- never ran.
--
-- Deliberately NOT in `supabase/schemas/`: a cron job is a row in `cron.job`,
-- which is cluster state and not part of the declarative schema. Putting it
-- there would make every `db diff` try to reconcile infrastructure it does not
-- own. Same reasoning, same shape, as `20260805121000_task_reminders_scheduler`.
--
-- Daily and not per minute, because both halves of the pass are keyed on
-- `current_date`: expiry is a date comparison, and the three-day warning fires
-- on one date per quote. Running it every minute would do the same work 1,440
-- times for one extra notification nobody is waiting on.
--
-- 06:00 UTC is before the working day in the Americas, which is where this
-- CRM's users are, so a rep opening the app finds the overnight lapses already
-- reflected rather than watching quotes expire under them mid-morning.
--
do $$
begin
    create extension if not exists pg_cron;

    -- Re-running the migration must not stack duplicate jobs.
    perform cron.unschedule('sweep-expired-quotes')
      where exists (select 1 from cron.job where jobname = 'sweep-expired-quotes');

    perform cron.schedule(
        'sweep-expired-quotes',
        '0 6 * * *',
        $cron$select public.sweep_expired_quotes();$cron$);
exception
    when others then
        -- `pg_cron` needs `shared_preload_libraries`, which a bare Postgres (or
        -- a CI container) may not have. A missing scheduler must degrade to
        -- "quotes are not swept" -- a visible, recoverable state -- rather than
        -- fail the migration chain and leave the database half-built.
        -- `sweep_expired_quotes()` is idempotent and safe to call from
        -- anywhere, so an external scheduler can drive it instead.
        raise warning
            'pg_cron unavailable (%): quote validity will not be swept until a scheduler calls public.sweep_expired_quotes()',
            sqlerrm;
end;
$$;
