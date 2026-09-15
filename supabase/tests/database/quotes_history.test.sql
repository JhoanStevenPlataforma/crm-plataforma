--
-- Quotes module, the audit trail (docs/proposals/quotes-cpq-module.md §5).
--
-- An audit trail somebody can edit answers no question worth asking. The quote
-- history, the portal events and the catalogue history each get the double
-- blindfold `deal_stage_changes` already has, plus a trigger:
--
--   * no write privilege for users AND no write policy -- both, because an
--     UPDATE or DELETE matching no row succeeds silently and TRUNCATE ignores
--     row level security;
--   * a trigger that refuses the mutation even to the table owner;
--   * the catalogue history actually records what changed.
--
begin;

select plan(13);

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
  ('97660000-0000-0000-0000-000000000001', 'quotes.history@test.local', '{"first_name":"Hugo","last_name":"History"}'::jsonb);
update public.sales set id = 9761, role = 'rep'
 where user_id = '97660000-0000-0000-0000-000000000001';

insert into public.companies (id, name, sales_id, logo)
values (9761, 'Cliente Historial', 9761, '{}'::jsonb);

insert into public.quotes (id, company_id, sales_id, currency)
values (9761, 9761, 9761, 'COP');

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Linea', 1, 100 from public.quote_versions v where v.quote_id = 9761;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97660000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.issue_quote_version(9761);
reset role;

-- What the portal function will write in Phase 7, written directly here.
insert into public.quote_portal_events (quote_id, event_type, ip_address, user_agent, seq)
values (9761, 'viewed', '203.0.113.9', 'pgTAP', 1);

insert into public.products (id, sku, name, currency, list_price)
values (9761, 'TST-9761', 'Producto auditado', 'COP', 100);
update public.products set list_price = 120 where id = 9761;
update public.products set is_active = false where id = 9761;

--
-- 1. Nobody holds the privilege, and no policy would grant it.
--
select is(
    (select coalesce(array_agg(t || ':' || p order by t, p), '{}')
       from unnest(array['quote_status_changes', 'quote_portal_events', 'product_events']) as t
      cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p
      where has_table_privilege('authenticated', 'public.' || t, p)),
    '{}'::text[],
    'users hold no write privilege on any history table');

select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public'
        and tablename in ('quote_status_changes', 'quote_portal_events', 'product_events')
        and cmd <> 'SELECT'),
    0,
    'no write policy exists on any history table either');

select is(
    (select string_agg(from_status || '>' || to_status || '#' || seq, ',' order by seq)
       from public.quote_status_changes where quote_id = 9761),
    'draft>sent#1',
    'issuing leaves exactly one row on the trail');

--
-- 2. The trigger refuses even the table owner.
--
select is(
    public.quotes_test_error_of($$update public.quote_status_changes set reason = 'reescrito' where quote_id = 9761$$),
    '42501',
    'a status change cannot be rewritten');

select is(
    public.quotes_test_error_of($$delete from public.quote_status_changes where quote_id = 9761$$),
    '42501',
    'a status change cannot be deleted');

select is(
    public.quotes_test_error_of($$update public.quote_portal_events set ip_address = '198.51.100.1' where quote_id = 9761$$),
    '42501',
    'where the customer acted from cannot be rewritten');

select is(
    public.quotes_test_error_of($$delete from public.quote_portal_events where quote_id = 9761$$),
    '42501',
    'a portal event cannot be deleted');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97660000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$update public.quote_status_changes set reason = 'mi version'$$),
    '42501',
    'a user''s rewrite is refused outright instead of silently matching no row');

reset role;

--
-- 3. Catalogue history.
--
select is(
    (select array_agg(event_type order by id) from public.product_events where product_id = 9761),
    array['product.created', 'product.updated', 'product.deactivated'],
    'creating, repricing and retiring a product are all on its history');

select is(
    (select field || ':' || (old_value #>> '{}') || '>' || (new_value #>> '{}')
       from public.product_events
      where product_id = 9761 and event_type = 'product.updated'),
    'list_price:100.00>120.00',
    'a price change records the field and both values');

select is(
    public.quotes_test_error_of($$delete from public.product_events where product_id = 9761$$),
    '42501',
    'catalogue history is append-only too');

--
-- 4. Row level security is on everywhere, and the token table has no policy.
--
select is(
    (select coalesce(array_agg(relname::text order by relname), '{}')
       from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('tax_rates', 'quote_statuses', 'quote_transitions', 'products',
            'product_events', 'price_lists', 'price_list_items', 'quotes',
            'quote_versions', 'quote_lines', 'quote_comments', 'quote_access_tokens',
            'quote_status_changes', 'quote_portal_events', 'quote_discount_rules')
        and not relrowsecurity),
    '{}'::text[],
    'row level security is enabled on every quote-module table');

select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public' and tablename = 'quote_access_tokens'),
    0,
    'the token table has no policy at all: reads go through the summary view');

select * from finish();
rollback;
