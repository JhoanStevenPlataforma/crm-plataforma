--
-- Currencies & exchange rates: quotations (docs/proposals/multi-currency-fx.md).
--
--   * a draft starts at the configured rate; the base currency at 1;
--   * a price from a list in another currency is converted by the server:
--     COP -> USD, USD -> COP, and EUR -> USD through the base;
--   * the order of operations is unchanged (gross, discount, tax), and the base
--     equivalent is each total times the rate, in the base's decimals;
--   * a half cent rounds away from zero;
--   * issuing freezes the rate: a later rate changes neither the version, nor
--     its equivalent, nor the customer's document; a revision starts from the
--     frozen rate and is re-priced only on purpose;
--   * the deal's amount is the base equivalent;
--   * custom rates: managers, or reps within tolerance, always with a reason;
--   * no rate, or a stale one, cannot be issued.
--
begin;

select plan(31);

create function public.fxq_test_error_of(p_sql text) returns text
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

create function public.fxq_version(p_quote_id bigint) returns public.quote_versions
    language sql stable security definer
    set search_path to ''
as $$
    select v.* from public.quote_versions v
     where v.quote_id = p_quote_id order by v.version_number desc limit 1;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('97910000-0000-0000-0000-000000000001', 'fxq.rep@test.local', '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('97910000-0000-0000-0000-000000000002', 'fxq.mgr@test.local', '{"first_name":"Mara","last_name":"Manager"}'::jsonb);
update public.sales set id = 9801, role = 'rep'     where user_id = '97910000-0000-0000-0000-000000000001';
update public.sales set id = 9802, role = 'manager' where user_id = '97910000-0000-0000-0000-000000000002';

-- Deterministic settings and rate history, inside this transaction only.
update public.quote_discount_rules set enforced_from = null where enforced_from is not null;
update public.exchange_rate_settings
   set quote_rate_kind_default = 'official', stale_after_days = 3,
       rep_custom_rate_tolerance_percent = 0
 where id = 1;
select set_config('app.quote_purge', 'on', true);
delete from public.exchange_rate_sync_runs where id is not null;
delete from public.exchange_rates where id is not null;
select set_config('app.quote_purge', '', true);
insert into public.currencies (code, name, decimals) values ('GBP', 'Pound sterling', 2)
on conflict (code) do nothing;

-- Today's TRM (4000) and the ECB's EUR, crossed through it (5000).
set local role service_role;
select set_config('fxq.r1', public.fx_begin_sync_run('trm_co', 'manual', true) ->> 'run_id', true);
select public.fx_record_rates(current_setting('fxq.r1')::bigint, jsonb_build_array(
    jsonb_build_object('currency', 'USD', 'quote_currency', 'COP', 'rate', '4000',
                       'effective_date', current_date, 'valid_until', current_date + 1)));
select public.fx_finish_sync_run(current_setting('fxq.r1')::bigint, true, 1);
select set_config('fxq.r2', public.fx_begin_sync_run('ecb_frankfurter', 'manual', true) ->> 'run_id', true);
select public.fx_record_rates(current_setting('fxq.r2')::bigint, jsonb_build_array(
    jsonb_build_object('currency', 'USD', 'quote_currency', 'EUR', 'rate', '0.8',
                       'effective_date', current_date)));
select public.fx_finish_sync_run(current_setting('fxq.r2')::bigint, true, 1);
reset role;

insert into public.companies (id, name, sales_id, logo) values (9801, 'Cliente Divisas', 9801, '{}'::jsonb);
insert into public.deals (id, name, stage, amount, sales_id, company_id, index)
values (9801, 'Exportacion', 'opportunity', 1, 9801, 9801, 0);

insert into public.quotes (id, company_id, deal_id, sales_id, currency, valid_until) values
  (9801, 9801, 9801, 9801, 'USD', current_date + 10),
  (9802, 9801, null, 9801, 'COP', current_date + 10),
  (9803, 9801, null, 9801, 'USD', current_date + 10),
  (9804, 9801, null, 9801, 'MXN', current_date + 10);

--
-- 1. The rate a draft starts from.
--
select is(
    (select jsonb_build_object('kind', v.rate_kind, 'rate', v.exchange_rate,
                               'provider', v.rate_provider_key, 'base', v.base_currency)
       from public.fxq_version(9801) v),
    '{"kind": "official", "rate": 4000.0000000000, "provider": "trm_co", "base": "COP"}'::jsonb,
    'a USD draft starts at today''s official rate');
select is(
    (select jsonb_build_object('kind', v.rate_kind, 'rate', v.exchange_rate)
       from public.fxq_version(9802) v),
    '{"kind": "base", "rate": 1}'::jsonb,
    'a draft in the base currency is at rate 1');
select is(
    (select jsonb_build_object('kind', v.rate_kind, 'rate', v.exchange_rate)
       from public.fxq_version(9804) v),
    '{"kind": null, "rate": null}'::jsonb,
    'with no rate available the draft has none, rather than a guess');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97910000-0000-0000-0000-000000000001","role":"authenticated"}', true);

--
-- 2. Conversion, as the rep writes the lines.
--
-- The client posts a price it computed itself; the server ignores it.
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxq_version(9801)).id, 'Licencia', 1, 999999, 'COP', 4000000, 1);
select is(
    (select l.unit_price from public.quote_lines l
      where l.version_id = (public.fxq_version(9801)).id and l.position = 1),
    1000.00, 'COP to USD: 4,000,000 COP at 4,000 is 1,000.00 USD, whatever the client posted');

insert into public.quote_lines (version_id, name, quantity, unit_price, discount_percent, tax_rate_percent,
                                source_currency, source_unit_price, position)
values ((public.fxq_version(9801)).id, 'Soporte', 3, 0, 10, 19, 'COP', 2000000, 2);
select is(
    (select array[l.unit_price, l.line_gross, l.line_discount, l.line_tax, l.line_total]
       from public.quote_lines l
      where l.version_id = (public.fxq_version(9801)).id and l.position = 2),
    array[500.00, 1500.00, 150.00, 256.50, 1606.50]::numeric[],
    'converted first, then gross, discount on the gross, and tax on the net');

insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxq_version(9801)).id, 'Repuesto europeo', 1, 0, 'EUR', 100, 3);
select is(
    (select jsonb_build_object('price', l.unit_price, 'source_rate', l.source_exchange_rate)
       from public.quote_lines l
      where l.version_id = (public.fxq_version(9801)).id and l.position = 3),
    '{"price": 125.00, "source_rate": 5000.0000000000}'::jsonb,
    'EUR to USD through the base: 100 x 5,000 / 4,000 = 125.00');

insert into public.quote_lines (version_id, name, quantity, unit_price, position)
values ((public.fxq_version(9801)).id, 'Flete negociado', 1, 0.50, 4);
select is(
    (select jsonb_build_object('price', l.unit_price, 'source', l.source_currency)
       from public.quote_lines l
      where l.version_id = (public.fxq_version(9801)).id and l.position = 4),
    '{"price": 0.50, "source": null}'::jsonb,
    'a price typed by hand is kept as the negotiated figure');

select is(
    (select array[v.subtotal, v.discount_total, v.tax_total, v.total,
                  v.subtotal_base, v.discount_total_base, v.tax_total_base, v.total_base]
       from public.fxq_version(9801) v),
    array[2625.50, 150.00, 256.50, 2732.00,
          10502000, 600000, 1026000, 10928000]::numeric[],
    'the base equivalents are each total times the rate, in whole pesos');

insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxq_version(9802)).id, 'Equipo importado', 1, 0, 'USD', 1000, 1);
select is(
    (select array[v.total, v.total_base] from public.fxq_version(9802) v),
    array[4000000, 4000000]::numeric[],
    'USD to COP: 1,000 USD is 4,000,000 COP, and a base quotation is its own equivalent');

select is(
    public.fxq_test_error_of($$insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price)
                               values ((public.fxq_version(9804)).id, 'X', 1, 0, 'COP', 1000)$$),
    '23514:fx_rate_missing', 'a price cannot be converted into a currency with no rate');

--
-- 3. Custom rates and their gate.
--
select is(
    public.fxq_test_error_of($$select public.set_quote_version_rate((public.fxq_version(9803)).id, 'custom', 2, 'test')$$),
    '42501:fx_custom_rate_forbidden', 'a rep may not set a custom rate while the tolerance is 0');

reset role;
update public.exchange_rate_settings set rep_custom_rate_tolerance_percent = 5 where id = 1;
set local role authenticated;

select is(
    public.fxq_test_error_of($$select public.set_quote_version_rate((public.fxq_version(9803)).id, 'custom', 4300, 'test')$$),
    '23514:fx_custom_rate_out_of_tolerance', 'nor one further than the tolerance from the official rate');
select is(
    public.fxq_test_error_of($$select public.set_quote_version_rate((public.fxq_version(9803)).id, 'custom', 4100, '  ')$$),
    '23514:fx_reason_required', 'a custom rate needs a written reason');
select is(
    (select v.exchange_rate from public.set_quote_version_rate((public.fxq_version(9803)).id, 'custom', 4100, 'Client contract rate') v),
    4100.0000000000::numeric, 'within the tolerance a rep sets it');

reset role;
select set_config('request.jwt.claims',
    '{"sub":"97910000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
    (select jsonb_build_object('kind', v.rate_kind, 'rate', v.exchange_rate, 'set_by', v.rate_set_by)
       from public.set_quote_version_rate((public.fxq_version(9803)).id, 'custom', 2, 'Rounding test') v),
    '{"kind": "custom", "rate": 2.0000000000, "set_by": 9802}'::jsonb,
    'a manager sets any custom rate, signed by the session');

insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxq_version(9803)).id, 'Medio centavo', 1, 0, 'COP', 0.01, 1),
       ((public.fxq_version(9803)).id, 'Medio centavo 2', 1, 0, 'COP', 0.03, 2);
select is(
    (select array_agg(l.unit_price order by l.position) from public.quote_lines l
      where l.version_id = (public.fxq_version(9803)).id),
    array[0.01, 0.02]::numeric[],
    'a half cent rounds away from zero (0.005 -> 0.01, 0.015 -> 0.02)');
select is(
    (select count(*)::int from public.exchange_rate_audit_logs a
      where a.entity = 'quote_version' and a.entity_key = (public.fxq_version(9803)).id::text),
    2, 'every rate change of a quotation is audited');

--
-- 4. Issue freezes the rate.
--
reset role;
select set_config('request.jwt.claims',
    '{"sub":"97910000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select public.issue_quote_version(9801);
select is(
    (select d.amount from public.deals d where d.id = 9801),
    10928000::bigint, 'the deal''s amount is the base equivalent of the version sent');

-- The TRM moves: a manual official rate for today, which now wins.
reset role;
select set_config('request.jwt.claims',
    '{"sub":"97910000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, note)
values ('USD', 'COP', 4500, 'official', current_date, 'Corrected TRM');
select is((select r.rate from public.fx_resolve_rate('USD', 'official') r), 4500.0000000000::numeric,
    'the rate in force is now 4,500');

select is(
    (select array[v.exchange_rate, v.total, v.total_base]
       from public.quote_versions v where v.quote_id = 9801 and v.version_number = 1),
    array[4000, 2732.00, 10928000]::numeric[],
    'the issued version keeps its rate and its equivalent');
reset role;
select is(
    (select jsonb_build_object('rate', d -> 'exchange' -> 'rate', 'total_base', d -> 'exchange' -> 'total_base',
                               'kind', d -> 'exchange' ->> 'rate_kind', 'total', d -> 'totals' -> 'total')
       from (select public.quote_portal_document(
                 (select v.id from public.quote_versions v where v.quote_id = 9801 and v.version_number = 1)) as d) x),
    '{"rate": 4000.0000000000, "total_base": 10928000, "kind": "official", "total": 2732.00}'::jsonb,
    'the customer''s document carries the frozen rate and equivalent, and the USD total');
set local role authenticated;
select is(
    public.fxq_test_error_of($$select public.set_quote_version_rate(
        (select v.id from public.quote_versions v where v.quote_id = 9801 and v.version_number = 1), 'official')$$),
    '23514:quote_version_frozen', 'an issued version''s rate cannot be changed');

reset role;
select set_config('request.jwt.claims',
    '{"sub":"97910000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select public.revise_quote(9801, 'Customer asked for a new volume');
select is(
    (select array[v.exchange_rate, v.total_base] from public.fxq_version(9801) v),
    array[4000, 10928000]::numeric[],
    'a revision starts from the rate the customer last saw');
select is(
    (select array[v.exchange_rate, v.total]
       from public.set_quote_version_rate((public.fxq_version(9801)).id, 'official') v),
    array[4500, 2428.49]::numeric[],
    'refreshing the revision''s rate re-prices every converted line, and only those');
select is(
    (select l.unit_price from public.quote_lines l
      where l.version_id = (public.fxq_version(9801)).id and l.position = 1),
    888.89, '4,000,000 COP at 4,500 is 888.89 USD');
select is(
    (select l.unit_price from public.quote_lines l
      where l.version_id = (public.fxq_version(9801)).id and l.position = 4),
    0.50, 'the negotiated line is untouched by a new rate');

--
-- 5. What cannot be issued.
--
insert into public.quote_lines (version_id, name, quantity, unit_price)
values ((public.fxq_version(9804)).id, 'Manual', 1, 10);
select is(
    public.fxq_test_error_of($$select public.issue_quote_version(9804)$$),
    '23514:fx_rate_missing', 'a quotation with no rate cannot be issued');

reset role;
select set_config('request.jwt.claims',
    '{"sub":"97910000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, note)
values ('GBP', 'COP', 5200, 'official', current_date - 10, 'Old reference');
insert into public.quotes (id, company_id, sales_id, currency, valid_until)
values (9805, 9801, 9802, 'GBP', current_date + 10);
insert into public.quote_lines (version_id, name, quantity, unit_price)
values ((public.fxq_version(9805)).id, 'Manual', 1, 10);
select is(
    (select v.rate_effective_date = current_date - 10 from public.fxq_version(9805) v),
    true, 'the draft took the only GBP rate there is, with its own date');
select is(
    public.fxq_test_error_of($$select public.issue_quote_version(9805)$$),
    '23514:fx_rate_stale', 'a stale official rate is never sent to a customer');
select is(
    public.fxq_test_error_of($$select public.set_quote_version_rate((public.fxq_version(9805)).id, 'base')$$),
    '23514:fx_rate_kind_invalid', 'a foreign quotation cannot claim the base rate');
select is(
    (select v.base_currency from public.quotes_summary v where v.id = 9801),
    'COP', 'the quotes summary carries the base equivalent''s currency');

select * from finish();
rollback;
