-- Quotes: one permanent customer link per quotation, a version selector on the
-- portal, and renegotiating a refused quotation
-- (docs/proposals/quotes-cpq-module.md, "Permanent link" entry of 2026-09-29).
--
-- Hand-written: the objects below are copied verbatim from
-- `supabase/schemas/0{1,2,3,6}_*.sql`, as every quotes migration since Phase 2
-- (`supabase db diff` on this stack emits unrelated drift).
--
--   * `quote_access_tokens.token`: the permanent link keeps its raw token so
--     the rep can copy it again; one live permanent link per quote.
--   * `quote_access_tokens_summary`: `expires_at` null for the permanent link,
--     `is_permanent` appended (replace, never drop: a dropped view comes back
--     granted to `anon`).
--   * `ensure_quote_share_link()` / `quote_share_link()`: mint or read it;
--     `issue_quote_version()` reuses it, `revise_quote()` no longer revokes.
--   * The portal resolves the version from the QUOTE:
--     `quote_portal_target_version()`, a `versions` key in the payload, and a
--     `p_version_number` on the open, the poll and both answers. Adding a
--     defaulted parameter would OVERLOAD those five functions, so each is
--     dropped and created again, with its grant.
--   * `sync_deal_from_quote()`: sending a renegotiated quotation reopens the
--     deal its own refusal closed.
--
-- Existing links keep working (a live, unexpired per-version link now opens
-- the quotation's newest version, with the selector); revoked ones stay
-- revoked. A quotation issued before this migration gets its permanent link
-- the first time somebody asks for it on the quote's page, or at its next issue.

--
-- The permanent link
--

alter table public.quote_access_tokens
    add column token text,
    add constraint quote_access_tokens_token_matches_hash check (
        token is null
        or case when token ~ '^[0-9a-f]{64}$'
                then sha256(decode(token, 'hex')) = token_hash
                else false
           end);

create unique index quote_access_tokens_one_permanent
    on public.quote_access_tokens (quote_id)
    where token is not null and revoked_at is null;

create or replace view public.quote_access_tokens_summary with (security_invoker = off) as
select
    t.id,
    t.quote_id,
    t.version_id,
    t.label,
    t.created_by,
    t.created_at,
    nullif(t.expires_at, 'infinity'::timestamp with time zone) as expires_at,
    t.revoked_at,
    t.revoked_by,
    t.last_seen_at,
    t.view_count,
    (t.revoked_at is null and t.expires_at > now()) as is_active,
    (t.token is not null) as is_permanent
from public.quote_access_tokens t
where public.can_see_quote(t.quote_id);

create or replace function public.ensure_quote_share_link(p_quote_id bigint)
returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_version_id bigint;
    v_token      public.quote_access_tokens;
    v_raw        bytea;
begin
    -- A link to a quote that was never issued would open nothing.
    select v.id into v_version_id
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is not null
     order by v.version_number desc
     limit 1;
    if not found then
        raise exception 'quote % has no issued version to link to', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    select * into v_token
      from public.quote_access_tokens t
     where t.quote_id = p_quote_id
       and t.token is not null
       and t.revoked_at is null;

    if not found then
        v_raw := extensions.gen_random_bytes(32);
        insert into public.quote_access_tokens
            (quote_id, version_id, token_hash, token, created_by, expires_at)
        values (p_quote_id, v_version_id, sha256(v_raw), encode(v_raw, 'hex'),
                public.current_sale_id(), 'infinity')
        returning * into v_token;
    end if;

    return jsonb_build_object(
        'token_id',     v_token.id,
        'token',        v_token.token,
        'expires_at',   null,
        'is_permanent', true);
end;
$$;

create or replace function public.quote_share_link(
    p_quote_id bigint,
    p_create   boolean default false
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_version public.quote_versions;
begin
    -- Locked, so two tabs creating the link at once serialise here instead of
    -- one of them tripping over `quote_access_tokens_one_permanent`.
    perform 1 from public.quotes q where q.id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- Restated because SECURITY DEFINER bypasses RLS.
    if not (select public.can_see_quote(p_quote_id)) then
        raise exception 'no permission to share quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_version
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is not null
     order by v.version_number desc
     limit 1;

    if not p_create and (v_version.id is null or not exists (
        select 1 from public.quote_access_tokens t
         where t.quote_id = p_quote_id
           and t.token is not null
           and t.revoked_at is null)) then
        return null;
    end if;

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number)
        || public.ensure_quote_share_link(p_quote_id);
end;
$$;

create or replace function public.issue_quote_version(
    p_quote_id        bigint,
    p_token_days      integer default 30,
    p_token_label     text    default null,
    p_override_reason text    default null,
    p_reason          text    default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote    public.quotes;
    v_actor    bigint := public.current_sale_id();
    v_version  public.quote_versions;
    v_prev     public.quote_versions;
    v_gate     jsonb;
    v_override text := nullif(btrim(coalesce(p_override_reason, '')), '');
    v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
    v_link     jsonb;
begin
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- Same rule as the quotes UPDATE policy. Restated because SECURITY DEFINER
    -- bypasses RLS.
    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to issue quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_version
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is null
     for update;
    if not found then
        raise exception 'quote % has no editable draft to issue', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_no_draft';
    end if;

    -- An empty document is not a quotation. Caught here rather than by the
    -- customer.
    if not exists (select 1 from public.quote_lines l
                    where l.version_id = v_version.id) then
        raise exception 'quote % has no lines to issue', p_quote_id
            using errcode = 'check_violation', detail = 'quote_empty';
    end if;

    -- An offer that has already lapsed cannot be sent. `mint_quote_token()`
    -- clamps a link to the day after `valid_until`, so issuing this draft would
    -- hand the customer a link that is dead on arrival -- exactly the case
    -- `create_quote_link()` already refuses with the same key. The two paths
    -- mint the same token and now refuse on the same condition (§13.6 #12).
    if v_version.valid_until < current_date then
        raise exception 'the offer in quote % expired on %', p_quote_id, v_version.valid_until
            using errcode = 'check_violation', detail = 'quote_validity_elapsed';
    end if;

    -- Evaluated inside the row lock taken above, so two concurrent issues
    -- cannot both pass the gate on the strength of the same state.
    v_gate := public.quote_discount_gate(p_quote_id);

    if not (v_gate->>'ok')::boolean then
        -- Only an admin overrides, and only in writing. A manager may issue
        -- anybody's quote, but not past the rule.
        if v_override is null
           or (select public.current_sales_role())
              is distinct from 'admin'::public.sales_role then
            raise exception 'quote % grants % percent discount, above the % percent allowed for %',
                    p_quote_id,
                    v_gate->>'effective_discount_percent',
                    v_gate->>'max_allowed',
                    v_gate->>'role'
                using errcode = 'check_violation',
                      detail  = 'quote_discount_exceeds_limit',
                      hint    = v_gate::text;
        end if;
    else
        -- The gate was satisfied, so nothing was overridden. Recording a motive
        -- here would put a skipped-the-rule marker on an issue that met it.
        v_override := null;

        if (v_gate->>'reason_required')::boolean and v_reason is null then
            raise exception 'quote % grants % percent discount, above the % percent that needs a written reason',
                    p_quote_id,
                    v_gate->>'effective_discount_percent',
                    v_gate->>'requires_reason_above'
                using errcode = 'check_violation',
                      detail  = 'quote_discount_reason_required',
                      hint    = v_gate::text;
        end if;
    end if;

    -- The previous document stops being current. One row at a time, with the
    -- GUC carrying its id, because the unfreeze hole is per version.
    for v_prev in
        select * from public.quote_versions v
         where v.quote_id = p_quote_id
           and v.issued_at is not null
           and v.superseded_at is null
    loop
        perform set_config('app.quote_version_unfreeze', v_prev.id::text, true);
        update public.quote_versions set superseded_at = now() where id = v_prev.id;
        perform set_config('app.quote_version_unfreeze', '', true);
    end loop;

    -- Recomputed rather than trusted: the totals are about to be frozen, and
    -- the figure a customer signs must be the one the lines add up to.
    perform public.refresh_quote_version_totals(v_version.id);

    -- Still a draft at this point, so the freeze guard lets it through once
    -- this function identifies itself as the owner of the stamped columns. From
    -- the next statement on, this row is immutable.
    perform set_config('app.quote_version_system_write', v_version.id::text, true);

    -- `valid_until` and `terms` are left alone: the draft already carries the
    -- document's own, and the header mirrors them (`quote_versions_sync_header`).
    update public.quote_versions v
       set issued_at      = now(),
           issued_by      = v_actor,
           party_snapshot = public.quote_party_snapshot(p_quote_id),
           slides         = public.portal_slides_snapshot(),
           standard_presentation = coalesce((select t.is_system
                                               from public.portal_templates t
                                              where t.is_active), false)
     where v.id = v_version.id
    returning * into v_version;

    perform set_config('app.quote_version_system_write', '', true);

    v_link := public.ensure_quote_share_link(p_quote_id);

    perform public.apply_quote_status(
        p_quote_id, 'sent', v_reason, 'internal', v_actor, null, v_override);

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number) || v_link;
end;
$$;

create or replace function public.revise_quote(
    p_quote_id bigint,
    p_reason   text
) returns public.quote_versions
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote public.quotes;
    v_actor bigint := public.current_sale_id();
    v_last  public.quote_versions;
    v_new   public.quote_versions;
begin
    -- A revision without a stated motive leaves the version chain legible and
    -- the reason for it lost, which is half an audit trail.
    if coalesce(btrim(p_reason), '') = '' then
        raise exception 'a reason is required to revise a quote'
            using errcode = 'check_violation', detail = 'quote_reason_required';
    end if;

    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to revise quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    -- `quote_versions_one_draft` would refuse the insert anyway; saying so here
    -- turns a unique-violation into an answer the UI can render.
    if exists (select 1 from public.quote_versions v
                where v.quote_id = p_quote_id and v.issued_at is null) then
        raise exception 'quote % already has an editable draft', p_quote_id
            using errcode = 'check_violation', detail = 'quote_draft_exists';
    end if;

    select * into v_last
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is not null
     order by v.version_number desc
     limit 1;
    if not found then
        raise exception 'quote % has no issued version to revise', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    -- The status moves FIRST: lines may only be written while the quote is a
    -- draft (`quote_lines_freeze_guard`), and the clone below writes lines. It
    -- also means an illegal revision -- of an accepted quote, say -- is refused
    -- before anything has been copied.
    perform public.apply_quote_status(
        p_quote_id, 'draft', p_reason, 'internal', v_actor, null, null);

    insert into public.quote_versions
        (quote_id, currency, version_number, valid_until, terms, discount_percent)
    select v.quote_id, v.currency, v.version_number + 1,
           v.valid_until, v.terms, v.discount_percent
      from public.quote_versions v where v.id = v_last.id
    returning * into v_new;

    insert into public.quote_lines
        (version_id, quote_id, product_id, sku, name, description, unit,
         quantity, unit_price, discount_percent, tax_rate_id, tax_rate_percent,
         "position")
    select v_new.id, l.quote_id, l.product_id, l.sku, l.name, l.description,
           l.unit, l.quantity, l.unit_price, l.discount_percent, l.tax_rate_id,
           l.tax_rate_percent, l."position"
      from public.quote_lines l
     where l.version_id = v_last.id
     order by l."position", l.id;

    -- The links are NOT revoked (they were, until links became the quote's).
    -- The customer keeps reading the last issued document while this draft is
    -- worked on, and cannot answer it: the quote is `draft` now, and the status
    -- machine has no customer edge out of `draft`. Issuing the draft supersedes
    -- that document and the same link shows the new one.
    return v_new;
end;
$$;

create or replace function public.quote_portal_target_version(
    p_quote_id       bigint,
    p_version_number integer
) returns bigint
    language sql stable security definer
    set search_path to ''
as $$
    select v.id
      from public.quote_versions v
     where v.quote_id = p_quote_id
       and v.issued_at is not null
     order by (v.version_number = p_version_number) desc nulls last,
              v.version_number desc
     limit 1;
$$;

create or replace function public.quote_portal_document(p_version_id bigint)
returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select doc.body || jsonb_build_object(
               'etag', encode(sha256(convert_to(doc.body::text, 'UTF8')), 'hex'))
      from (
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
        -- The shared thread of the QUOTE, every version's, oldest first (§2.5):
        -- a negotiation outlives the version it started on. Never an internal
        -- comment, never a deleted one, and of each author only what the page
        -- prints -- the kind and a display name. A team member is named by
        -- their `sales` row, as the owner is; a customer by the name they
        -- signed with. The customer's email stays with the team: whoever else
        -- holds the link has no business reading it.
        'comments', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'author_kind', c.author_kind,
                       'author_name', case c.author_kind
                                          when 'customer' then c.author_name
                                          else nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), '')
                                      end,
                       'body',        c.body,
                       'created_at',  c.created_at,
                       'edited_at',   c.edited_at)
                   order by c.created_at, c.id)
              from public.quote_comments c
              left join public.sales s on s.id = c.author_sales_id
             where c.quote_id = q.id
               and c.visibility = 'shared'
               and c.deleted_at is null), '[]'::jsonb),
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
        -- The slides frozen at issue; a version issued before the deck
        -- existed has none.
        'slides', coalesce(v.slides, '[]'::jsonb),
        -- The default template: the designed presentation the build ships.
        'standard_presentation', v.standard_presentation,
        -- Every document this quotation has been, newest first: what the
        -- portal's version selector offers (2026-09-29). Issued versions ONLY
        -- -- a draft is not a document, and the list must not even say that
        -- one exists. Per version, what the customer needs to tell them apart:
        -- the number, the day it was sent, whether it is the one on offer and
        -- how it was answered. No totals: a version's figure is read by
        -- opening it.
        'versions', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'number',     o.version_number,
                       'issued_at',  o.issued_at,
                       'is_current', o.superseded_at is null,
                       'outcome',    case
                                         when o.accepted_at is not null then 'accepted'
                                         when o.rejected_at is not null then 'rejected'
                                     end)
                   order by o.version_number desc)
              from public.quote_versions o
             where o.quote_id = q.id
               and o.issued_at is not null), '[]'::jsonb),
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
                   and t.allowed_actor in ('customer', 'any')),
            -- The thread stays open while the negotiation does: a quote whose
            -- status is not terminal. Read off `quote_statuses.is_terminal`,
            -- never a list of statuses, and read HERE by
            -- `quote_portal_comment()` too, so the form and the refusal are one
            -- predicate. The thread is the QUOTE's, so reading an older version
            -- does not close it (it did while a link was a version's).
            'can_comment', exists (
                select 1 from public.quote_statuses st
                 where st.key = q.status_key
                   and not st.is_terminal)),
        'acceptance', jsonb_build_object(
            'accepted_at',      v.accepted_at,
            'accepted_by_name', v.accepted_by_name,
            'rejected_at',      v.rejected_at)) as body
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
       and v.issued_at is not null
      ) doc;
$$;

create or replace function public.quote_portal_comment(
    p_token_hash bytea,
    p_body       text,
    p_name       text,
    p_email      text default null,
    p_ip_address inet default null,
    p_user_agent text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_max_comments constant integer  := 20;
    v_window       constant interval := interval '1 hour';
    v_body     text := nullif(btrim(coalesce(p_body, '')), '');
    v_name     text := nullif(btrim(coalesce(p_name, '')), '');
    v_email    text := nullif(btrim(coalesce(p_email, '')), '');
    v_access   jsonb;
    v_token_id bigint;
    v_version  public.quote_versions;
    v_recent   integer;
begin
    if char_length(coalesce(v_body, '')) > 4000
       or char_length(coalesce(v_name, '')) > 200
       or char_length(coalesce(v_email, '')) > 320 then
        raise exception 'a portal comment exceeds its length limit'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_input_too_long';
    end if;

    if v_body is null then
        raise exception 'a comment needs a body'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_body_required';
    end if;

    if v_name is null then
        raise exception 'a name is required to sign a comment'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_name_required';
    end if;

    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'the email a comment is signed with is not valid'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_email_invalid';
    end if;

    v_access := public.quote_portal_resolve(p_token_hash, p_ip_address, p_user_agent);
    if v_access ? 'error' then
        return v_access;
    end if;
    v_token_id := (v_access ->> 'token_id')::bigint;

    select * into v_version from public.quote_versions v
     where v.id = public.quote_portal_target_version(
                      (v_access ->> 'quote_id')::bigint, null);

    if not coalesce((public.quote_portal_document(v_version.id)
                       -> 'actions' ->> 'can_comment')::boolean, false) then
        raise exception 'the thread of quote % is closed to the customer', v_version.quote_id
            using errcode = 'check_violation',
                  detail  = 'quote_portal_comments_closed';
    end if;

    -- Counted up to the limit and no further, as the request throttle counts.
    select count(*) into v_recent
      from (select 1 from public.quote_portal_events e
             where e.token_id = v_token_id
               and e.event_type = 'commented'
               and e.occurred_at > clock_timestamp() - v_window
             limit v_max_comments) recent;

    if v_recent >= v_max_comments then
        raise exception 'link % has written % comments within %',
                v_token_id, v_max_comments, v_window
            using errcode = 'check_violation',
                  detail  = 'quote_portal_comment_limit';
    end if;

    insert into public.quote_comments
        (quote_id, version_id, author_kind, author_name, author_email, visibility, body)
    values (v_version.quote_id, v_version.id, 'customer', v_name, v_email, 'shared', v_body);

    perform public.quote_portal_log(
        v_version.quote_id, v_version.id, v_token_id, 'commented',
        p_ip_address, p_user_agent, v_name, v_email,
        jsonb_build_object('version_number', v_version.version_number));

    return public.quote_portal_document(v_version.id);
end;
$$;

create or replace function public.sync_deal_from_quote(
    p_quote_id bigint,
    p_trigger  text
) returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote       public.quotes;
    v_rule        public.deal_quote_stage_rules;
    v_deal        public.deals;
    v_is_closed   boolean;
    v_total       numeric;
    v_is_fixed    boolean;
    v_index       integer;
begin
    select * into v_quote from public.quotes where id = p_quote_id;
    if not found or v_quote.deal_id is null then
        return;
    end if;

    select * into v_rule from public.deal_quote_stage_rules where trigger_key = p_trigger;
    if not found then
        return;
    end if;

    -- Serialises two quotations acting on one deal at the same time.
    select * into v_deal from public.deals where id = v_quote.deal_id for update;
    if not found or v_deal.archived_at is not null then
        return;
    end if;

    v_is_closed := exists (
        select 1 from public.deal_quote_stage_rules r
         where r.closes and r.to_stage = v_deal.stage);

    -- A renegotiation reopens what its own refusal closed (2026-09-29). When
    -- the deal's LAST move was this quotation closing it, and nobody has moved
    -- the deal since, sending the renegotiated version is the same negotiation
    -- going on -- not a quotation dragging a closed deal back. Any later move,
    -- by a person or by another quotation, keeps the deal closed.
    if v_is_closed and p_trigger = 'sent' then
        v_is_closed := not exists (
            select 1
              from (select c.source, c.quote_id
                      from public.deal_stage_changes c
                     where c.deal_id = v_deal.id
                     order by c.changed_at desc, c.id desc
                     limit 1) last_move
             where last_move.source = 'quote'
               and last_move.quote_id = p_quote_id);
    end if;

    -- The amount: the total of the version the customer was sent, and fixed
    -- once a quotation of this deal was accepted (a later proposal on the same
    -- deal does not rewrite a sale already made).
    if p_trigger in ('sent', 'accepted') and not v_is_closed then
        v_is_fixed := exists (
            select 1 from public.quotes q
              join public.quote_statuses st on st.key = q.status_key
             where q.id = v_deal.amount_source_quote_id
               and q.id <> p_quote_id
               and st.counts_as_won);
        if not v_is_fixed then
            select v.total into v_total
              from public.quote_versions v
             where v.quote_id = p_quote_id
               and v.issued_at is not null
               and v.superseded_at is null
             order by v.version_number desc
             limit 1;
            if v_total is not null then
                -- `deals.amount` is a whole number; the quotation keeps the cents.
                update public.deals
                   set amount = round(v_total)::bigint,
                       amount_source_quote_id = p_quote_id,
                       updated_at = now()
                 where id = v_deal.id
                   and (amount is distinct from round(v_total)::bigint
                        or amount_source_quote_id is distinct from p_quote_id);
            end if;
        end if;
    end if;

    if v_is_closed or v_deal.stage = v_rule.to_stage then
        return;
    end if;

    if v_rule.only_if_no_open_quote and exists (
        select 1 from public.quotes q
          join public.quote_statuses st on st.key = q.status_key
         where q.deal_id = v_deal.id
           and q.id <> p_quote_id
           and st.is_open) then
        return;
    end if;

    -- On top of its new column, where the board shows what just happened.
    select coalesce(min(d.index), 0) - 1 into v_index
      from public.deals d
     where d.stage = v_rule.to_stage and d.archived_at is null;

    perform set_config('app.deal_stage_reason', 'quote:' || p_trigger, true);
    perform set_config('app.deal_stage_deal_id', v_deal.id::text, true);
    perform set_config('app.deal_stage_source', 'quote', true);
    perform set_config('app.deal_stage_quote_id', p_quote_id::text, true);

    update public.deals
       set stage = v_rule.to_stage,
           index = greatest(v_index, -32768),
           updated_at = now()
     where id = v_deal.id;

    perform set_config('app.deal_stage_reason', '', true);
    perform set_config('app.deal_stage_deal_id', '', true);
    perform set_config('app.deal_stage_source', '', true);
    perform set_config('app.deal_stage_quote_id', '', true);
end;
$$;

--
-- The portal functions that gained `p_version_number`: dropped, not replaced,
-- because a new defaulted parameter would create a second overload and make
-- every existing call ambiguous.
--

drop function public.quote_portal_accept(bytea, text, text, inet, text);
drop function public.quote_portal_reject(bytea, text, text, text, text, inet, text);
drop function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text);
drop function public.quote_portal_view(bytea, inet, text);
drop function public.quote_portal_version(bytea);

create or replace function public.quote_portal_view(
    p_token_hash     bytea,
    p_ip_address     inet    default null,
    p_user_agent     text    default null,
    p_version_number integer default null
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
     where v.id = public.quote_portal_target_version(v_quote.id, p_version_number);

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

create or replace function public.quote_portal_begin_answer(
    p_token_hash     bytea,
    p_name           text,
    p_email          text,
    p_party_required boolean,
    p_ip_address     inet,
    p_user_agent     text,
    p_version_number integer default null
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

    if p_version_number is null then
        select * into v_version from public.quote_versions v
         where v.id = (v_access ->> 'version_id')::bigint;
    else
        select * into v_version from public.quote_versions v
         where v.quote_id = (v_access ->> 'quote_id')::bigint
           and v.version_number = p_version_number
           and v.issued_at is not null;
        if not found then
            raise exception 'quote % has no issued version %',
                    v_access ->> 'quote_id', p_version_number
                using errcode = 'check_violation', detail = 'quote_version_superseded';
        end if;
    end if;

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

    return v_access || jsonb_build_object(
        'version_id', v_version.id, 'name', v_name, 'email', v_email);
end;
$$;

create or replace function public.quote_portal_accept(
    p_token_hash     bytea,
    p_name           text,
    p_email          text,
    p_ip_address     inet    default null,
    p_user_agent     text    default null,
    p_version_number integer default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_answer  jsonb;
    v_version public.quote_versions;
begin
    v_answer := public.quote_portal_begin_answer(
        p_token_hash, p_name, p_email, true, p_ip_address, p_user_agent,
        p_version_number);
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

create or replace function public.quote_portal_reject(
    p_token_hash     bytea,
    p_reason_code    text,
    p_reason         text    default null,
    p_name           text    default null,
    p_email          text    default null,
    p_ip_address     inet    default null,
    p_user_agent     text    default null,
    p_version_number integer default null
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
        p_token_hash, p_name, p_email, false, p_ip_address, p_user_agent,
        p_version_number);
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

create or replace function public.quote_portal_version(
    p_token_hash     bytea,
    p_version_number integer default null
) returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select coalesce(
        (select jsonb_build_object(
                    'etag', public.quote_portal_document(
                                public.quote_portal_target_version(
                                    t.quote_id, p_version_number)) ->> 'etag')
           from public.quote_access_tokens t
          where t.token_hash = p_token_hash
            and t.revoked_at is null
            and t.expires_at > now()),
        jsonb_build_object('error', 'quote_link_invalid'));
$$;

--
-- Grants (06_grants.sql)
--

revoke all on function public.quote_share_link(bigint, boolean) from public, anon;
grant execute on function public.quote_share_link(bigint, boolean) to authenticated, service_role;

revoke all on function public.ensure_quote_share_link(bigint) from public, anon, authenticated;
revoke all on function public.quote_portal_target_version(bigint, integer) from public, anon, authenticated;
revoke all on function public.quote_portal_view(bytea, inet, text, integer) from public, anon, authenticated;
revoke all on function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text, integer) from public, anon, authenticated;
revoke all on function public.quote_portal_accept(bytea, text, text, inet, text, integer) from public, anon, authenticated;
revoke all on function public.quote_portal_reject(bytea, text, text, text, text, inet, text, integer) from public, anon, authenticated;
revoke all on function public.quote_portal_version(bytea, integer) from public, anon, authenticated;

grant execute on function public.ensure_quote_share_link(bigint) to service_role;
grant execute on function public.quote_portal_target_version(bigint, integer) to service_role;
grant execute on function public.quote_portal_view(bytea, inet, text, integer) to service_role;
grant execute on function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text, integer) to service_role;
grant execute on function public.quote_portal_accept(bytea, text, text, inet, text, integer) to service_role;
grant execute on function public.quote_portal_reject(bytea, text, text, text, text, inet, text, integer) to service_role;
grant execute on function public.quote_portal_version(bytea, integer) to service_role;
