--
-- Currencies & exchange rates: the retention path (docs/proposals/multi-currency-fx.md).
--
-- `exchange_rates` and `exchange_rate_audit_logs` are append-only, and their
-- author columns pin `sales` rows, so nothing could ever reset a database that
-- holds them -- the e2e `resetDb()` above all. This is the one documented way
-- past the guard, exactly like `purge_quotes()`: `service_role` only, opening
-- the `app.quote_purge` hatch the immutability trigger honours, every DELETE
-- with a WHERE clause (the API roles preload `safeupdate`).
--
-- It also returns the providers to "never ran", so a reset database reports
-- the integration as it truly is. The catalogue, the providers and the
-- settings are reference data and survive.
--
create or replace function public.purge_exchange_rates() returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    perform set_config('app.quote_purge', 'on', true);

    delete from public.exchange_rate_sync_runs where id is not null;
    delete from public.exchange_rate_audit_logs where id is not null;
    -- Corrections point at the rows they supersede: those go first.
    delete from public.exchange_rates where supersedes_id is not null;
    delete from public.exchange_rates where id is not null;
    get diagnostics v_count = row_count;

    perform set_config('app.fx_system_write', 'on', true);
    update public.exchange_rate_providers
       set last_attempt_at = null, last_success_at = null, last_error_at = null,
           last_error = null, consecutive_failures = 0
     where id is not null;
    perform set_config('app.fx_system_write', '', true);

    perform set_config('app.quote_purge', '', true);
    return v_count;
end;
$$;

revoke all on function public.purge_exchange_rates() from public, anon, authenticated;
grant execute on function public.purge_exchange_rates() to service_role;
