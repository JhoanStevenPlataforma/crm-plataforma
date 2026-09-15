--
-- Quotes module, access tokens, expiry and retention
-- (docs/proposals/quotes-cpq-module.md §4, §6.2, §8, F5).
--
--   * the raw token exists once, as the return value of the issue; only its
--     sha256 is stored, and a link never outlives the offer it points at;
--   * another link can be minted for the live document, never for a draft, an
--     open revision or an elapsed offer;
--   * revoking is restricted to people who see the quote, and idempotent, and no
--     function a user can call hands back a token hash;
--   * the sweeper expires overdue offers through the status machine, as
--     'system', on the date the document carries, and touches nothing still
--     valid;
--   * `purge_quotes()` is the one way past the freeze and append-only guards,
--     which is what `e2e/fixtures.ts` `resetDb()` depends on -- and the guards
--     are back in force the moment it returns.
--
begin;

select plan(32);

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

select is(
    (select octet_length(t.token_hash) || '/'
            || (t.token_hash = decode(current_setting('quotes_test.issue')::jsonb ->> 'token', 'hex'))::text
       from public.quote_access_tokens t
      where t.id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint),
    '32/false',
    'the token itself is stored nowhere');

select is(
    (select expires_at from public.quote_access_tokens
      where id = (current_setting('quotes_test.issue')::jsonb ->> 'token_id')::bigint),
    (current_date + 6)::timestamp with time zone,
    'a link never outlives the offer: 30 days requested, clamped to the day after valid_until');

select is(
    (select expires_at from public.quote_access_tokens
      where id = (current_setting('quotes_test.issue_open')::jsonb ->> 'token_id')::bigint),
    now() + interval '7 days',
    'without a validity date the link lasts the requested window');

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

select * from finish();
rollback;
