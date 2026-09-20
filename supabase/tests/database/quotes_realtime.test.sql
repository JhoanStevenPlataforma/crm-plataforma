--
-- Quotes module, real time (docs/proposals/quotes-cpq-module.md §6.5, D2, Phase 9).
--
--   * the team's screens are told of a change through the `supabase_realtime`
--     publication: `quotes`, `quote_comments` and `quote_portal_events` are in
--     it, `quote_lines` is not, and each published table is readable by
--     `authenticated` -- Realtime honours row level security, so a published
--     table with no select policy delivers nothing, in silence;
--   * the customer's page polls `quote_portal_version()`, whose `etag` is the
--     hash of the payload itself: it moves when what the customer can see
--     moves, and for nothing else -- not for a view, not for an internal
--     comment, not for an internal note;
--   * the poll writes nothing, and a dead link gets the same answer an open
--     does, without leaving the trace an open leaves.
--
-- The portal functions are called as `service_role`, the role the edge function
-- holds.
--
begin;

select plan(15);

create function public.quotes_test_hash_of(p_setting text) returns bytea
    language sql stable
as $$
    select sha256(decode(current_setting(p_setting)::jsonb ->> 'token', 'hex'));
$$;

create function public.quotes_test_keys_of(p_object jsonb) returns text
    language sql immutable
as $$
    select coalesce(string_agg(k, ',' order by k collate "C"), '')
      from jsonb_object_keys(p_object) as k;
$$;

-- The etag the poll answers right now for the link kept in a setting.
create function public.quotes_test_etag_of(p_setting text) returns text
    language sql volatile
as $$
    select public.quote_portal_version(public.quotes_test_hash_of(p_setting)) ->> 'etag';
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98510000-0000-0000-0000-000000000001', 'quotes.realtime.owner@test.local',
   '{"first_name":"Rita","last_name":"Realtime"}'::jsonb);

update public.sales set id = 9851, role = 'rep'
 where user_id = '98510000-0000-0000-0000-000000000001';

insert into public.companies (id, name, sales_id, logo)
values (9851, 'Realtime Customer', 9851, '{}'::jsonb);

-- 9851 is the live document, 9852's link is revoked and 9853's lapses.
insert into public.quotes (id, company_id, sales_id, currency, valid_until) values
  (9851, 9851, 9851, 'COP', current_date + 10),
  (9852, 9851, 9851, 'COP', current_date + 10),
  (9853, 9851, 9851, 'COP', current_date + 10);

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Realtime line', 1, 100 from public.quote_versions v
 where v.quote_id between 9851 and 9853;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98510000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select set_config('realtime_test.live',    public.issue_quote_version(9851)::text, true);
select set_config('realtime_test.revoked', public.issue_quote_version(9852)::text, true);
select set_config('realtime_test.expired', public.issue_quote_version(9853)::text, true);
select public.revoke_quote_token((current_setting('realtime_test.revoked')::jsonb ->> 'token_id')::bigint);
reset role;

update public.quote_access_tokens set expires_at = now() - interval '1 second'
 where id = (current_setting('realtime_test.expired')::jsonb ->> 'token_id')::bigint;

--
-- 1. The publication.
--
select is(
    (select coalesce(array_agg(t.tablename::text order by t.tablename), '{}')
       from pg_publication_tables t
      where t.pubname = 'supabase_realtime'
        and t.schemaname = 'public'
        and t.tablename in ('quotes', 'quote_versions', 'quote_lines', 'quote_comments',
                            'quote_access_tokens', 'quote_status_changes',
                            'quote_portal_events')),
    array['quote_comments', 'quote_portal_events', 'quotes'],
    'the quote, its thread and its portal trail are published; the lines are not');

select is(
    (select coalesce(array_agg(t order by t), '{}')
       from unnest(array['quotes', 'quote_comments', 'quote_portal_events']) as t
      where not has_table_privilege('authenticated', 'public.' || t, 'SELECT')
         or not exists (select 1 from pg_policies p
                         where p.schemaname = 'public' and p.tablename = t
                           and p.cmd in ('SELECT', 'ALL')
                           and 'authenticated' = any (p.roles))),
    '{}'::text[],
    'every published table is readable by a user, or Realtime would deliver nothing');

--
-- 2. The etag.
--
set local role service_role;
select set_config('realtime_test.view',
    public.quote_portal_view(public.quotes_test_hash_of('realtime_test.live'), null, null)::text,
    true);
select set_config('realtime_test.poll',
    public.quote_portal_version(public.quotes_test_hash_of('realtime_test.live'))::text,
    true);
reset role;

select is(
    public.quotes_test_keys_of(current_setting('realtime_test.poll')::jsonb)
        || ':' || (current_setting('realtime_test.poll')::jsonb ->> 'etag'),
    'etag:' || (current_setting('realtime_test.view')::jsonb ->> 'etag'),
    'the poll answers the etag and nothing else, the one the open document carries');

select is(
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    (select encode(sha256(convert_to((v - 'etag')::text, 'UTF8')), 'hex')
       from (select current_setting('realtime_test.view')::jsonb as v) p),
    'the etag is the hash of the rest of the payload');

set local role service_role;

select is(
    public.quote_portal_view(public.quotes_test_hash_of('realtime_test.live'), null, null) ->> 'etag',
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    'opening the link again changes nothing the etag covers, or every poll would refetch forever');

reset role;
select set_config('realtime_test.trail_before',
    (select count(*) || '/' || max(t.view_count) || '/' || max(t.last_seen_at)
       from public.quote_portal_events e, public.quote_access_tokens t
      where e.quote_id = 9851 and t.quote_id = 9851),
    true);
set local role service_role;

select public.quote_portal_version(public.quotes_test_hash_of('realtime_test.live'))
  from generate_series(1, 5);

reset role;

select is(
    (select count(*) || '/' || max(t.view_count) || '/' || max(t.last_seen_at)
       from public.quote_portal_events e, public.quote_access_tokens t
      where e.quote_id = 9851 and t.quote_id = 9851),
    current_setting('realtime_test.trail_before'),
    'the poll writes nothing: no event, no view counted, no last-seen stamp');

--
-- 3. What moves it, and what does not.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98510000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.quote_comments (quote_id, body) values (9851, 'An internal remark');

set local role service_role;
select is(
    public.quotes_test_etag_of('realtime_test.live'),
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    'an internal comment does not move it: the customer cannot see it');

set local role authenticated;
update public.quotes set internal_notes = 'Budget is tight' where id = 9851;

set local role service_role;
select is(
    public.quotes_test_etag_of('realtime_test.live'),
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    'nor does an internal note, although the quote row changed');

set local role authenticated;
insert into public.quote_comments (quote_id, visibility, body) values (9851, 'shared', 'We can start in October.');

set local role service_role;
select set_config('realtime_test.shared', public.quotes_test_etag_of('realtime_test.live'), true);
select isnt(
    current_setting('realtime_test.shared'),
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    'a shared comment moves it');

set local role authenticated;
update public.quote_comments set body = 'We can start in November.'
 where quote_id = 9851 and visibility = 'shared';

set local role service_role;
select set_config('realtime_test.edited', public.quotes_test_etag_of('realtime_test.live'), true);
select isnt(
    current_setting('realtime_test.edited'),
    current_setting('realtime_test.shared'),
    'so does an edit of it, which writes no new comment');

set local role authenticated;
update public.quote_comments set deleted_at = now()
 where quote_id = 9851 and visibility = 'shared';

set local role service_role;
select is(
    public.quotes_test_etag_of('realtime_test.live'),
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    'and a soft delete takes the document, and its etag, back to what they were');

set local role authenticated;
select public.transition_quote(9851, 'negotiating');

set local role service_role;
select isnt(
    public.quotes_test_etag_of('realtime_test.live'),
    current_setting('realtime_test.view')::jsonb ->> 'etag',
    'a move the team makes moves it');

--
-- 4. Dead links.
--
reset role;
select set_config('realtime_test.dead_before',
    (select count(*) from public.quote_portal_events where quote_id in (9852, 9853))::text,
    true);
set local role service_role;

select is(
    public.quote_portal_version(public.quotes_test_hash_of('realtime_test.revoked'))
        || public.quote_portal_version(public.quotes_test_hash_of('realtime_test.expired')),
    '{"error": "quote_link_invalid"}'::jsonb,
    'a revoked and a lapsed link get the answer an open gets');

reset role;

select is(
    (select count(*) from public.quote_portal_events where quote_id in (9852, 9853))::text,
    current_setting('realtime_test.dead_before'),
    'without the trace an open leaves');

set local role service_role;

select is(
    public.quote_portal_version(sha256('never minted'::bytea)),
    '{"error": "quote_link_invalid"}'::jsonb,
    'and so does a hash nobody minted');

reset role;

select * from finish();
rollback;
