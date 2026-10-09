--
-- Currencies & exchange rates: the scheduled update (docs/proposals/multi-currency-fx.md).
--
-- pg_cron ticks every 30 minutes and posts to the `exchange-rates-sync` edge
-- function. The tick is NOT the refresh frequency: each provider's own
-- `refresh_interval_minutes` decides, inside `fx_begin_sync_run()`, whether a
-- tick calls it at all. That keeps the frequency configurable from the screen
-- without rescheduling a job, and means opening a quotation never calls an
-- external API -- it reads the rates already stored.
--
-- The function's URL and the service-role key live in Supabase Vault
-- (`fx_sync_url`, `fx_sync_service_key`), never in a migration or a table a
-- client can read. Until both exist the dispatch is a no-op and the health
-- panel reports the automatic sync as inactive. See the proposal's "Setup".
--
-- The jobs are not in `supabase/schemas/` (a row in `cron.job` is cluster
-- state); the function is, in 02_functions.sql.
--

create or replace function public.fx_dispatch_sync() returns bigint
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_url text;
    v_key text;
begin
    select d.decrypted_secret into v_url
      from vault.decrypted_secrets d where d.name = 'fx_sync_url';
    select d.decrypted_secret into v_key
      from vault.decrypted_secrets d where d.name = 'fx_sync_service_key';

    if v_url is null or v_key is null then
        return null;
    end if;

    -- pg_net is asynchronous: this queues the request and returns its id. The
    -- outcome is recorded by the function itself, in `exchange_rate_sync_runs`.
    return net.http_post(
        url                  := v_url,
        body                 := jsonb_build_object('trigger', 'cron'),
        headers              := jsonb_build_object(
                                    'Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
        timeout_milliseconds := 60000);
end;
$$;

revoke all on function public.fx_dispatch_sync() from public, anon, authenticated;
grant execute on function public.fx_dispatch_sync() to service_role;

do $$
begin
    create extension if not exists pg_cron;

    perform cron.unschedule('fx-rates-sync')
      where exists (select 1 from cron.job where jobname = 'fx-rates-sync');
    perform cron.schedule(
        'fx-rates-sync',
        '*/30 * * * *',
        $cron$select public.fx_dispatch_sync();$cron$);

    perform cron.unschedule('fx-sync-runs-reaper')
      where exists (select 1 from cron.job where jobname = 'fx-sync-runs-reaper');
    perform cron.schedule(
        'fx-sync-runs-reaper',
        '*/15 * * * *',
        $cron$select public.fx_reap_sync_runs();$cron$);
exception
    when others then
        -- Same degradation as the other schedulers: no pg_cron means "rates
        -- are not refreshed automatically", which the health panel shows,
        -- rather than a half-applied migration chain.
        raise warning
            'pg_cron unavailable (%): exchange rates will only update when somebody presses "Sync now"',
            sqlerrm;
end;
$$;
