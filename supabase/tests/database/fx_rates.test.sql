--
-- Currencies & exchange rates: the rates themselves (docs/proposals/multi-currency-fx.md).
--
--   * a provider's quote is stored in the base convention, a cross rate only
--     through a pivot of the SAME day, and a replay inserts nothing;
--   * invalid values (negative, unparseable, unknown currency) are refused and
--     counted, never stored;
--   * the last valid rate is kept and reported stale, never hidden;
--   * a manual commercial rate does not touch the official one;
--   * the table is append-only; the base cannot move once rates exist;
--   * runs cannot overlap, the cache skips a fresh provider, failures back off
--     and reach the admins once;
--   * the health report derives each provider's status;
--   * roles: everybody reads, managers add manual rates, admins configure;
--     anon holds nothing.
--
begin;

select plan(41);

create function public.fx_test_error_of(p_sql text) returns text
    language plpgsql
as $$
declare
    v_detail text;
begin
    execute p_sql;
    return 'no error';
exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    return sqlstate || coalesce(':' || nullif(v_detail, ''), '');
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('97900000-0000-0000-0000-000000000001', 'fx.rep@test.local', '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('97900000-0000-0000-0000-000000000002', 'fx.mgr@test.local', '{"first_name":"Mara","last_name":"Manager"}'::jsonb),
  ('97900000-0000-0000-0000-000000000003', 'fx.adm@test.local', '{"first_name":"Ada","last_name":"Admin"}'::jsonb);
update public.sales set id = 9791, role = 'rep'     where user_id = '97900000-0000-0000-0000-000000000001';
update public.sales set id = 9792, role = 'manager' where user_id = '97900000-0000-0000-0000-000000000002';
update public.sales set id = 9793, role = 'admin'   where user_id = '97900000-0000-0000-0000-000000000003';
-- Whatever else this database holds, only this test's admin is notified.
update public.sales set disabled = true where role = 'admin' and id <> 9793;

-- A clean slate for the module's history, inside this transaction only.
select set_config('app.quote_purge', 'on', true);
delete from public.exchange_rate_sync_runs where id is not null;
delete from public.exchange_rates where id is not null;
select set_config('app.quote_purge', '', true);
select set_config('app.fx_system_write', 'on', true);
update public.exchange_rate_providers
   set last_success_at = null, last_attempt_at = null, consecutive_failures = 0,
       last_error = null, last_error_at = null, is_enabled = true
 where id is not null;
select set_config('app.fx_system_write', '', true);
update public.exchange_rate_settings set stale_after_days = 3, failure_alert_threshold = 3 where id = 1;
insert into public.currencies (code, name, decimals) values ('GBP', 'Pound sterling', 2)
on conflict (code) do nothing;

select is(public.fx_base_currency()::text, 'COP', 'COP is the base currency');

--
-- 1. A run of the TRM, then of the ECB crossed through it.
--
set local role service_role;

select set_config('fx.run1', (public.fx_begin_sync_run('trm_co', 'manual') ->> 'run_id'), true);
select ok(current_setting('fx.run1') <> '', 'a run is claimed for the TRM');
select is(
    public.fx_begin_sync_run('trm_co', 'cron') ->> 'skipped', 'already_running',
    'a second run of the same provider is refused while the first is running');

select is(
    public.fx_record_rates(current_setting('fx.run1')::bigint, jsonb_build_array(
        jsonb_build_object('currency', 'USD', 'quote_currency', 'COP', 'rate', '4000',
                           'effective_date', current_date, 'valid_until', current_date + 1,
                           'raw', jsonb_build_object('valor', '4000')),
        -- An old TRM, in force for that one day only: no pivot for later days.
        jsonb_build_object('currency', 'USD', 'quote_currency', 'COP', 'rate', '3900',
                           'effective_date', current_date - 20, 'valid_until', current_date - 20),
        jsonb_build_object('currency', 'USD', 'quote_currency', 'COP', 'rate', '-1',
                           'effective_date', current_date - 1),
        jsonb_build_object('currency', 'USD', 'quote_currency', 'COP', 'rate', 'abc',
                           'effective_date', current_date - 2),
        jsonb_build_object('currency', 'XXX', 'quote_currency', 'COP', 'rate', '10',
                           'effective_date', current_date)
    )) - 'rejected',
    '{"received": 5, "inserted": 2}'::jsonb,
    'the valid TRMs are stored; a negative, an unparseable and an unknown one are not');
select is(
    (select jsonb_agg(r ->> 'reason' order by r ->> 'reason')
       from jsonb_array_elements((select details -> 'rejected' from public.exchange_rate_sync_runs
                                   where id = current_setting('fx.run1')::bigint)) r),
    '["currency_unknown", "rate_not_positive", "unparseable"]'::jsonb,
    'each refusal is recorded on the run with its reason');
select is(
    (public.fx_record_rates(current_setting('fx.run1')::bigint, jsonb_build_array(
        jsonb_build_object('currency', 'USD', 'quote_currency', 'COP', 'rate', '4000',
                           'effective_date', current_date)))) ->> 'inserted',
    '0',
    'a replay of the same day inserts nothing: no duplicate for currency, provider and date');
select is(
    public.fx_finish_sync_run(current_setting('fx.run1')::bigint, true, 1) ->> 'status',
    'succeeded', 'the run closes as succeeded');

select is(
    public.fx_begin_sync_run('trm_co', 'cron') ->> 'skipped', 'not_due',
    'a provider fetched within its interval is not called again (the cache)');
select ok(
    public.fx_begin_sync_run('trm_co', 'manual', true) ? 'run_id',
    'a forced manual run bypasses the cache');
select set_config('fx.run1b', (select max(id)::text from public.exchange_rate_sync_runs), true);
select public.fx_finish_sync_run(current_setting('fx.run1b')::bigint, true, 1);

select set_config('fx.run2', (public.fx_begin_sync_run('ecb_frankfurter', 'manual') ->> 'run_id'), true);
select is(
    public.fx_record_rates(current_setting('fx.run2')::bigint, jsonb_build_array(
        -- 1 USD = 0.8 EUR, so 1 EUR = 4000 / 0.8 = 5000 COP.
        jsonb_build_object('currency', 'USD', 'quote_currency', 'EUR', 'rate', '0.8',
                           'effective_date', current_date),
        -- Ten days ago no TRM was in force (the last one covered 20 days ago
        -- only): no pivot of THAT day, so no rate -- not one crossed through
        -- the old TRM.
        jsonb_build_object('currency', 'USD', 'quote_currency', 'GBP', 'rate', '0.75',
                           'effective_date', current_date - 10)
    )) -> 'rejected' -> 0 ->> 'reason',
    'pivot_missing',
    'a cross rate is never made with a pivot of another day');
select public.fx_finish_sync_run(current_setting('fx.run2')::bigint, true, 1);

select is(
    (select jsonb_build_object('rate', r.rate, 'derived_via', r.derived_via, 'kind', r.kind)
       from public.exchange_rates r where r.currency_code = 'EUR'),
    '{"rate": 5000.0000000000, "derived_via": "USD", "kind": "official"}'::jsonb,
    'the ECB quote is crossed into COP through the TRM of the same day');

--
-- 2. Resolution and staleness.
--
select is(
    (select jsonb_build_object('rate', r.rate, 'kind', r.kind, 'provider', r.provider_key,
                               'stale', r.is_stale)
       from public.fx_resolve_rate('USD', 'official') r),
    '{"rate": 4000.0000000000, "kind": "official", "provider": "trm_co", "stale": false}'::jsonb,
    'the official USD rate resolves to the TRM, current');
select is(
    (select r.rate from public.fx_resolve_rate('COP', 'official') r),
    1::numeric, 'the base resolves to 1');
select is(
    (select count(*)::int from public.fx_resolve_rate('MXN', 'official')),
    0, 'a currency with no rate resolves to nothing, never to a guess');

reset role;
-- An official MXN rate ten days old, typed by hand by the manager.
select set_config('request.jwt.claims',
    '{"sub":"97900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, note)
values ('MXN', 'COP', 220, 'official', current_date - 10, 'Banxico fix, entered by hand');

select is(
    (select jsonb_build_object('rate', r.rate, 'stale', r.is_stale, 'date', r.effective_date = current_date - 10)
       from public.fx_resolve_rate('MXN', 'official') r),
    '{"rate": 220.0000000000, "stale": true, "date": true}'::jsonb,
    'the last valid rate is still served, and reported stale with its own date');
select is(
    (select jsonb_build_object('stale', c.official_is_stale, 'age', c.official_age_days)
       from public.current_exchange_rates c where c.currency_code = 'MXN'),
    '{"stale": true, "age": 10}'::jsonb,
    'the current-rate view says how old the rate is and that it is stale');

--
-- 3. Manual commercial rates.
--
select is(
    (select r.created_by from public.exchange_rates r where r.currency_code = 'MXN'),
    9792::bigint, 'a manual rate is signed by the session');

insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, valid_until, note)
values ('USD', 'COP', 4100, 'commercial', current_date, current_date + 30, 'Commercial rate for October');

select is(
    (select jsonb_build_object('official', c.official_rate, 'commercial', c.commercial_rate,
                               'diff', c.commercial_diff_percent)
       from public.current_exchange_rates c where c.currency_code = 'USD'),
    '{"official": 4000.0000000000, "commercial": 4100.0000000000, "diff": 2.5000}'::jsonb,
    'the commercial rate sits beside the official one, which it does not overwrite');
select is(
    (select r.kind from public.fx_resolve_rate('EUR', 'commercial') r),
    'official', 'with no commercial rate, the commercial resolution falls back to the official one');
select is(
    (select count(*)::int from public.exchange_rate_audit_logs l
      where l.entity = 'rate' and l.action = 'rate.commercial.created' and l.sales_id = 9792),
    1, 'a manual rate is written to the audit log with its author');

select is(
    public.fx_test_error_of($$update public.exchange_rates set rate = 1 where currency_code = 'USD'$$),
    '42501', 'nobody may update a rate: the table is history');

reset role;
select is(
    public.fx_test_error_of($$update public.exchange_rates set rate = 1 where currency_code = 'USD'$$),
    '42501', 'not even the table owner: the immutability trigger refuses it');

--
-- 4. Roles.
--
select set_config('request.jwt.claims',
    '{"sub":"97900000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select ok(
    (select count(*) from public.current_exchange_rates) > 0,
    'a rep reads the current rates');
select is(
    public.fx_test_error_of($$insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, note)
                               values ('USD', 'COP', 3000, 'commercial', current_date, 'mine')$$),
    '42501', 'a rep cannot add a rate');
select is(
    (select count(*)::int from public.exchange_rate_sync_runs), 0,
    'a rep does not see the sync runs');
select is(
    public.fx_test_error_of($$select public.fx_integration_health()$$),
    '42501:fx_forbidden', 'a rep cannot read the integration health');

reset role;
select set_config('request.jwt.claims',
    '{"sub":"97900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

update public.currencies set decimals = 3 where code = 'USD';
select is(
    (select decimals from public.currencies where code = 'USD'), 2::smallint,
    'a manager cannot configure currencies (the update matches nothing)');
select is(
    public.fx_test_error_of($$insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, provider_id)
                               values ('USD', 'COP', 3000, 'official', current_date, (select id from public.exchange_rate_providers where key = 'trm_co'))$$),
    '42501', 'a manager cannot forge a provider''s rate');

reset role;
select set_config('request.jwt.claims',
    '{"sub":"97900000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

update public.currencies set is_quote_default = true where code = 'USD';
select is(
    (select array_agg(code::text order by code) from public.currencies where is_quote_default),
    array['USD'], 'choosing a new quotation default releases the old one');
select is(
    public.fx_test_error_of($$update public.currencies set is_base = true where code = 'USD'$$),
    '23514:fx_base_via_function', 'the base is never posted');
select is(
    public.fx_test_error_of($$select public.set_base_currency('USD')$$),
    '23514:fx_base_locked', 'the base cannot move once rates exist');
select is(
    public.fx_test_error_of($$update public.exchange_rate_providers set consecutive_failures = 0, last_error = 'x' where key = 'trm_co'$$),
    '23514:fx_column_protected', 'the sync status of a provider is not editable');

update public.exchange_rate_providers set refresh_interval_minutes = 60 where key = 'trm_co';
select is(
    (select count(*)::int from public.exchange_rate_audit_logs l
      where l.entity = 'provider' and l.entity_key = 'trm_co'
        and l.field = 'refresh_interval_minutes' and l.sales_id = 9793),
    1, 'a provider change is audited field by field, with its author');

--
-- 5. Failures, backoff, and the admins told once.
--
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);

select set_config('fx.f1', (public.fx_begin_sync_run('ecb_frankfurter', 'cron', true) ->> 'run_id'), true);
select public.fx_finish_sync_run(current_setting('fx.f1')::bigint, false, 3, 'timeout after 10000 ms');
select is(
    public.fx_begin_sync_run('ecb_frankfurter', 'cron') ->> 'skipped', 'not_due',
    'a failed provider is still not due while its last success is fresh');

reset role;
select set_config('app.fx_system_write', 'on', true);
update public.exchange_rate_providers
   set last_success_at = now() - interval '2 days', last_attempt_at = now() - interval '1 minute'
 where key = 'ecb_frankfurter';
select set_config('app.fx_system_write', '', true);
set local role service_role;
select is(
    public.fx_begin_sync_run('ecb_frankfurter', 'cron') ->> 'skipped', 'backoff',
    'after a failure the next call waits for the backoff');

select set_config('fx.f2', (public.fx_begin_sync_run('ecb_frankfurter', 'cron', true) ->> 'run_id'), true);
select public.fx_finish_sync_run(current_setting('fx.f2')::bigint, false, 3, 'HTTP 503');
select set_config('fx.f3', (public.fx_begin_sync_run('ecb_frankfurter', 'cron', true) ->> 'run_id'), true);
select is(
    (public.fx_finish_sync_run(current_setting('fx.f3')::bigint, false, 3, 'HTTP 503')) ->> 'notified',
    '1', 'the third consecutive failure notifies the admin');
select set_config('fx.f4', (public.fx_begin_sync_run('ecb_frankfurter', 'cron', true) ->> 'run_id'), true);
select public.fx_finish_sync_run(current_setting('fx.f4')::bigint, false, 3, 'HTTP 503');
select is(
    (select count(*)::int from public.task_notifications n
      where n.entity_type = 'exchange_rate_provider' and n.recipient_id = 9793),
    1, 'a fourth failure the same day does not notify again');
select is(
    (select ar.rate from public.exchange_rates ar where ar.currency_code = 'EUR'),
    5000.0000000000::numeric, 'a failure leaves the stored rate untouched');

--
-- 6. Health.
--
reset role;
select set_config('request.jwt.claims',
    '{"sub":"97900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
    (select jsonb_object_agg(p ->> 'key', p ->> 'status')
       from jsonb_array_elements(public.fx_integration_health() -> 'providers') p),
    '{"trm_co": "operational", "ecb_frankfurter": "down"}'::jsonb,
    'the health report derives each provider''s status');
select is(
    (select jsonb_build_object('currency', h -> 'oldest_rate_in_use' ->> 'currency',
                               'stale', (h -> 'oldest_rate_in_use' ->> 'is_stale')::boolean)
       from (select public.fx_integration_health() as h) x),
    '{"currency": "MXN", "stale": true}'::jsonb,
    'the oldest rate still in use is reported, and flagged stale');

--
-- 7. anon holds nothing on the module.
--
reset role;
select is(
    (select count(*)::int
       from unnest(array['currencies', 'exchange_rate_providers', 'exchange_rates',
                         'exchange_rate_settings', 'exchange_rate_sync_runs',
                         'exchange_rate_audit_logs', 'current_exchange_rates']) t
      where has_table_privilege('anon', 'public.' || t, 'select')
         or has_table_privilege('anon', 'public.' || t, 'insert')
         or has_table_privilege('anon', 'public.' || t, 'update')
         or has_table_privilege('anon', 'public.' || t, 'delete')),
    0, 'anon holds no privilege on any table or view of the module');

select * from finish();
rollback;
