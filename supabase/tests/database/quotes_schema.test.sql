--
-- Quotes module, data model (docs/proposals/quotes-cpq-module.md §2).
--
-- The claims this file defends are the ones no screen can show:
--
--   * the arithmetic is the server's. Line amounts are generated columns and
--     version totals follow the lines, rounded per line and then summed -- a
--     total computed any other way contradicts its own visible breakdown;
--   * the illegal rows are unrepresentable rather than merely discouraged: a
--     line pairing one quote's version with another quote, a version or price
--     list in the wrong currency, a second draft, a forged customer comment;
--   * a quote is born a draft with version 1 ready to edit, whatever the insert
--     said.
--
begin;

select plan(31);

-- Runs a statement and reports how it failed, as `sqlstate[:detail]`, or
-- 'no error'. `detail` carries the stable key the module's functions raise
-- (`quote_version_frozen`, ...), which throws_ok cannot see.
create function public.quotes_test_error_of(p_sql text) returns text
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
  ('97110000-0000-0000-0000-000000000001', 'quotes.schema@test.local',
   '{"first_name":"Sara","last_name":"Schema"}'::jsonb);
update public.sales set id = 9711, role = 'rep'
 where user_id = '97110000-0000-0000-0000-000000000001';

-- `logo` set so the favicon trigger returns before reaching the network.
insert into public.companies (id, name, sales_id, logo)
values (9711, 'Acme Andina', 9711, '{}'::jsonb);

insert into public.price_lists (id, code, name, currency)
values (9711, 'TST-9711-COP', 'Lista COP de prueba', 'COP');

--
-- 1. What was installed.
--
select ok(
    exists (select 1 from pg_extension where extname = 'pgcrypto'),
    'pgcrypto is installed, so issuing can mint portal tokens');

select is(
    (select count(*)::int from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
        and table_name in ('tax_rates', 'quote_statuses', 'quote_transitions',
            'products', 'product_events', 'price_lists', 'price_list_items',
            'quotes', 'quote_versions', 'quote_lines', 'quote_comments',
            'quote_access_tokens', 'quote_status_changes',
            'quote_portal_events', 'quote_discount_rules')),
    15,
    'all fifteen quote-module tables exist');

select is(
    (select count(*)::int from public.quote_statuses
      where is_system and key in ('draft', 'pending_approval', 'approved', 'sent',
            'viewed', 'under_review', 'negotiating', 'accepted', 'rejected',
            'expired', 'canceled')),
    11,
    'the eleven system statuses are seeded');

select ok(
    (select counts_as_won and is_terminal and not is_open
       from public.quote_statuses where key = 'accepted'),
    'accepted is the terminal status that counts as won');

select is(
    (select code::text from public.tax_rates where is_default and active),
    'iva_19',
    'IVA 19% is the one default tax rate');

select is(
    (select array_agg(rate order by code) from public.tax_rates
      where code in ('exento', 'excluido')),
    array[0.000, 0.000]::numeric[],
    'exento and excluido are two zero-rate rows, because they are legally distinct');

--
-- 2. A quote is born a draft, with its first version.
--
-- The insert asks for 'accepted' on purpose: the status guard only watches
-- UPDATE, so an insert is the one path that could skip the machine.
insert into public.quotes (id, company_id, sales_id, currency, status_key)
values (9711, 9711, 9711, 'COP', 'accepted');

select matches(
    (select quote_number from public.quotes where id = 9711),
    '^Q-[0-9]{4}-[0-9]{5}$',
    'a quote gets its document number from the sequence');

select is(
    (select status_key from public.quotes where id = 9711),
    'draft',
    'a quote is born a draft whatever the insert asked for');

select is(
    (select array_agg(version_number::int || ':' || (issued_at is null)::text)
       from public.quote_versions where quote_id = 9711),
    array['1:true'],
    'creating a quote seeds version 1 as the editable draft');

select is(
    (select currency::text from public.quote_versions where quote_id = 9711),
    'COP',
    'the version inherits the quote currency instead of having it posted');

--
-- 3. The arithmetic belongs to the server (D8).
--
insert into public.quote_lines
    (version_id, name, quantity, unit_price, discount_percent, tax_rate_percent, "position")
select v.id, 'Licencia anual', 3, 1000.00, 10, 19, 1
  from public.quote_versions v where v.quote_id = 9711;

insert into public.quote_lines
    (version_id, name, quantity, unit_price, discount_percent, tax_rate_percent, "position")
select v.id, 'Horas de soporte', 1.5, 333.33, 0, 19, 2
  from public.quote_versions v where v.quote_id = 9711;

select is(
    (select array[line_gross, line_discount, line_tax, line_total]
       from public.quote_lines
      where quote_id = 9711 and "position" = 1),
    array[3000.00, 300.00, 513.00, 3213.00]::numeric[],
    'a line computes gross, discount, tax and total in generated columns');

select is(
    (select array_agg(distinct l.quote_id)
       from public.quote_lines l
       join public.quote_versions v on v.id = l.version_id
      where v.quote_id = 9711),
    array[9711::bigint],
    'a line gets its quote carrier from its version, not from the request');

select is(
    (select line_gross from public.quote_lines
      where quote_id = 9711 and "position" = 2),
    500.00::numeric,
    '1.5 x 333.33 = 499.995 rounds to 500.00 on the line');

select is(
    (select array[subtotal, discount_total, tax_total, total]
       from public.quote_versions where quote_id = 9711),
    array[3500.00, 300.00, 608.00, 3808.00]::numeric[],
    'the version totals are the sum of the visible line amounts');

delete from public.quote_lines where quote_id = 9711 and "position" = 2;

select is(
    (select total from public.quote_versions where quote_id = 9711),
    3213.00::numeric,
    'removing a line recomputes the version total');

-- Three lines of 0.03 at 19%: 0.0057 each rounds to 0.01, so the document shows
-- 0.03 of tax. Summing first would give 0.0171 -> 0.02, a total that disagrees
-- with its own lines.
insert into public.quotes (id, company_id, sales_id, currency)
values (9712, 9711, 9711, 'COP');

insert into public.quote_lines (version_id, name, quantity, unit_price, tax_rate_percent, "position")
select v.id, 'Pieza ' || g, 1, 0.03, 19, g
  from public.quote_versions v cross join generate_series(1, 3) as g
 where v.quote_id = 9712;

select is(
    (select tax_total from public.quote_versions where quote_id = 9712),
    0.03::numeric,
    'tax is rounded per line and then summed (0.03), never summed and rounded once (0.02)');

--
-- 4. The rows that must not be representable.
--
select matches(
    public.quotes_test_error_of(format(
        $$insert into public.quote_lines (version_id, quote_id, name, quantity, unit_price)
          values (%s, 9712, 'Cruzada', 1, 1)$$,
        (select id from public.quote_versions where quote_id = 9711))),
    '^23503',
    'a line cannot pair one quote''s version with another quote');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quote_versions (quote_id, currency, version_number, issued_at, issued_by)
          values (9711, 'USD', 7, now(), 9711)$$),
    '^23503',
    'a version cannot carry a currency its quote does not');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quotes (company_id, sales_id, currency, price_list_id)
          values (9711, 9711, 'USD', 9711)$$),
    '^23503',
    'a quote cannot be priced from a list in another currency');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quote_versions (quote_id, version_number) values (9711, 2)$$),
    '^23505',
    'a quote has at most one editable draft');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quote_comments (quote_id, author_kind, author_sales_id, author_name, visibility, body)
          values (9711, 'customer', 9711, 'Cliente', 'shared', 'Hola')$$),
    '^23514',
    'a customer comment attributed to a sales row is unrepresentable');

select matches(
    public.quotes_test_error_of(
        $$insert into public.quote_comments (quote_id, author_kind, author_name, visibility, body)
          values (9711, 'customer', 'Cliente', 'internal', 'Hola')$$),
    '^23514',
    'a customer comment hidden from its own author is unrepresentable');

insert into public.products (sku, name, currency)
values ('TST-9711-A', 'Producto de prueba', 'COP');

select matches(
    public.quotes_test_error_of(
        $$insert into public.products (sku, name, currency) values ('tst-9711-a', 'Duplicado', 'COP')$$),
    '^23505',
    'SKUs are unique regardless of case');

select matches(
    public.quotes_test_error_of(
        $$insert into public.products (sku, name) values ('TST-9711-B', 'Sin moneda')$$),
    '^23502',
    'a product states its currency; there is no silent default');

insert into public.price_lists (code, name, currency, is_default)
values ('TST-9711-DEF-A', 'Default A', 'CLP', true);

select matches(
    public.quotes_test_error_of(
        $$insert into public.price_lists (code, name, currency, is_default)
          values ('TST-9711-DEF-B', 'Default B', 'CLP', true)$$),
    '^23505',
    'a currency has at most one active default price list');

--
-- 5. The line snapshot is the server's (§13.6 #10).
--
-- The line IS the record (D6), so every snapshot column has to be filled by the
-- time the row lands. Until Phase 4 the client copied them, and a line posted
-- with a `tax_rate_id` and no percentage was taxed at 0% -- silently, because
-- the column defaulted to zero.
--
insert into public.tax_rates (id, code, label, rate, rank)
values (9711, 'tst_9711_19', 'IVA 9711', 19, 971), (9712, 'tst_9711_0', 'Exento 9711', 0, 972);

insert into public.products (id, sku, name, unit, list_price, currency, tax_rate_id)
values (9711, 'TST-9711-SNAP', 'Producto con IVA', 'hour', 100.00, 'COP', 9711);

-- Everything omitted but the product: the shape the line editor posts.
insert into public.quote_lines (version_id, product_id, quantity, unit_price, "position")
select v.id, 9711, 2, 100.00, 11
  from public.quote_versions v where v.quote_id = 9711;

select is(
    (select array[sku, name, unit, tax_rate_id::text, tax_rate_percent::text]
       from public.quote_lines where version_id = (
         select id from public.quote_versions where quote_id = 9711) and "position" = 11),
    array['TST-9711-SNAP', 'Producto con IVA', 'hour', '9711', '19.00'],
    'a line takes its sku, name, unit and tax rate from the product it was picked from');

select is(
    (select line_tax from public.quote_lines
      where version_id = (select id from public.quote_versions where quote_id = 9711)
        and "position" = 11),
    38.00::numeric,
    'the derived rate reaches the arithmetic: 200 at 19% is 38, not 0');

-- The negotiated line: its own name, and a rate that is not the product's.
insert into public.quote_lines
    (version_id, product_id, sku, name, unit, quantity, unit_price, tax_rate_id, "position")
select v.id, 9711, 'NEGOCIADO', 'Bolsa de horas negociada', 'day', 1, 50.00, 9712, 12
  from public.quote_versions v where v.quote_id = 9711;

select is(
    (select array[sku, name, unit, tax_rate_percent::text]
       from public.quote_lines where version_id = (
         select id from public.quote_versions where quote_id = 9711) and "position" = 12),
    array['NEGOCIADO', 'Bolsa de horas negociada', 'day', '0.00'],
    'what the client states is never overwritten by the catalogue');

-- An explicit 0% on a product that carries IVA: a deliberate exemption, and the
-- provenance must not contradict it.
insert into public.quote_lines
    (version_id, product_id, quantity, unit_price, tax_rate_percent, "position")
select v.id, 9711, 1, 10.00, 0, 13
  from public.quote_versions v where v.quote_id = 9711;

select is(
    (select array[coalesce(tax_rate_id::text, 'null'), tax_rate_percent::text]
       from public.quote_lines where version_id = (
         select id from public.quote_versions where quote_id = 9711) and "position" = 13),
    array['null', '0.00'],
    'a line quoted at 0% does not inherit the product tax rate as its provenance');

-- No product, no rate, no percentage: the pre-Phase-4 shape, still 0%.
insert into public.quote_lines (version_id, name, quantity, unit_price, "position")
select v.id, 'Concepto libre', 1, 10.00, 14
  from public.quote_versions v where v.quote_id = 9711;

select is(
    (select tax_rate_percent from public.quote_lines
      where version_id = (select id from public.quote_versions where quote_id = 9711)
        and "position" = 14),
    0.00::numeric,
    'a line naming neither a rate nor a percentage is still untaxed');

-- A quantity with three decimals against a two-decimal price lands exactly on
-- half a cent: 1.005 rounds AWAY FROM ZERO to 1.01. The browser preview has to
-- agree (quotes/quoteMath.ts), and naive floating point does not -- `1.005 * 100`
-- is 100.49999999999999, which rounds the half down to 1.00.
insert into public.quote_lines
    (version_id, name, quantity, unit_price, tax_rate_percent, "position")
select v.id, 'Media unidad de cuenta', 1.005, 1.00, 19, 15
  from public.quote_versions v where v.quote_id = 9711;

select is(
    (select array[line_gross, line_discount, line_tax, line_total]
       from public.quote_lines
      where version_id = (select id from public.quote_versions where quote_id = 9711)
        and "position" = 15),
    array[1.01, 0.00, 0.19, 1.20]::numeric[],
    'a half cent rounds away from zero, as round(numeric, 2) does');

select * from finish();
rollback;
