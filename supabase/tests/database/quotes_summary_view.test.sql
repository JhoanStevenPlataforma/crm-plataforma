--
-- Quotes module, the read projections (docs/proposals/quotes-cpq-module.md §2.6).
--
--   * `quotes_summary` shows the current version's totals and the attention
--     counters, scoped by the reader's own policies;
--   * `quote_access_tokens_summary` never exposes the hash and restates the
--     quote visibility rule it has to (it runs as its owner);
--   * `timeline_events` tells the quote's story on the quote and on its deal,
--     with the customer as 'system' and without their IP address;
--   * `price_book` never offers a product in a list of another currency unless
--     somebody priced it there.
--
begin;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data) values
  ('97880000-0000-0000-0000-000000000001', 'quotes.summary@test.local', '{"first_name":"Sofia","last_name":"Summary"}'::jsonb),
  ('97880000-0000-0000-0000-000000000002', 'quotes.summary.other@test.local', '{"first_name":"Otto","last_name":"Otro"}'::jsonb);

update public.sales set id = 9781, role = 'rep' where user_id = '97880000-0000-0000-0000-000000000001';
update public.sales set id = 9782, role = 'rep' where user_id = '97880000-0000-0000-0000-000000000002';

insert into public.companies (id, name, sales_id, logo)
values (9781, 'Cliente Resumen', 9781, '{}'::jsonb);

insert into public.deals (id, name, stage, amount, sales_id, company_id, index)
values (9781, 'Renovacion 2027', 'opportunity', 1390, 9781, 9781, 0);

insert into public.quotes (id, company_id, deal_id, sales_id, currency)
values (9781, 9781, 9781, 9781, 'COP');

-- 1 x 1000 at 19% = 1190.00, plus 2 x 100 untaxed = 200.00 -> 1390.00.
insert into public.quote_lines (version_id, name, quantity, unit_price, tax_rate_percent, "position")
select v.id, l.name, l.qty, l.price, l.tax, l.pos
  from public.quote_versions v
 cross join (values ('Implementacion', 1, 1000, 19, 1),
                    ('Capacitacion', 2, 100, 0, 2)) as l(name, qty, price, tax, pos)
 where v.quote_id = 9781;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97880000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.issue_quote_version(9781);
insert into public.quote_comments (quote_id, visibility, body)
values (9781, 'shared', 'Quedo atento a sus comentarios');
reset role;

-- What the portal function will write in Phase 7.
insert into public.quote_portal_events (quote_id, event_type, ip_address, user_agent, actor_name, seq)
values (9781, 'viewed', '203.0.113.7', 'pgTAP', 'Lucia Compras', 1),
       (9781, 'viewed', '203.0.113.7', 'pgTAP', 'Lucia Compras', 2);

insert into public.quote_comments (quote_id, author_kind, author_name, visibility, body)
values (9781, 'customer', 'Lucia Compras', 'shared', 'Pueden mejorar el plazo de entrega?');

-- The catalogue behind the price book.
insert into public.price_lists (id, code, name, currency)
values (9781, 'TST-9781-COP', 'Lista COP resumen', 'COP');

insert into public.products (id, sku, name, currency, list_price) values
  (97811, 'TST-9781-P1', 'Producto en pesos', 'COP', 100),
  (97812, 'TST-9781-P2', 'Producto en dolares', 'USD', 50),
  (97813, 'TST-9781-P3', 'Producto en dolares con precio en la lista', 'USD', 60);

insert into public.price_list_items (price_list_id, product_id, unit_price)
values (9781, 97813, 180000);

--
-- 1. quotes_summary, as the owner.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97880000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select array[subtotal, tax_total, total] from public.quotes_summary where id = 9781),
    array[1200.00, 190.00, 1390.00]::numeric[],
    'the summary shows the current version totals');

select is(
    (select company_name || ' | ' || deal_name || ' | ' || owner_name
       from public.quotes_summary where id = 9781),
    'Cliente Resumen | Renovacion 2027 | Sofia Summary',
    'the summary resolves the company, the deal and the owner');

select is(
    (select status_label || '/' || status_is_open::text from public.quotes_summary where id = 9781),
    'Sent/true',
    'the summary carries the status label and flags without a second request');

select is(
    (select array[nb_issued_versions, nb_lines, nb_views, nb_shared_comments,
                  nb_unanswered_customer_comments, nb_active_tokens]
       from public.quotes_summary where id = 9781),
    array[1, 2, 2, 2, 1, 1]::bigint[],
    'the counters: one issued version, two lines, two views, two shared comments, one unanswered, one live link');

select ok(
    (select last_portal_activity_at is not null from public.quotes_summary where id = 9781),
    'the summary knows when the customer last did something');

--
-- 2. The timeline.
--
select is(
    (select array_agg(event_type order by occurred_at, id)
       from public.timeline_events where entity_type = 'quote' and entity_id = 9781),
    array['quote.status_changed', 'quote.viewed', 'quote.viewed'],
    'the quote timeline holds its transitions and what the customer did');

select is(
    (select payload ->> 'quote_number' from public.timeline_events
      where entity_type = 'deal' and entity_id = 9781 and event_type = 'quote.status_changed'),
    (select quote_number from public.quotes where id = 9781),
    'the deal timeline shows the transition of the quote raised against it');

select ok(
    not exists (select 1 from public.timeline_events
                 where entity_type = 'quote' and entity_id = 9781
                   and payload::text like '%203.0.113%'),
    'the customer''s IP address never reaches a timeline payload');

select is(
    (select array_agg(distinct actor_kind order by actor_kind)
       from public.timeline_events where entity_type = 'quote' and entity_id = 9781),
    array['system', 'user'],
    'the customer is reported as system, so the timeline switch cannot fall through');

--
-- 3. The token summary.
--
select ok(
    not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'quote_access_tokens_summary'
                   and column_name in ('token_hash', 'token')),
    'the token summary exposes neither the hash nor the permanent link''s token');

select is(
    (select count(*)::int from public.quote_access_tokens_summary
      where quote_id = 9781 and is_active and is_permanent and expires_at is null),
    1,
    'the owner sees the live permanent link to their quote, which has no expiry');

--
-- 4. Somebody else.
--
select set_config('request.jwt.claims',
    '{"sub":"97880000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
    array[(select count(*) from public.quotes_summary where id = 9781),
          (select count(*) from public.quote_access_tokens_summary where quote_id = 9781),
          (select count(*) from public.timeline_events where entity_type = 'quote' and entity_id = 9781)],
    array[0, 0, 0]::bigint[],
    'a colleague sees neither the quote, nor its links, nor its timeline');

--
-- 5. After a revision.
--
select set_config('request.jwt.claims',
    '{"sub":"97880000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
    $$select public.revise_quote(9781, 'Ajuste de plazo de entrega')$$,
    'the owner revises the quote');

select is(
    (select current_version_number::int || '/' || (issued_at is null)::text || '/'
            || nb_issued_versions || '/' || nb_active_tokens
       from public.quotes_summary where id = 9781),
    '2/true/1/1',
    'the summary follows the new draft, keeps counting the issued version, and keeps the quote''s link');

--
-- 6. The price book.
--
select is(
    (select array_agg(sku::text order by sku) from public.price_book
      where price_list_id = 9781 and sku like 'TST-9781-%'),
    array['TST-9781-P1', 'TST-9781-P3'],
    'a product in another currency is offered only when somebody priced it in this list');

select is(
    (select unit_price::text || '/' || is_list_price::text from public.price_book
      where price_list_id = 9781 and sku = 'TST-9781-P1'),
    '100.00/false',
    'a same-currency product falls back to its own list price');

select is(
    (select unit_price::text || '/' || is_list_price::text from public.price_book
      where price_list_id = 9781 and sku = 'TST-9781-P3'),
    '180000.00/true',
    'an explicit list price wins, in the list currency');

reset role;

update public.products set is_active = false where id = 97811;

select ok(
    not exists (select 1 from public.price_book
                 where price_list_id = 9781 and sku = 'TST-9781-P1'),
    'a deactivated product leaves the price book');

--
-- 7. Why we lost it (§6.4, Phase 10).
--
-- `quote_portal_reject()` has required a reason code since Phase 7 so the
-- refusal would be reportable, and for three phases no reader could reach it.
-- The refusal is made the way a customer makes it -- through the portal
-- function, with the link the issue minted -- never by writing the column.
--
insert into public.quotes (id, company_id, sales_id, currency, valid_until)
values (9783, 9781, 9781, 'COP', current_date + 10);

insert into public.quote_lines (version_id, name, quantity, unit_price, tax_rate_percent)
select v.id, 'Implementacion', 1, 1000, 0
  from public.quote_versions v where v.quote_id = 9783;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97880000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('summary_test.rejected', public.issue_quote_version(9783)::text, true);
reset role;

set local role service_role;
select public.quote_portal_reject(
    sha256(decode(current_setting('summary_test.rejected')::jsonb ->> 'token', 'hex')),
    'delivery_time', 'Necesitamos entrega en agosto', 'Lucia Compras', null,
    '203.0.113.9', 'pgTAP/1.0');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97880000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select rejected_reason_code || '/' || (rejected_at is not null)::text
       from public.quotes_summary where id = 9783),
    'delivery_time/true',
    'the summary reports why the current version was refused');

select ok(
    (select rejected_at is null and rejected_reason_code is null
       from public.quotes_summary where id = 9781),
    'a quote nobody refused reports neither a refusal nor a reason');

-- The decision of §6.4, pinned: the CODE groups a pipeline, the customer's own
-- words are read on the quotation. PostgREST asks this view for `select=*` on
-- every list page, so a free-text column here is paid for by every reader.
select ok(
    not exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'quotes_summary'
                   and column_name = 'rejected_reason'),
    'the summary carries the reason code, never the free text');

reset role;

select * from finish();
rollback;
