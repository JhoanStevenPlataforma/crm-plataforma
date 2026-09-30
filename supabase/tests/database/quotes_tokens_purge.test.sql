--
-- Quotes module, access tokens, expiry and retention
-- (docs/proposals/quotes-cpq-module.md §4, §6.2, §8, F5).
--
--   * the issue hands out the quotation's PERMANENT link (2026-09-29): one per
--     quote, reused by every later issue, kept through a revision, with no
--     expiry, its raw token readable only through `quote_share_link()` by
--     whoever may share the quote -- and minted there for a quote issued
--     before links were permanent, or after its link was revoked;
--   * another (expiring) link can still be minted for the live document, never
--     for a draft, an open revision or an elapsed offer, and it never outlives
--     the offer it points at;
--   * revoking is restricted to people who see the quote, and idempotent, and no
--     function a user can call hands back a token hash;
--   * the sweeper expires overdue offers through the status machine, as
--     'system', on the date the document carries, and touches nothing still
--     valid;
--   * `purge_quotes()` is the one way past the freeze and append-only guards,
--     which is what `e2e/fixtures.ts` `resetDb()` depends on -- and the guards
--     are back in force the moment it returns;
--   * `purge_catalogue()` is the same path for the catalogue (§13.6 #8, #19):
--     the only way a product is ever removed, which is what lets the reset
--     reach `sales` at all -- and a quoted product taken that way leaves its
--     line's snapshot intact, provenance nulled.
--
begin;

select plan(50);

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
  ('97990000-0000-0000-0000-000000000001', 'quotes.tokens@test.local',       '{"first_name":"Tomas","last_name":"Token"}'::jsonb),
  ('97990000-0000-0000-0000-000000000002', 'quotes.tokens.other@test.local', '{"first_name":"Otto","last_name":"Otro"}'::jsonb),
  ('97990000-0000-0000-0000-000000000004', 'quotes.tokens.mgr@test.local',   '{"first_name":"Marta","last_name":"Manager"}'::jsonb);

update public.sales set id = 9791, role = 'rep'     where user_id = '97990000-0000-0000-0000-000000000001';
update public.sales set id = 9792, role = 'rep'     where user_id = '97990000-0000-0000-0000-000000000002';
update public.sales set id = 9794, role = 'manager' where user_id = '97990000-0000-0000-0000-000000000004';

insert into public.companies (id, name, sales_id, logo)
values (9791, 'Cliente Tokens', 9791, '{}'::jsonb);

-- 9794 is revised later; 9795's offer lapses while it is still a draft; 9796 is
-- never issued.
insert into public.quotes (id, company_id, sales_id, currency, valid_until) values
  (9791, 9791, 9791, 'COP', current_date + 5),
  (9792, 9791, 9791, 'COP', null),
  (9793, 9791, 9791, 'COP', current_date + 1),
  (9794, 9791, 9791, 'COP', current_date + 10),
  (9795, 9791, 9791, 'COP', current_date + 30),
  (9796, 9791, 9791, 'COP', current_date + 10);

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Linea', 1, 100 from public.quote_versions v where v.quote_id between 9791 and 9796;

-- The catalogue the retention assertions at the bottom of this file work on.
-- 9791 is quoted (its provenance is what a purge must not fabricate a value
-- for); 9792 is only priced; the tax rate is a test row beside the seeded ones.
insert into public.tax_rates (id, code, label, rate)
values (9791, 'purge-test', 'Tarifa de prueba', 7.000);

insert into public.products (id, sku, name, currency, tax_rate_id, sales_id) values
  (9791, 'PURGE-1', 'Producto cotizado', 'COP', 9791, 9791),
  (9792, 'PURGE-2', 'Producto solo tarifado', 'COP', null, 9791);

insert into public.price_lists (id, code, name, currency)
values (9791, 'purge-test', 'Lista de prueba', 'COP');

insert into public.price_list_items (price_list_id, product_id, unit_price) values
  (9791, 9791, 250), (9791, 9792, 400);

insert into public.quote_lines (version_id, product_id, name, quantity, unit_price)
select v.id, 9791, 'Producto cotizado', 2, 250
  from public.quote_versions v where v.quote_id = 9796;

-- The issue results are kept in transaction-local settings: the raw token is
-- returned exactly once and the token table is unreadable to the rep.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('quotes_test.issue', public.issue_quote_version(9791, 30, 'Compras')::text, true);
select set_config('quotes_test.issue_open', public.issue_quote_version(9792, 7)::text, true);
select public.issue_quote_version(9793);
select public.issue_quote_version(9794);
-- Validity is edited where it lives, on the draft. This one is shortened into
-- the past, which is what makes it unsendable rather than merely short.
update public.quote_versions set valid_until = current_date - 1 where quote_id = 9795;
reset role;

-- 9793 was issued INSIDE its validity, and then the day passed. A test cannot
-- wait a day, so the date moves instead -- through the per-version unfreeze
-- hole, the only way past the freeze and the one the acceptance writes use.
-- `quote_versions_sync_header` carries the new date to the header, which is the
-- column `sweep_expired_quotes()` reads: that it does is half of what the
-- sweeper assertions below are checking.
select set_config('app.quote_version_unfreeze', v.id::text, true)
  from public.quote_versions v where v.quote_id = 9793;
update public.quote_versions set valid_until = current_date - 1 where quote_id = 9793;
select set_config('app.quote_version_unfreeze', '', true);

--
-- 1. The token.
--
select matches(
    current_setting('quotes_test.issue')::jsonb ->> 'token',
    '^[0-9a-f]{64}$',
    'the raw token is 256 random bits, hex-encoded');

select ok(
    exists (select 1 from public.quote_access_tokens t
             where t.id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint
               and t.token_hash = sha256(decode(current_setting('quotes_test.issue')::jsonb ->> 'token', 'hex'))),
    'the stored value is the sha256 of the token that was handed out');

-- The permanent link keeps its raw token, so the rep can copy it again -- in a
-- column of a table no user holds any privilege on.
select is(
    (select octet_length(t.token_hash) || '/'
            || (t.token = current_setting('quotes_test.issue')::jsonb ->> 'token')::text || '/'
            || has_column_privilege('authenticated', 'public.quote_access_tokens', 'token', 'SELECT')::text
       from public.quote_access_tokens t
      where t.id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint),
    '32/true/false',
    'the permanent link keeps its token beside the hash, where no user can read it');

select matches(
    public.quotes_test_error_of($$insert into public.quote_access_tokens
        (quote_id, version_id, token_hash, token, expires_at)
        select 9791, v.id, sha256('\x01'::bytea), repeat('ab', 32), 'infinity'
          from public.quote_versions v where v.quote_id = 9791$$),
    '^23514:Failing row',
    'a stored token must be the one its hash was taken from');

-- No expiry: the document stays readable, and whether the offer can still be
-- ANSWERED is the version's `valid_until` (quote_portal.test.sql). The days and
-- the label the issue is called with no longer shape the link.
select is(
    (select array_agg(t.expires_at::text || '/' || coalesce(t.label, '-') order by t.quote_id)
       from public.quote_access_tokens t
      where t.id in ((current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint,
                     (current_setting('quotes_test.issue_open')::jsonb ->> 'token_id')::bigint)),
    array['infinity/-', 'infinity/-'],
    'the permanent link has no expiry, whatever window or label the issue was asked for');

select is(
    (select version_id from public.quote_access_tokens
      where id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint),
    (select id from public.quote_versions where quote_id = 9791 and version_number = 1),
    'the token is bound to the version it was minted for');

--
-- 2. Another link for the same document.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('quotes_test.link', public.create_quote_link(9791, 30, 'Gerencia')::text, true);
reset role;

select ok(
    exists (select 1 from public.quote_access_tokens t
             where t.id = (current_setting('quotes_test.link')::jsonb ->> 'token_id')::bigint
               and t.token_hash = sha256(decode(current_setting('quotes_test.link')::jsonb ->> 'token', 'hex'))
               and t.version_id = (select id from public.quote_versions where quote_id = 9791 and version_number = 1)
               and t.label = 'Gerencia'),
    'a new link is minted for the issued document, handed out once and stored as its hash');

select is(
    (select count(*)::int from public.quote_access_tokens where quote_id = 9791 and revoked_at is null),
    2,
    'the first link keeps working beside the new one');

select is(
    (select expires_at from public.quote_access_tokens
      where id = (current_setting('quotes_test.link')::jsonb ->> 'token_id')::bigint),
    (current_date + 6)::timestamp with time zone,
    'an extra link never outlives the offer: 30 days requested, clamped to the day after valid_until');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select matches(
    public.quotes_test_error_of($$select public.create_quote_link(9791)$$),
    '^42501',
    'a colleague cannot mint a link to a quote they cannot see');

select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.create_quote_link(9796)$$),
    'P0002:quote_not_issued',
    'a quote that was never issued has no document to link to');

select is(
    public.quotes_test_error_of($$select public.create_quote_link(9793)$$),
    '23514:quote_validity_elapsed',
    'no link is minted for an offer whose validity has already elapsed');

-- The other half of the same rule (§13.6 #12). Both paths mint through
-- `mint_quote_token()`, which clamps a link to the day after `valid_until`, so
-- either one would hand the customer a link that is already dead. Asserted
-- beside its twin on purpose: the two refusals drifted apart once already.
select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9795)$$),
    '23514:quote_validity_elapsed',
    'a draft whose offer has already lapsed cannot be issued either');

select lives_ok(
    $$select public.revise_quote(9794, 'Cambio de alcance')$$,
    'the rep opens a revision');

select is(
    public.quotes_test_error_of($$select public.create_quote_link(9794)$$),
    '23514:quote_draft_exists',
    'while a revision is open no new link points at the version it replaces');

--
-- 2b. The permanent link, from the quote's page.
--
select is(
    (select concat_ws('/', (l ->> 'token' = current_setting('quotes_test.issue')::jsonb ->> 'token')::text,
                      l ->> 'version_number', l ->> 'is_permanent')
       from (select public.quote_share_link(9791) as l) s),
    'true/1/true',
    'the quote''s page reads the link the issue handed out, and the version it opens');

select is(
    (select concat_ws('/', l ->> 'version_number',
                      (select (t.revoked_at is null)::text from public.quote_access_tokens_summary t
                        where t.id = (l ->> 'token_id')::bigint))
       from (select public.quote_share_link(9794) as l) s),
    '1/true',
    'a revision keeps the link, which shows the last issued version until the next issue');

select is(
    public.quote_share_link(9796),
    null,
    'a quote never issued has no link');

select is(
    public.quotes_test_error_of($$select public.quote_share_link(9796, true)$$),
    'P0002:quote_not_issued',
    'and none can be made for it');

select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select matches(
    public.quotes_test_error_of($$select public.quote_share_link(9791)$$),
    '^42501',
    'a colleague cannot read the link to a quote they cannot see');

select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select is(
    public.quote_share_link(9791) ->> 'token',
    current_setting('quotes_test.issue')::jsonb ->> 'token',
    'a manager reads it too');

reset role;

-- A quotation issued before links were permanent has only hash-only links.
update public.quote_access_tokens set token = null where quote_id = 9792;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quote_share_link(9792),
    null,
    'reading never mints: an older quotation says it has no permanent link yet');

select set_config('quotes_test.legacy', public.quote_share_link(9792, true)::text, true);

select is(
    (select (current_setting('quotes_test.legacy')::jsonb ->> 'token')
                <> (current_setting('quotes_test.issue_open')::jsonb ->> 'token')
            and count(*) = 2
       from public.quote_access_tokens_summary t
      where t.quote_id = 9792 and t.is_active),
    true,
    'asked to, it mints the permanent link beside the old one, which keeps working');

select is(
    public.quote_share_link(9792, true) ->> 'token',
    current_setting('quotes_test.legacy')::jsonb ->> 'token',
    'asking again returns the same link, never a second one');

reset role;

--
-- 3. Revocation.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select matches(
    public.quotes_test_error_of(format($$select public.revoke_quote_token(%s)$$,
        current_setting('quotes_test.issue')::jsonb ->> 'token_id')),
    '^42501',
    'a colleague cannot revoke the link to a quote they cannot see');

select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
    format($$select public.revoke_quote_token(%s)$$,
        current_setting('quotes_test.issue')::jsonb ->> 'token_id'),
    'the owner revokes the link');

select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
    format($$select public.revoke_quote_token(%s)$$,
        current_setting('quotes_test.issue')::jsonb ->> 'token_id'),
    'revoking an already revoked link is not an error');

select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select is_active from public.quote_access_tokens_summary
      where id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint),
    false,
    'a revoked link reads as inactive');

reset role;

select is(
    (select revoked_by from public.quote_access_tokens
      where id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint),
    9791::bigint,
    'the second revocation did not rewrite who actually stopped the link');

-- A revoked permanent link is how a leaked one is killed; the page then offers
-- to make another, and it is a different one.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97990000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quote_share_link(9791),
    null,
    'once its permanent link is revoked, the quote has none to read');

select isnt(
    public.quote_share_link(9791, true) ->> 'token',
    current_setting('quotes_test.issue')::jsonb ->> 'token',
    'and the next one made is a different link');

reset role;

-- The token row carries `token_hash`, so returning it from an RPC would put the
-- hash in the browser -- what `quote_access_tokens_summary` exists to prevent.
-- Checked over every function a user can call, so the next one is covered too.
select is(
    (select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and ('token_hash' = any (coalesce(p.proargnames, '{}'::text[]))
             or exists (select 1
                          from pg_type rt
                          join pg_attribute a on a.attrelid = rt.typrelid
                         where rt.oid = p.prorettype
                           and a.attname = 'token_hash'
                           and not a.attisdropped))),
    '{}'::text[],
    'no function a user can call hands back a token hash');

--
-- 4. The expiry sweeper.
--
select ok(
    public.sweep_expired_quotes() >= 1,
    'the sweeper expires overdue offers');

select is(
    (select status_key from public.quotes where id = 9793),
    'expired',
    'the quote past its validity is expired');

select is(
    (select actor_kind || '/' || coalesce(sales_id::text, 'none') || '/' || reason
       from public.quote_status_changes where quote_id = 9793 and to_status = 'expired'),
    'system/none/validity elapsed',
    'the expiry is on the trail as system, with no invented actor');

select is(
    (select array_agg(status_key order by id) from public.quotes where id in (9791, 9792)),
    array['sent', 'sent'],
    'offers still inside their validity are untouched');

select is(
    (select status_key from public.quotes where id = 9795),
    'draft',
    'a lapsed DRAFT is left alone: it was never sent, so there is no offer to expire');

--
-- 5. Retention.
--
select matches(
    public.quotes_test_error_of($$delete from public.quotes where id = 9791$$),
    '^(23514|42501)',
    'a plain delete of an issued quote is refused, even for the table owner');

select is(
    public.purge_quotes(array[9791]::bigint[]),
    1,
    'purge_quotes removes the quote through the retention path');

select is(
    array[(select count(*) from public.quotes where id = 9791),
          (select count(*) from public.quote_versions where quote_id = 9791),
          (select count(*) from public.quote_lines where quote_id = 9791),
          (select count(*) from public.quote_access_tokens where quote_id = 9791),
          (select count(*) from public.quote_status_changes where quote_id = 9791)],
    array[0, 0, 0, 0, 0]::bigint[],
    'and everything that hung off it');

select is(
    (select count(*)::int from public.quotes where id in (9792, 9793)),
    2,
    'other quotes are untouched by a targeted purge');

select is(
    public.quotes_test_error_of($$update public.quote_versions set terms = 'x' where quote_id = 9792$$),
    '23514:quote_version_frozen',
    'the guards are back in force once the purge returns');

--
-- The catalogue's own retention path (§13.6 #8, #19). Asserted BEFORE the full
-- quote reset below, because the point of the first half is what happens to a
-- line that names the product being removed -- which needs a line to still
-- exist.
--
select is(
    public.quotes_test_error_of($$delete from public.products where id = 9792$$),
    '42501',
    'a plain delete of a product is refused: the cascade to product_events is append-only');

select is(
    public.purge_catalogue(array[9792]::bigint[]),
    1,
    'purge_catalogue removes a product through the retention path');

select is(
    array[(select count(*) from public.products where id = 9792),
          (select count(*) from public.product_events where product_id = 9792),
          (select count(*) from public.price_list_items where product_id = 9792),
          (select count(*) from public.products where id = 9791)],
    array[0, 0, 0, 1]::bigint[],
    'with its price rows and its history, and no other product');

-- `on delete set null` on `quote_lines.product_id`, and the frozen columns are
-- the record: a purged product must not blank the document that quoted it.
select public.purge_catalogue(array[9791]::bigint[]);

select is(
    (select array[l.product_id::text, l.name, l.quantity::text, l.unit_price::text]
       from public.quote_lines l where l.quote_id = 9796 and l.name = 'Producto cotizado'),
    array[null, 'Producto cotizado', '2.000', '250.00'],
    'a quoted product taken by the purge leaves the line''s snapshot intact, provenance nulled');

-- The e2e reset: everything, history included.
select public.purge_quotes(null, true);

select is(
    array[(select count(*) from public.quotes),
          (select count(*) from public.quote_status_changes),
          (select count(*) from public.quote_portal_events)],
    array[0, 0, 0]::bigint[],
    'the full reset empties the module, history included');

select is(
    current_setting('app.quote_purge', true),
    'off',
    'the purge switch is closed again');

-- The order `resetDb()` uses: the quotes go first, then what priced them.
select public.purge_catalogue(null, true);

select is(
    array[(select count(*) from public.products),
          (select count(*) from public.price_lists),
          (select count(*) from public.price_list_items),
          (select count(*) from public.tax_rates where not is_system)],
    array[0, 0, 0, 0]::bigint[],
    'the full catalogue reset empties the catalogue and the rates a test created');

-- The asymmetry is the assertion: the seeded rates are reference data, like
-- `quote_statuses`. A reset that took `iva_19` with it would leave every later
-- spec quoting at 0% without saying so.
select ok(
    (select count(*) from public.tax_rates where is_system) > 0,
    'and keeps the seeded rates, which are reference data and not test residue');

select * from finish();
rollback;
