--
-- Quotes / CPQ module, Phase 7: the customer portal.
--
-- docs/proposals/quotes-cpq-module.md §6. A customer who is not a CRM user opens
-- the quotation from a link, and accepts or declines it. The page talks to the
-- `quote-portal` edge function, which holds the service role and calls the
-- seven functions below. They are granted to `service_role` alone, so none of
-- them is reachable through PostgREST as `anon` or as a user (F2, D1).
--
--   quote_portal_log()           the one insertion point for the portal trail
--   quote_portal_resolve()       a token hash -> the document, or why not
--   quote_portal_document()      the payload: every key a deliberate disclosure
--   quote_portal_view()          opening the link: a view, and sent -> viewed once
--   quote_portal_begin_answer()  the checks both answers share
--   quote_portal_accept()        accepting the version the link opens
--   quote_portal_reject()        declining it, with a reason
--
-- No table changes. `quote_portal_events`, the acceptance columns of
-- `quote_versions` and the customer edges of `quote_transitions` were built in
-- Phase 2 for exactly this.
--
-- The functions and the grants are expanded verbatim from
-- `supabase/schemas/02_functions.sql` and `06_grants.sql`, where the same
-- objects live.
--

--
-- The customer portal (§6, Phase 7)
--
-- `service_role` only, and the `quote-portal` edge function is their one
-- caller. That function authenticates by HOLDING THE TOKEN -- the entire
-- security model -- so the rules live here, where `make test-db` can defend
-- them (D7), rather than in TypeScript only an edge-function test could reach.
-- See adr/ADR-7dcff21a-PHASE-7-quote-portal-no-anon-rls.md.
--
-- The edge function hashes the token before calling: the raw token never
-- reaches the database, exactly as it is never stored in it.
--
-- TWO WAYS TO REFUSE, and the choice is not style. A refusal that must LEAVE A
-- TRACE -- a dead link somebody is still opening, a link pulled faster than a
-- person reads -- is RETURNED as `{"error": <key>}`, because raising would roll
-- the trace back with everything else. Every other refusal RAISES, with its key
-- in DETAIL like the rest of the module, so nothing it half-wrote survives.
--
-- LOCK ORDER: the quote, then the token. `revise_quote()` revokes tokens while
-- holding the quote's lock; taking the token first here would be one concurrent
-- revision away from a deadlock.
--

-- The one insertion point for `quote_portal_events`.
--
-- The caller holds the quote's row lock, and that lock is what serialises the
-- per-quote `seq`: two portal requests on one quote cannot compute the same
-- next value. The address and the browser arrive as PARAMETERS because a
-- service-role RPC has no request headers (§5) -- `request_context()` would
-- return nulls here, and an audit trail of nulls reads as complete.
create or replace function public.quote_portal_log(
    p_quote_id    bigint,
    p_version_id  bigint,
    p_token_id    bigint,
    p_event_type  text,
    p_ip_address  inet,
    p_user_agent  text,
    p_actor_name  text  default null,
    p_actor_email text  default null,
    p_payload     jsonb default '{}'::jsonb
) returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_seq bigint;
begin
    select coalesce(max(e.seq), 0) + 1 into v_seq
      from public.quote_portal_events e where e.quote_id = p_quote_id;

    insert into public.quote_portal_events
        (quote_id, version_id, token_id, event_type, ip_address, user_agent,
         actor_name, actor_email, payload, seq)
    values (p_quote_id, p_version_id, p_token_id, p_event_type, p_ip_address,
            left(p_user_agent, 512), p_actor_name, p_actor_email,
            coalesce(p_payload, '{}'::jsonb), v_seq);
end;
$$;

-- Resolve a token hash to the document it opens, or to the reason it does not.
--
-- Returns `{token_id, quote_id, version_id}` with the quote and the token
-- locked, or `{error}` after recording why:
--
--   * `quote_link_invalid` for a hash nobody minted, a revoked link and an
--     expired one alike. ONE answer for all three, never a 403: a distinct
--     reply would confirm to whoever holds the value that it once was a link.
--     A dead link that names a quote leaves a `token_invalid` event on it, so
--     the rep can see the customer still trying the old one; an unknown hash
--     names no quote to file anything under.
--   * `quote_portal_throttled` once a link has made `v_max_events` requests in
--     `v_window`. This defends against SCRAPING, not guessing -- a 256-bit
--     token is not guessable -- by capping how fast one link can be pulled.
--     The refusal is recorded at most once per window, so a scraper cannot
--     turn the throttle into the flood of writes it exists to stop.
create or replace function public.quote_portal_resolve(
    p_token_hash bytea,
    p_ip_address inet,
    p_user_agent text
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_max_events constant integer  := 30;
    v_window     constant interval := interval '1 minute';
    v_token      public.quote_access_tokens;
    v_recent     integer;
begin
    -- Read without a lock, only to learn which quote to lock first.
    select t.* into v_token
      from public.quote_access_tokens t where t.token_hash = p_token_hash;
    if not found then
        return jsonb_build_object('error', 'quote_link_invalid');
    end if;

    perform 1 from public.quotes q where q.id = v_token.quote_id for update;

    -- Re-read under the lock: a revocation may have committed in between.
    select t.* into v_token
      from public.quote_access_tokens t where t.id = v_token.id for update;

    -- Counted up to the limit and no further, so a hammered link costs this
    -- query no more than a quiet one.
    select count(*) into v_recent
      from (select 1 from public.quote_portal_events e
             where e.token_id = v_token.id
               and e.occurred_at > clock_timestamp() - v_window
             limit v_max_events) recent;

    if v_recent >= v_max_events then
        if not exists (select 1 from public.quote_portal_events e
                        where e.token_id = v_token.id
                          and e.event_type = 'throttled'
                          and e.occurred_at > clock_timestamp() - v_window) then
            perform public.quote_portal_log(
                v_token.quote_id, v_token.version_id, v_token.id, 'throttled',
                p_ip_address, p_user_agent);
        end if;
        return jsonb_build_object(
            'error',               'quote_portal_throttled',
            'retry_after_seconds', extract(epoch from v_window)::integer);
    end if;

    if v_token.revoked_at is not null or v_token.expires_at <= now() then
        perform public.quote_portal_log(
            v_token.quote_id, v_token.version_id, v_token.id, 'token_invalid',
            p_ip_address, p_user_agent);
        return jsonb_build_object('error', 'quote_link_invalid');
    end if;

    return jsonb_build_object(
        'token_id',   v_token.id,
        'quote_id',   v_token.quote_id,
        'version_id', v_token.version_id);
end;
$$;

-- The payload: one issued version, as the customer may see it (§6.3).
--
-- EVERY KEY BUILT HERE IS A PUBLIC DISCLOSURE. There is no row level security
-- behind this read -- the service role reads everything -- so a column named
-- below reaches anybody holding the link, and a typo is a data leak. That is
-- the price of D1, and building the payload in SQL is what makes it payable:
-- `quote_portal.test.sql` pins the exact key set of every group and asserts
-- what must never appear (the internal notes of the quote and of every
-- product, internal comments, the team's emails, the deal, internal ids, the
-- customer's address, the token and its hash). A key added here without its
-- assertion turns that test red on purpose.
--
-- The groups are `QuoteDocumentData`'s (`quotes/quoteDocumentData.ts`), so the
-- portal renders the one document component through the one mapper.
--
-- `parties` is picked KEY BY KEY from `party_snapshot` rather than passed
-- through: the snapshot is built for the internal document, and a field added
-- to `quote_party_snapshot()` later must not reach the portal by accident.
-- `quote.title` is disclosed on purpose -- the printed quotation already
-- carries it -- and the owner appears only as the display name the snapshot
-- took.
--
-- `actions` reads the status machine, never a list of statuses: which answers
-- a customer may give is `quote_transitions`' decision, the same rule the
-- internal toolbar follows. The document conditions beside it are the ones
-- `quote_portal_begin_answer()` enforces, so the buttons and the refusals
-- cannot disagree.
--
-- Null for a draft: a draft is not a document. The comment thread (Phase 8)
-- and the change-detection etag (Phase 9) join the payload with the phases that
-- render them.
create or replace function public.quote_portal_document(p_version_id bigint)
returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select jsonb_build_object(
        'quote', jsonb_build_object(
            'number',         q.quote_number,
            'title',          q.title,
            'status',         q.status_key,
            'currency',       v.currency,
            'version_number', v.version_number,
            'issued_at',      v.issued_at,
            'valid_until',    v.valid_until,
            'is_superseded',  v.superseded_at is not null),
        'parties', jsonb_build_object(
            'company', case when jsonb_typeof(v.party_snapshot -> 'company') = 'object'
                then jsonb_build_object(
                    'name',           v.party_snapshot -> 'company' -> 'name',
                    'address',        v.party_snapshot -> 'company' -> 'address',
                    'zipcode',        v.party_snapshot -> 'company' -> 'zipcode',
                    'city',           v.party_snapshot -> 'company' -> 'city',
                    'state_abbr',     v.party_snapshot -> 'company' -> 'state_abbr',
                    'country',        v.party_snapshot -> 'company' -> 'country',
                    'tax_identifier', v.party_snapshot -> 'company' -> 'tax_identifier',
                    'phone_number',   v.party_snapshot -> 'company' -> 'phone_number',
                    'website',        v.party_snapshot -> 'company' -> 'website')
                end,
            'contact', case when jsonb_typeof(v.party_snapshot -> 'contact') = 'object'
                then jsonb_build_object(
                    'first_name', v.party_snapshot -> 'contact' -> 'first_name',
                    'last_name',  v.party_snapshot -> 'contact' -> 'last_name',
                    'title',      v.party_snapshot -> 'contact' -> 'title',
                    'email',      v.party_snapshot -> 'contact' -> 'email',
                    'phone',      v.party_snapshot -> 'contact' -> 'phone')
                end,
            'owner', jsonb_build_object(
                'name', v.party_snapshot -> 'owner' -> 'name')),
        'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'position',         l.position,
                       'sku',              l.sku,
                       'name',             l.name,
                       'description',      l.description,
                       'unit',             l.unit,
                       'quantity',         l.quantity,
                       'unit_price',       l.unit_price,
                       'discount_percent', l.discount_percent,
                       'tax_rate_percent', l.tax_rate_percent,
                       'line_total',       l.line_total)
                   order by l.position, l.id)
              from public.quote_lines l
             where l.version_id = v.id), '[]'::jsonb),
        'totals', jsonb_build_object(
            'subtotal',       v.subtotal,
            'discount_total', v.discount_total,
            'tax_total',      v.tax_total,
            'total',          v.total),
        'terms', v.terms,
        -- From the configuration singleton, because a page with no layout
        -- never loads it (F3). Null when the installation never set one; the
        -- page falls back to the build's own branding, never to a guess.
        'branding', jsonb_build_object(
            'title', (select nullif(btrim(c.config ->> 'title'), '')
                        from public.configuration c where c.id = 1),
            -- The settings screen stores the logo as `{src}`; a configuration
            -- written by hand holds a plain string.
            'logo_url', (select nullif(case jsonb_typeof(c.config -> 'lightModeLogo')
                                           when 'string' then c.config ->> 'lightModeLogo'
                                           when 'object' then c.config -> 'lightModeLogo' ->> 'src'
                                       end, '')
                           from public.configuration c where c.id = 1)),
        'actions', jsonb_build_object(
            'can_accept', answerable.is_answerable and exists (
                select 1 from public.quote_transitions t
                 where t.from_status_key = q.status_key
                   and t.to_status_key = 'accepted'
                   and t.allowed_actor in ('customer', 'any')),
            'can_reject', answerable.is_answerable and exists (
                select 1 from public.quote_transitions t
                 where t.from_status_key = q.status_key
                   and t.to_status_key = 'rejected'
                   and t.allowed_actor in ('customer', 'any'))),
        'acceptance', jsonb_build_object(
            'accepted_at',      v.accepted_at,
            'accepted_by_name', v.accepted_by_name,
            'rejected_at',      v.rejected_at))
      from public.quote_versions v
      join public.quotes q on q.id = v.quote_id
     cross join lateral (
        select v.superseded_at is null
               and v.accepted_at is null
               and v.rejected_at is null
               and (v.valid_until is null or v.valid_until >= current_date)
               as is_answerable
     ) answerable
     where v.id = p_version_id
       and v.issued_at is not null;
$$;

-- The customer opens the link.
--
-- Every successful open is one `viewed` event and one more on the token's
-- `view_count`. The first look at the LIVE document also moves the quote to
-- `viewed`, when the status machine has that edge for the customer from where
-- the quote stands. Opening a superseded version moves nothing: an old link is
-- not news about the document the rep is negotiating now.
create or replace function public.quote_portal_view(
    p_token_hash bytea,
    p_ip_address inet default null,
    p_user_agent text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_access  jsonb;
    v_quote   public.quotes;
    v_version public.quote_versions;
begin
    v_access := public.quote_portal_resolve(p_token_hash, p_ip_address, p_user_agent);
    if v_access ? 'error' then
        return v_access;
    end if;

    select * into v_quote from public.quotes q
     where q.id = (v_access ->> 'quote_id')::bigint;
    select * into v_version from public.quote_versions v
     where v.id = (v_access ->> 'version_id')::bigint;

    update public.quote_access_tokens t
       set view_count = t.view_count + 1,
           last_seen_at = now()
     where t.id = (v_access ->> 'token_id')::bigint;

    perform public.quote_portal_log(
        v_quote.id, v_version.id, (v_access ->> 'token_id')::bigint, 'viewed',
        p_ip_address, p_user_agent, null, null,
        jsonb_build_object('version_number', v_version.version_number));

    if v_version.superseded_at is null
       and exists (select 1 from public.quote_transitions t
                    where t.from_status_key = v_quote.status_key
                      and t.to_status_key = 'viewed'
                      and t.allowed_actor in ('customer', 'any')) then
        perform public.apply_quote_status(
            v_quote.id, 'viewed', null, 'customer', null, null, null);
    end if;

    return public.quote_portal_document(v_version.id);
end;
$$;

-- What accepting and rejecting check before either writes anything (§6.4).
--
-- Returns what `quote_portal_resolve()` returns, plus the trimmed `name` and
-- `email` the answer is signed with. In this order, under the quote's lock --
-- so two tabs answering at once serialise there:
--
--   1. the input: the name and email, required to accept and optional to
--      reject, capped the way the edge function caps them. Checked before the
--      token is even looked up, so a malformed request reads nothing;
--   2. the link is alive;
--   3. the version is still answerable: not superseded
--      (`quote_version_superseded`, the "a newer version was issued" page), not
--      already answered (`quote_version_answered` -- a version is accepted or
--      rejected once, `quote_versions_one_outcome`), not past its validity
--      (`quote_validity_elapsed`, the key the issue already uses).
--
-- The status machine is the fourth check and the callers make it, through
-- `apply_quote_status()`: that is where a second click lands, so idempotency
-- comes from the state machine rather than from a mechanism that could
-- disagree with it.
create or replace function public.quote_portal_begin_answer(
    p_token_hash     bytea,
    p_name           text,
    p_email          text,
    p_party_required boolean,
    p_ip_address     inet,
    p_user_agent     text
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_name    text := nullif(btrim(coalesce(p_name, '')), '');
    v_email   text := nullif(btrim(coalesce(p_email, '')), '');
    v_access  jsonb;
    v_version public.quote_versions;
begin
    if char_length(coalesce(v_name, '')) > 200
       or char_length(coalesce(v_email, '')) > 320 then
        raise exception 'a portal answer exceeds its length limit'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_input_too_long';
    end if;

    if p_party_required and v_name is null then
        raise exception 'a name is required to answer a quote'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_name_required';
    end if;

    if (p_party_required and v_email is null)
       or (v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
        raise exception 'a valid email is required to answer a quote'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_email_invalid';
    end if;

    v_access := public.quote_portal_resolve(p_token_hash, p_ip_address, p_user_agent);
    if v_access ? 'error' then
        return v_access;
    end if;

    select * into v_version from public.quote_versions v
     where v.id = (v_access ->> 'version_id')::bigint;

    if v_version.superseded_at is not null then
        raise exception 'quote version % was superseded by a newer one', v_version.id
            using errcode = 'check_violation', detail = 'quote_version_superseded';
    end if;

    if v_version.accepted_at is not null or v_version.rejected_at is not null then
        raise exception 'quote version % has already been answered', v_version.id
            using errcode = 'check_violation', detail = 'quote_version_answered';
    end if;

    if v_version.valid_until < current_date then
        raise exception 'the offer in quote version % expired on %',
                v_version.id, v_version.valid_until
            using errcode = 'check_violation', detail = 'quote_validity_elapsed';
    end if;

    return v_access || jsonb_build_object('name', v_name, 'email', v_email);
end;
$$;

-- The customer accepts the version the link opens.
--
-- One transaction writes what §6.4 lists: the status move (through
-- `apply_quote_status()`, as 'customer'), the history row it triggers, the
-- acceptance columns on the version -- through the per-version unfreeze hole,
-- the only way past the freeze -- and the `accepted` portal event with the
-- address and the browser. The owner's notification is Phase 11.
create or replace function public.quote_portal_accept(
    p_token_hash bytea,
    p_name       text,
    p_email      text,
    p_ip_address inet default null,
    p_user_agent text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_answer  jsonb;
    v_version public.quote_versions;
begin
    v_answer := public.quote_portal_begin_answer(
        p_token_hash, p_name, p_email, true, p_ip_address, p_user_agent);
    if v_answer ? 'error' then
        return v_answer;
    end if;

    perform public.apply_quote_status(
        (v_answer ->> 'quote_id')::bigint, 'accepted', null, 'customer',
        null, null, null);

    perform set_config('app.quote_version_unfreeze', v_answer ->> 'version_id', true);

    update public.quote_versions v
       set accepted_at         = now(),
           accepted_by_name    = v_answer ->> 'name',
           accepted_by_email   = v_answer ->> 'email',
           accepted_ip         = p_ip_address,
           acceptance_method   = 'portal_click',
           -- What was agreed to, beside who agreed: the version and the figure
           -- as they stood at the click, and the browser that clicked. Internal
           -- only: no payload and no timeline row reads this column.
           acceptance_evidence = jsonb_build_object(
               'token_id',       (v_answer ->> 'token_id')::bigint,
               'version_number', v.version_number,
               'currency',       v.currency,
               'total',          v.total,
               'user_agent',     left(p_user_agent, 512))
     where v.id = (v_answer ->> 'version_id')::bigint
    returning * into v_version;

    perform set_config('app.quote_version_unfreeze', '', true);

    perform public.quote_portal_log(
        v_version.quote_id, v_version.id, (v_answer ->> 'token_id')::bigint,
        'accepted', p_ip_address, p_user_agent,
        v_answer ->> 'name', v_answer ->> 'email',
        jsonb_build_object('version_number', v_version.version_number,
                           'currency',       v_version.currency,
                           'total',          v_version.total));

    return public.quote_portal_document(v_version.id);
end;
$$;

-- The customer declines the version the link opens.
--
-- The same shape as accepting, with a reason instead of a signature: the code
-- is required, so "why we lost it" is reportable; the free text, the name and
-- the email are optional, because a customer asked to fill in a form to say no
-- mostly does not say anything at all.
create or replace function public.quote_portal_reject(
    p_token_hash  bytea,
    p_reason_code text,
    p_reason      text default null,
    p_name        text default null,
    p_email       text default null,
    p_ip_address  inet default null,
    p_user_agent  text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_code    text := nullif(btrim(coalesce(p_reason_code, '')), '');
    v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
    v_answer  jsonb;
    v_version public.quote_versions;
begin
    -- The list `quote_versions.rejected_reason_code` checks, restated so a bad
    -- code is refused with a key the portal can explain. Left to the
    -- constraint it would be a bare 23514 -- which the freeze guard raises too,
    -- so the two could not be told apart.
    if v_code is null
       or v_code not in ('price', 'terms', 'delivery_time', 'product', 'other') then
        raise exception 'unknown rejection reason %', coalesce(v_code, 'null')
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_reason_code_invalid';
    end if;

    if char_length(coalesce(v_reason, '')) > 2000 then
        raise exception 'a portal answer exceeds its length limit'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_input_too_long';
    end if;

    v_answer := public.quote_portal_begin_answer(
        p_token_hash, p_name, p_email, false, p_ip_address, p_user_agent);
    if v_answer ? 'error' then
        return v_answer;
    end if;

    perform public.apply_quote_status(
        (v_answer ->> 'quote_id')::bigint, 'rejected', v_reason, 'customer',
        null, null, null);

    perform set_config('app.quote_version_unfreeze', v_answer ->> 'version_id', true);

    update public.quote_versions v
       set rejected_at          = now(),
           rejected_reason      = v_reason,
           rejected_reason_code = v_code
     where v.id = (v_answer ->> 'version_id')::bigint
    returning * into v_version;

    perform set_config('app.quote_version_unfreeze', '', true);

    perform public.quote_portal_log(
        v_version.quote_id, v_version.id, (v_answer ->> 'token_id')::bigint,
        'rejected', p_ip_address, p_user_agent,
        v_answer ->> 'name', v_answer ->> 'email',
        jsonb_build_object('version_number', v_version.version_number,
                           'reason_code',    v_code,
                           'reason',         v_reason));

    return public.quote_portal_document(v_version.id);
end;
$$;

-- The customer portal (Phase 7): `service_role` only, which only the
-- `quote-portal` edge function holds. Not `anon` -- the portal is not a
-- PostgREST client (F2, D1) -- and not `authenticated` either: these functions
-- take the token hash as the WHOLE authorisation, so a user able to call them
-- would be one hash away from answering for a customer.
revoke all on function public.quote_portal_log(bigint, bigint, bigint, text, inet, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.quote_portal_resolve(bytea, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_document(bigint) from public, anon, authenticated;
revoke all on function public.quote_portal_view(bytea, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_accept(bytea, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_reject(bytea, text, text, text, text, inet, text) from public, anon, authenticated;

grant execute on function public.quote_portal_log(bigint, bigint, bigint, text, inet, text, text, text, jsonb) to service_role;
grant execute on function public.quote_portal_resolve(bytea, inet, text) to service_role;
grant execute on function public.quote_portal_document(bigint) to service_role;
grant execute on function public.quote_portal_view(bytea, inet, text) to service_role;
grant execute on function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text) to service_role;
grant execute on function public.quote_portal_accept(bytea, text, text, inet, text) to service_role;
grant execute on function public.quote_portal_reject(bytea, text, text, text, text, inet, text) to service_role;
