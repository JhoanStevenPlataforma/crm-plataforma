--
-- Currencies & exchange rates: the rates a quotation's LINES are converted at
-- (docs/proposals/multi-currency-fx.md §4, 2026-10-02 corrections).
--
--   * one observation per source currency per version, recorded on the line
--     (`source_exchange_rate_id`), so a document never mixes two TRMs;
--   * a cross conversion pairs observations of the version's rate day, never a
--     later one; with none on or before it, the line is refused;
--   * a quotation in the base currency can refresh the rates its lines were
--     converted at, and only while it is a draft;
--   * one staleness rule (`fx_rate_is_stale()`) for the resolver, the view and
--     the issue gate, applied to the version's rate AND to every line's;
--   * the rate a line converts at is the server's: a client cannot post one;
--   * the preview function returns exactly what a line will be stored at, and
--     only for a version the caller can read.
--
-- Everything that can raise, or touches an object the correction added, runs
-- through `fxs_err()` / `fxs_val()` (dynamic SQL), so that against an
-- uncorrected schema each check fails as an assertion instead of aborting the
-- file -- which is how this file was shown to fail before the fix.
--
begin;

select plan(27);

create function public.fxs_err(p_sql text) returns text
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

-- The first column of the first row of a statement, as text; the error otherwise.
create function public.fxs_val(p_sql text) returns text
    language plpgsql
as $$
declare
    v_out text;
begin
    execute p_sql into v_out;
    return v_out;
exception when others then
    return 'ERROR ' || sqlstate || ': ' || sqlerrm;
end;
$$;

create function public.fxs_version(p_quote_id bigint) returns public.quote_versions
    language sql stable security definer
    set search_path to ''
as $$
    select v.* from public.quote_versions v
     where v.quote_id = p_quote_id order by v.version_number desc limit 1;
$$;

create function public.fxs_load(p_key text, p_items jsonb) returns void
    language plpgsql
as $$
declare
    v_run bigint;
begin
    v_run := (public.fx_begin_sync_run(p_key, 'manual', true) ->> 'run_id')::bigint;
    perform public.fx_record_rates(v_run, p_items);
    perform public.fx_finish_sync_run(v_run, true, 1);
end;
$$;

-- A version's rate set on an earlier day: time cannot move inside one
-- transaction, so the row is written the way `set_quote_version_rate()`
-- wrote it then.
create function public.fxs_backdate_version(p_quote_id bigint, p_days integer) returns void
    language plpgsql
as $$
declare
    v_id bigint := (public.fxs_version(p_quote_id)).id;
begin
    perform set_config('app.quote_version_system_write', v_id::text, true);
    update public.quote_versions
       set rate_set_at = rate_set_at - make_interval(days => p_days)
     where id = v_id;
    perform set_config('app.quote_version_system_write', '', true);
end;
$$;

grant execute on function public.fxs_err(text), public.fxs_val(text), public.fxs_version(bigint)
    to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('97930000-0000-0000-0000-000000000001', 'fxs.rep@test.local', '{"first_name":"Raul","last_name":"Rep"}'::jsonb),
  ('97930000-0000-0000-0000-000000000002', 'fxs.mgr@test.local', '{"first_name":"Marta","last_name":"Manager"}'::jsonb);
update public.sales set id = 9821, role = 'rep'     where user_id = '97930000-0000-0000-0000-000000000001';
update public.sales set id = 9822, role = 'manager' where user_id = '97930000-0000-0000-0000-000000000002';

update public.quote_discount_rules set enforced_from = null where enforced_from is not null;
update public.exchange_rate_settings
   set quote_rate_kind_default = 'official', stale_after_days = 3,
       rep_custom_rate_tolerance_percent = 0
 where id = 1;
select set_config('app.quote_purge', 'on', true);
delete from public.exchange_rate_sync_runs where id is not null;
delete from public.exchange_rates where id is not null;
select set_config('app.quote_purge', '', true);

insert into public.companies (id, name, sales_id, logo) values (9821, 'Cliente Lineas FX', 9822, '{}'::jsonb);

--
-- Yesterday: TRM 3300 (valid yesterday only), ECB 0.90 EUR per USD.
-- Quotation 9821 is in the base (COP), priced from a USD list: line A.
-- Quotation 9822 is in USD, its rate set yesterday.
--
select public.fxs_load('trm_co', jsonb_build_array(jsonb_build_object(
    'currency','USD','quote_currency','COP','rate','3300',
    'effective_date', current_date - 1, 'valid_until', current_date - 1)));
select public.fxs_load('ecb_frankfurter', jsonb_build_array(jsonb_build_object(
    'currency','USD','quote_currency','EUR','rate','0.90','effective_date', current_date - 1)));

select set_config('request.jwt.claims', '{"sub":"97930000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
insert into public.quotes (id, company_id, sales_id, currency, valid_until) values
  (9821, 9821, 9822, 'COP', current_date + 10),
  (9822, 9821, 9822, 'USD', current_date + 10);
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxs_version(9821)).id, 'Linea A', 1, 0, 'USD', 1000, 1);
reset role;
select public.fxs_backdate_version(9822, 1);

-- Today: TRM 3400, ECB 0.88.
select public.fxs_load('trm_co', jsonb_build_array(jsonb_build_object(
    'currency','USD','quote_currency','COP','rate','3400',
    'effective_date', current_date, 'valid_until', current_date)));
select public.fxs_load('ecb_frankfurter', jsonb_build_array(jsonb_build_object(
    'currency','USD','quote_currency','EUR','rate','0.88','effective_date', current_date)));

--
-- 1. A quotation in the base currency, priced from a USD list.
--
set local role authenticated;
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxs_version(9821)).id, 'Linea B', 1, 0, 'USD', 1000, 2);

select is(
    (select array_agg(l.unit_price order by l.position) from public.quote_lines l
      where l.version_id = (public.fxs_version(9821)).id),
    array[3300000.00, 3300000.00]::numeric[],
    'one observation per source currency: line B reuses the TRM line A was converted at');
select is(
    public.fxs_val($$select count(distinct l.source_exchange_rate_id)::text || ':' ||
                            bool_and(l.source_exchange_rate_id is not null)::text
                       from public.quote_lines l where l.version_id = (public.fxs_version(9821)).id$$),
    '1:true',
    'and the line records WHICH observation that is');
select is(
    public.fxs_err('select public.issue_quote_version(9821)'),
    '23514:fx_rate_stale',
    'a base quotation whose lines carry a TRM no longer in force is not issued');
-- Called in its own statement: a read in the same statement would see the
-- snapshot taken before the call.
select public.fxs_err($$select public.set_quote_version_rate((public.fxs_version(9821)).id, 'base')$$);
select is(
    (select array_agg(l.unit_price order by l.position) from public.quote_lines l
      where l.version_id = (public.fxs_version(9821)).id),
    array[3400000.00, 3400000.00]::numeric[],
    'set_quote_version_rate(base) re-prices the lines at today''s TRM');
select is(
    (select v.total from public.fxs_version(9821) v),
    6800000.00::numeric,
    'and the totals follow');
reset role;
select is(
    (select count(*)::int from public.exchange_rate_audit_logs a
      where a.entity = 'quote_version' and a.entity_key = (public.fxs_version(9821)).id::text),
    1, 'the re-pricing of a base quotation is audited');
set local role authenticated;
select is(
    public.fxs_err('select public.issue_quote_version(9821)'),
    'no error', 'once refreshed it is issued');
select is(
    public.fxs_err($$select public.set_quote_version_rate(
        (select v.id from public.quote_versions v where v.quote_id = 9821 and v.version_number = 1), 'base')$$),
    '23514:quote_version_frozen',
    'an issued base quotation cannot be re-priced');
select is(
    public.fxs_err($$update public.quote_lines set source_exchange_rate = 1
                      where version_id = (select v.id from public.quote_versions v where v.quote_id = 9821 and v.version_number = 1)$$),
    '23514:quote_version_frozen',
    'nor can the lines of an issued version be touched');
reset role;
select is(
    (select public.quote_portal_document(v.id) -> 'exchange'
       from public.quote_versions v where v.quote_id = 9821 and v.version_number = 1),
    'null'::jsonb,
    'the customer''s document in the base currency still prints no rate block');

--
-- 2. A cross conversion pairs observations of the version's rate day.
--
set local role authenticated;
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxs_version(9822)).id, 'Repuesto EUR', 1, 0, 'EUR', 100, 1);
select is(
    (select l.unit_price from public.quote_lines l where l.version_id = (public.fxs_version(9822)).id),
    111.11::numeric,
    'EUR of the version''s day over USD of the version''s day: 100 x 3666.67 / 3300 = 111.11, not 117.08');
select is(
    public.fxs_err('select public.issue_quote_version(9822)'),
    '23514:fx_rate_stale',
    'a USD rate past its validity is stale for the issue gate too (one rule)');
select is(
    public.fxs_val($$select v.total::text from public.set_quote_version_rate((public.fxs_version(9822)).id, 'official') v$$),
    '113.64',
    'refreshing moves the version AND its EUR line to today''s observations: 100 x 3863.64 / 3400');
reset role;

--
-- 3. One staleness rule.
--
select is(
    public.fxs_val($$select array[
        public.fx_rate_is_stale('official',   current_date - 1, current_date - 1),
        public.fx_rate_is_stale('official',   current_date - 2, current_date),
        public.fx_rate_is_stale('official',   current_date - 3, null),
        public.fx_rate_is_stale('official',   current_date - 4, null),
        public.fx_rate_is_stale('commercial', current_date - 5, current_date - 1),
        public.fx_rate_is_stale('commercial', current_date - 50, null),
        public.fx_rate_is_stale('custom',     current_date - 50, null),
        public.fx_rate_is_stale('base',       current_date - 50, null)]::text$$),
    '{t,f,f,t,t,f,f,f}',
    'official: past its validity, or older than stale_after_days without one; commercial: past its expiry; custom and base never');
select is(
    public.fxs_val($$select bool_and(r.is_stale = public.fx_rate_is_stale('official', r.effective_date, r.valid_until, d.on_day))::text
                       from (values (current_date), (current_date - 1), (current_date + 2), (current_date + 5)) d(on_day)
                       cross join lateral public.fx_resolve_rate('EUR', 'official', d.on_day) r$$),
    'true',
    'the resolver reports staleness by the same rule, on any day');
select is(
    (select count(*)::int from public.fx_resolve_rate('EUR', 'official', current_date - 30)),
    0,
    'with no observation on or before a day the resolver returns none, never a later one');

--
-- 4. A line's own rate is checked at issue, whatever the quotation's currency.
--
select public.fxs_load('trm_co', jsonb_build_array(jsonb_build_object(
    'currency','USD','quote_currency','COP','rate','3350',
    'effective_date', current_date - 7, 'valid_until', current_date - 7)));
select public.fxs_load('ecb_frankfurter', jsonb_build_array(jsonb_build_object(
    'currency','USD','quote_currency','MXN','rate','18.2','effective_date', current_date - 7)));

set local role authenticated;
insert into public.quotes (id, company_id, sales_id, currency, valid_until) values
  (9823, 9821, 9822, 'USD', current_date + 10),
  (9824, 9821, 9822, 'USD', current_date + 10);
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxs_version(9823)).id, 'MXN de hace una semana', 1, 0, 'MXN', 100, 1);
select is(
    public.fxs_err('select public.issue_quote_version(9823)'),
    '23514:fx_rate_stale',
    'a fresh USD rate does not carry a line converted at a week-old MXN rate');
reset role;

select set_config('app.quote_version_system_write', (public.fxs_version(9824)).id::text, true);
update public.quote_versions set rate_effective_date = current_date - 30
 where id = (public.fxs_version(9824)).id;
select set_config('app.quote_version_system_write', '', true);
set local role authenticated;
select is(
    public.fxs_err($$insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price)
                     values ((public.fxs_version(9824)).id, 'X', 1, 0, 'EUR', 100)$$),
    '23514:fx_rate_missing',
    'with no EUR observation on or before the version''s rate day the line is refused');
reset role;

--
-- 5. The rate a line converts at is the server's.
--
select set_config('request.jwt.claims', '{"sub":"97930000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
insert into public.quotes (id, company_id, sales_id, currency, valid_until)
values (9825, 9821, 9821, 'USD', current_date + 10);
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, source_exchange_rate, position)
values ((public.fxs_version(9825)).id, 'EUR forjada', 1, 0, 'EUR', 100, 1, 1);
select is(
    (select l.unit_price from public.quote_lines l
      where l.version_id = (public.fxs_version(9825)).id and l.position = 1),
    (select public.fx_round(100 * r.rate / v.exchange_rate, 'USD')
       from public.fxs_version(9825) v,
            public.fx_resolve_rate('EUR', 'official', v.rate_effective_date) r),
    'a rep cannot post the rate a line is converted at: it is priced at the server''s observation');
update public.quote_lines set source_exchange_rate = 1
 where version_id = (public.fxs_version(9825)).id and position = 1;
select isnt(
    (select l.source_exchange_rate from public.quote_lines l
      where l.version_id = (public.fxs_version(9825)).id and l.position = 1),
    1.0000000000::numeric,
    'nor overwrite it afterwards');
select is(
    public.fxs_val($$update public.quote_lines set quantity = 2, source_exchange_rate_id = null
                      where version_id = (public.fxs_version(9825)).id and position = 1
                      returning (source_exchange_rate_id is not null)::text$$),
    'true',
    'nor detach the observation it was converted at');
select is(
    public.fxs_val($$select count(*)::text from public.fx_line_source_rate((public.fxs_version(9821)).id, 'USD') r$$),
    '0',
    'the preview answers through RLS: a rep reads nothing of a quotation that is not theirs');
reset role;

--
-- 6. A revision keeps its lines' observations; a new line of the same
--    currency reuses them.
--
select set_config('request.jwt.claims', '{"sub":"97930000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(public.fxs_err($$select public.revise_quote(9821, 'Nuevo volumen')$$), 'no error', 'the base quotation is revised');
select is(
    public.fxs_val($$select (count(distinct l.source_exchange_rate_id) = 1
                             and bool_and(l.source_exchange_rate = 3400))::text
                       from public.quote_lines l where l.version_id = (public.fxs_version(9821)).id$$),
    'true',
    'a revision copies the rate AND the observation of every line');
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxs_version(9821)).id, 'Linea C', 1, 0, 'USD', 10, 3);
select is(
    (select l.unit_price from public.quote_lines l
      where l.version_id = (public.fxs_version(9821)).id and l.position = 3),
    34000.00::numeric,
    'and a new USD line in the revision is converted at the same observation');
reset role;

--
-- 7. The preview is the stored figure (custom version, default commercial).
--
update public.exchange_rate_settings set quote_rate_kind_default = 'commercial' where id = 1;
set local role authenticated;
insert into public.exchange_rates (currency_code, base_currency_code, rate, kind, effective_date, valid_until, note) values
  ('USD','COP', 4000, 'official',   current_date, current_date,      'USD official'),
  ('EUR','COP', 3700, 'official',   current_date, null,              'EUR official'),
  ('EUR','COP', 3800, 'commercial', current_date, current_date + 30, 'EUR commercial');
insert into public.quotes (id, company_id, sales_id, currency, valid_until)
values (9826, 9821, 9822, 'USD', current_date + 10);
select public.set_quote_version_rate((public.fxs_version(9826)).id, 'custom', 4100, 'Negociada');
select is(
    public.fxs_val($$select r.rate::text from public.fx_line_source_rate((public.fxs_version(9826)).id, 'EUR') r$$),
    '3800.0000000000',
    'the preview resolves the commercial EUR rate a custom version converts at');
insert into public.quote_lines (version_id, name, quantity, unit_price, source_currency, source_unit_price, position)
values ((public.fxs_version(9826)).id, 'Repuesto EUR', 1, 0, 'EUR', 100, 1);
select is(
    (select l.unit_price from public.quote_lines l where l.version_id = (public.fxs_version(9826)).id),
    92.68::numeric,
    'and the line is stored at exactly that: 100 x 3800 / 4100');
reset role;

select * from finish();
rollback;
