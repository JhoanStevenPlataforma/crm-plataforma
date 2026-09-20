--
-- Quotes / CPQ module, Phase 9: real time.
--
-- docs/proposals/quotes-cpq-module.md §6.5 and D2. Two mechanisms, because the
-- two audiences are authenticated differently:
--
--   * the TEAM's screens subscribe to Supabase Realtime. `quotes`,
--     `quote_comments` and `quote_portal_events` join the `supabase_realtime`
--     publication. Realtime honours row level security, and every one of the
--     three already has an `authenticated` select policy that follows the
--     quote, so publishing them widens nothing: a rep is sent the changes of
--     the quotes they can read, and no others.
--   * the CUSTOMER's page cannot: it has no session, and no policy grants
--     `anon` (F2), so an anonymous socket would receive nothing. It polls the
--     edge function instead, which asks `quote_portal_version()`.
--
--   quote_portal_document()   the payload gains `etag`, the hash of the rest of it
--   quote_portal_version()    the poll: the etag, and nothing written
--
-- `quote_lines` is NOT published: a line edit is one author's own form, and
-- streaming it would deliver on every save something nobody is waiting for.
--
-- No `replica identity full`, which §6.5 asked for. The team's screens only
-- learn THAT a row changed and refetch it through the data provider; nothing
-- reads the old row a full identity would ship, and on `quotes` and
-- `quote_comments` it would write the whole previous row to the WAL on every
-- update. Checked against the local Realtime before deciding: an update with
-- the default identity is delivered, filtered by `quote_id` and by row level
-- security, exactly as an insert is.
--
-- The functions and the grants are expanded verbatim from
-- `supabase/schemas/02_functions.sql` and `06_grants.sql`. The publication is
-- not there, and must not be: a publication membership is cluster state, not
-- declarative schema (the reasoning of `20260805121000`).
--

-- The payload: one issued version, as the customer may see it (§6.3).
--
-- EVERY KEY BUILT HERE IS A PUBLIC DISCLOSURE. There is no row level security
-- behind this read -- the service role reads everything -- so a column named
-- below reaches anybody holding the link, and a typo is a data leak. That is
-- the price of D1, and building the payload in SQL is what makes it payable:
-- `quote_portal.test.sql` pins the exact key set of every group and asserts
-- what must never appear (the internal notes of the quote and of every
-- product, internal and deleted comments, the team's emails, the commenting
-- customer's email, the deal, internal ids, the customer's address, the token
-- and its hash). A key added here without its assertion turns that test red on
-- purpose.
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
-- `etag` (Phase 9, §6.5) is the sha256 of the rest of the payload, so it
-- changes exactly when what the customer can see changes, and for no other
-- reason. Not a list of columns: a second description of the payload is one
-- that drifts -- §6.3's `max(comment.created_at)` already missed an edit and a
-- soft delete -- and a column like `quotes.updated_at` would move on an
-- internal note, telling whoever holds the link that the team is at work on
-- something they cannot see. Nothing a portal request itself writes (a view, a
-- counter, `last_seen_at`) is in the payload, which is what keeps a poll from
-- refetching forever.
--
-- Null for a draft: a draft is not a document.
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
            -- The thread stays open while the negotiation does: the live
            -- version of a quote whose status is not terminal. Read off
            -- `quote_statuses.is_terminal`, never a list of statuses, and read
            -- HERE by `quote_portal_comment()` too, so the form and the refusal
            -- are one predicate.
            'can_comment', v.superseded_at is null and exists (
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

-- Has the document changed? The portal's poll (Phase 9, §6.5).
--
-- The page asks every ten seconds while it is on screen, and fetches the
-- document again -- through `quote_portal_view()`, which records it -- only
-- when the answer differs from the `etag` of the payload it shows.
--
-- WRITES NOTHING, and takes no lock. A tab left open overnight asks 8,640
-- times; recorded as views, that is a trail nobody can read and a view counter
-- that means nothing. For the same reason it is not throttled: the throttle is
-- a count of what the portal WROTE. What this function discloses is one hash of
-- a document the caller can already open, so the cost of a hammered link is
-- one document built per call, bounded by the gateway in front.
--
-- A dead link gets the answer `quote_portal_resolve()` gives it, without the
-- trace: the page stops asking and says so, and it is a reload -- a real open
-- -- that records the attempt as `token_invalid`.
create or replace function public.quote_portal_version(p_token_hash bytea)
returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select coalesce(
        (select jsonb_build_object(
                    'etag', public.quote_portal_document(t.version_id) ->> 'etag')
           from public.quote_access_tokens t
          where t.token_hash = p_token_hash
            and t.revoked_at is null
            and t.expires_at > now()),
        jsonb_build_object('error', 'quote_link_invalid'));
$$;

revoke all on function public.quote_portal_version(bytea) from public, anon, authenticated;
grant execute on function public.quote_portal_version(bytea) to service_role;

--
-- The publication. The idempotent block of `20260805121000`, once per table.
--
do $$
begin
    alter publication supabase_realtime add table public.quotes;
exception
    when duplicate_object then null;   -- already published
    when undefined_object then
        raise warning 'publication supabase_realtime missing: quote screens will not update live';
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.quote_comments;
exception
    when duplicate_object then null;
    when undefined_object then
        raise warning 'publication supabase_realtime missing: quote threads will not update live';
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.quote_portal_events;
exception
    when duplicate_object then null;
    when undefined_object then
        raise warning 'publication supabase_realtime missing: customer activity will not show live';
end;
$$;
