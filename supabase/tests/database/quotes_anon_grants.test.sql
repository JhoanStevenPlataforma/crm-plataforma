--
-- Quotes module, the anon and privilege invariants (docs/proposals/quotes-cpq-module.md §7, F2).
--
-- `alter default privileges` in 06_grants.sql hands `anon` and `authenticated`
-- every privilege on every new table, view, sequence and function the moment it
-- is created. Nothing fails when that is forgotten -- row level security still
-- refuses anon today -- so the omission is invisible until a policy is loosened
-- or a function is SECURITY DEFINER.
--
-- This file is the one that catches it on the next object somebody adds: every
-- relation, sequence and function of the module is listed, and `anon` must hold
-- nothing on any of them. It also pins the invariant the public portal is built
-- on: no quote policy grants anybody but `authenticated`, and the portal's own
-- functions are callable by neither `anon` nor a user.
--
begin;

select plan(12);

--
-- The inventory. Each assertion below is vacuous if an entry is missing, so the
-- first two prove every entry exists.
--
select is(
    (select count(*)::int
       from unnest(array['tax_rates', 'quote_statuses', 'quote_transitions', 'products',
            'product_events', 'price_lists', 'price_list_items', 'quotes', 'quote_versions',
            'quote_lines', 'quote_comments', 'quote_access_tokens', 'quote_status_changes',
            'quote_portal_events', 'quote_discount_rules', 'quotes_summary',
            'quote_access_tokens_summary', 'price_book']) as t
      where to_regclass('public.' || t) is not null),
    18,
    'the fifteen tables and three views of the module exist');

select is(
    (select count(*)::int
       from unnest(array[
            'public.can_see_quote(bigint)',
            'public.quotes_set_defaults()',
            'public.quotes_seed_first_version()',
            'public.quote_versions_before_insert()',
            'public.quote_versions_sync_header()',
            'public.quotes_header_guard()',
            'public.quote_lines_set_carrier()',
            'public.quote_lines_snapshot_defaults()',
            'public.quote_comments_before_insert()',
            'public.quote_comments_before_update()',
            'public.refresh_quote_version_totals(bigint)',
            'public.quote_lines_refresh_totals()',
            'public.quote_lines_freeze_guard()',
            'public.quote_versions_freeze_guard()',
            'public.reject_quote_history_mutation()',
            'public.products_audit()',
            'public.quotes_status_guard()',
            'public.quotes_log_status_change()',
            'public.apply_quote_status(bigint,text,text,text,bigint,jsonb,text)',
            'public.transition_quote(bigint,text,text,jsonb)',
            'public.quote_discount_gate(bigint)',
            'public.quote_party_snapshot(bigint)',
            'public.mint_quote_token(bigint,integer,text)',
            'public.ensure_quote_share_link(bigint)',
            'public.issue_quote_version(bigint,integer,text,text,text)',
            'public.revise_quote(bigint,text)',
            'public.create_quote_link(bigint,integer,text)',
            'public.revoke_quote_token(bigint)',
            'public.mark_quote_comments_read(bigint)',
            'public.quote_share_link(bigint,boolean)',
            'public.purge_quotes(bigint[],boolean)',
            'public.purge_catalogue(bigint[],boolean)',
            'public.sweep_expired_quotes()',
            'public.quote_portal_log(bigint,bigint,bigint,text,inet,text,text,text,jsonb)',
            'public.quote_portal_resolve(bytea,inet,text)',
            'public.quote_portal_target_version(bigint,integer)',
            'public.quote_portal_document(bigint)',
            'public.quote_portal_view(bytea,inet,text,integer)',
            'public.quote_portal_begin_answer(bytea,text,text,boolean,inet,text,integer)',
            'public.quote_portal_accept(bytea,text,text,inet,text,integer)',
            'public.quote_portal_reject(bytea,text,text,text,text,inet,text,integer)',
            'public.quote_portal_comment(bytea,text,text,text,inet,text)',
            'public.quote_portal_version(bytea,integer)',
            'public.notify_quote_event(bigint,text,text,text,text,bigint,text,jsonb)',
            'public.quote_portal_events_notify()']) as f
      where to_regprocedure(f) is not null),
    45,
    'the forty-five functions of the module exist');

--
-- anon: nothing, anywhere.
--
select is(
    (select coalesce(array_agg(t || ':' || p order by t, p), '{}')
       from unnest(array['tax_rates', 'quote_statuses', 'quote_transitions', 'products',
            'product_events', 'price_lists', 'price_list_items', 'quotes', 'quote_versions',
            'quote_lines', 'quote_comments', 'quote_access_tokens', 'quote_status_changes',
            'quote_portal_events', 'quote_discount_rules', 'quotes_summary',
            'quote_access_tokens_summary', 'price_book']) as t
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                              'REFERENCES', 'TRIGGER']) as p
      where has_table_privilege('anon', 'public.' || t, p)),
    '{}'::text[],
    'anon holds no privilege on any quote-module table or view');

select is(
    (select coalesce(array_agg(f order by f), '{}')
       from unnest(array[
            'public.can_see_quote(bigint)',
            'public.quotes_set_defaults()',
            'public.quotes_seed_first_version()',
            'public.quote_versions_before_insert()',
            'public.quote_versions_sync_header()',
            'public.quotes_header_guard()',
            'public.quote_lines_set_carrier()',
            'public.quote_lines_snapshot_defaults()',
            'public.quote_comments_before_insert()',
            'public.quote_comments_before_update()',
            'public.refresh_quote_version_totals(bigint)',
            'public.quote_lines_refresh_totals()',
            'public.quote_lines_freeze_guard()',
            'public.quote_versions_freeze_guard()',
            'public.reject_quote_history_mutation()',
            'public.products_audit()',
            'public.quotes_status_guard()',
            'public.quotes_log_status_change()',
            'public.apply_quote_status(bigint,text,text,text,bigint,jsonb,text)',
            'public.transition_quote(bigint,text,text,jsonb)',
            'public.quote_discount_gate(bigint)',
            'public.quote_party_snapshot(bigint)',
            'public.mint_quote_token(bigint,integer,text)',
            'public.ensure_quote_share_link(bigint)',
            'public.issue_quote_version(bigint,integer,text,text,text)',
            'public.revise_quote(bigint,text)',
            'public.create_quote_link(bigint,integer,text)',
            'public.revoke_quote_token(bigint)',
            'public.mark_quote_comments_read(bigint)',
            'public.quote_share_link(bigint,boolean)',
            'public.purge_quotes(bigint[],boolean)',
            'public.purge_catalogue(bigint[],boolean)',
            'public.sweep_expired_quotes()',
            'public.quote_portal_log(bigint,bigint,bigint,text,inet,text,text,text,jsonb)',
            'public.quote_portal_resolve(bytea,inet,text)',
            'public.quote_portal_target_version(bigint,integer)',
            'public.quote_portal_document(bigint)',
            'public.quote_portal_view(bytea,inet,text,integer)',
            'public.quote_portal_begin_answer(bytea,text,text,boolean,inet,text,integer)',
            'public.quote_portal_accept(bytea,text,text,inet,text,integer)',
            'public.quote_portal_reject(bytea,text,text,text,text,inet,text,integer)',
            'public.quote_portal_comment(bytea,text,text,text,inet,text)',
            'public.quote_portal_version(bytea,integer)',
            'public.notify_quote_event(bigint,text,text,text,text,bigint,text,jsonb)',
            'public.quote_portal_events_notify()']) as f
      where has_function_privilege('anon', f, 'EXECUTE')),
    '{}'::text[],
    'anon may execute no quote-module function');

select is(
    (select coalesce(array_agg(s order by s), '{}')
       from unnest(array['tax_rates_id_seq', 'quote_statuses_id_seq', 'quote_transitions_id_seq',
            'products_id_seq', 'price_lists_id_seq', 'price_list_items_id_seq', 'quotes_id_seq',
            'quote_lines_id_seq', 'quote_comments_id_seq', 'product_events_id_seq',
            'quote_versions_id_seq', 'quote_access_tokens_id_seq', 'quote_status_changes_id_seq',
            'quote_portal_events_id_seq', 'quote_number_seq']) as s
      cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as p
      where has_sequence_privilege('anon', 'public.' || s, p)),
    '{}'::text[],
    'anon holds no privilege on any quote-module sequence');

--
-- authenticated: exactly what it needs.
--
select is(
    (select coalesce(array_agg(t || ':' || p order by t, p), '{}')
       from unnest(array['tax_rates', 'quote_statuses', 'quote_transitions', 'products',
            'product_events', 'price_lists', 'price_list_items', 'quotes', 'quote_versions',
            'quote_lines', 'quote_comments', 'quote_access_tokens', 'quote_status_changes',
            'quote_portal_events', 'quote_discount_rules', 'quotes_summary',
            'quote_access_tokens_summary', 'price_book']) as t
      cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) as p
      where has_table_privilege('authenticated', 'public.' || t, p)),
    '{}'::text[],
    'users hold no TRUNCATE on any quote table, which would bypass row level security');

select is(
    (select coalesce(array_agg(p order by p), '{}')
       from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p
      where has_table_privilege('authenticated', 'public.quote_access_tokens', p)),
    '{}'::text[],
    'users hold no privilege on the token table itself');

-- The portal functions are on this list for a sharper reason than the rest:
-- they take a token hash as the whole authorisation, so a user who could call
-- them could accept a quote, or write to its thread, in a customer's name.
select is(
    (select coalesce(array_agg(f order by f), '{}')
       from unnest(array[
            'public.quotes_set_defaults()',
            'public.quotes_seed_first_version()',
            'public.quote_versions_before_insert()',
            'public.quote_versions_sync_header()',
            'public.quotes_header_guard()',
            'public.quote_lines_set_carrier()',
            'public.quote_lines_snapshot_defaults()',
            'public.quote_comments_before_insert()',
            'public.quote_comments_before_update()',
            'public.refresh_quote_version_totals(bigint)',
            'public.quote_lines_refresh_totals()',
            'public.quote_lines_freeze_guard()',
            'public.quote_versions_freeze_guard()',
            'public.reject_quote_history_mutation()',
            'public.products_audit()',
            'public.quotes_status_guard()',
            'public.quotes_log_status_change()',
            'public.apply_quote_status(bigint,text,text,text,bigint,jsonb,text)',
            'public.mint_quote_token(bigint,integer,text)',
            'public.ensure_quote_share_link(bigint)',
            'public.quote_party_snapshot(bigint)',
            'public.purge_quotes(bigint[],boolean)',
            'public.purge_catalogue(bigint[],boolean)',
            'public.sweep_expired_quotes()',
            'public.quote_portal_log(bigint,bigint,bigint,text,inet,text,text,text,jsonb)',
            'public.quote_portal_resolve(bytea,inet,text)',
            'public.quote_portal_target_version(bigint,integer)',
            'public.quote_portal_document(bigint)',
            'public.quote_portal_view(bytea,inet,text,integer)',
            'public.quote_portal_begin_answer(bytea,text,text,boolean,inet,text,integer)',
            'public.quote_portal_accept(bytea,text,text,inet,text,integer)',
            'public.quote_portal_reject(bytea,text,text,text,text,inet,text,integer)',
            'public.quote_portal_comment(bytea,text,text,text,inet,text)',
            'public.quote_portal_version(bytea,integer)',
            'public.notify_quote_event(bigint,text,text,text,text,bigint,text,jsonb)',
            'public.quote_portal_events_notify()']) as f
      where has_function_privilege('authenticated', f, 'EXECUTE')),
    '{}'::text[],
    'users cannot call the internal functions, above all apply_quote_status, mint_quote_token and the portal''s');

select is(
    (select count(*)::int
       from unnest(array[
            'public.can_see_quote(bigint)',
            'public.transition_quote(bigint,text,text,jsonb)',
            'public.quote_discount_gate(bigint)',
            'public.issue_quote_version(bigint,integer,text,text,text)',
            'public.revise_quote(bigint,text)',
            'public.create_quote_link(bigint,integer,text)',
            'public.revoke_quote_token(bigint)',
            'public.mark_quote_comments_read(bigint)',
            'public.quote_share_link(bigint,boolean)']) as f
      where has_function_privilege('authenticated', f, 'EXECUTE')),
    9,
    'users can call the nine functions the UI needs');

--
-- The portal invariant (F2): no policy grants anon, so the portal must go
-- through an edge function holding the service role.
--
select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public'
        and tablename in ('tax_rates', 'quote_statuses', 'quote_transitions', 'products',
            'product_events', 'price_lists', 'price_list_items', 'quotes', 'quote_versions',
            'quote_lines', 'quote_comments', 'quote_access_tokens', 'quote_status_changes',
            'quote_portal_events', 'quote_discount_rules')
        and roles <> '{authenticated}'::name[]),
    0,
    'every quote policy targets authenticated and nobody else');

select is(
    (select array_agg(distinct r)
       from pg_policies p, unnest(p.roles) as r
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname like 'Quote attachments%'),
    array['authenticated']::name[],
    'the quote file policies exist and target authenticated only');

select is(
    (select public from storage.buckets where id = 'quote-attachments'),
    false,
    'the quote file bucket is private');

select * from finish();
rollback;
