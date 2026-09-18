--
-- Quotes / CPQ module, Phase 8: the comment thread, on both sides.
--
-- docs/proposals/quotes-cpq-module.md §2.5 and §6. The team writes internal
-- remarks and messages it shares with the customer; the customer writes back
-- from the portal link. §13.6 #6 closes here: an edit is stamped, the thread is
-- one level deep, and a customer comment can be marked read.
--
--   quote_comments_before_insert()   authorship, depth and clock are the server's
--   quote_comments_before_update()   an edit, a soft delete or a read mark; nothing else
--   mark_quote_comments_read()       the team has read what the customer wrote
--   quote_portal_document()          the payload gains `comments` and `actions.can_comment`
--   quote_portal_comment()           the customer writes, through the edge function
--
-- A comment is deleted SOFTLY: the author's delete policy and the DELETE
-- privilege go, because a shared message may already have been read and
-- `parent_id` would cascade a hard delete into other people's replies.
--
-- No table changes. `quote_comments` (with `edited_at`, `deleted_at` and
-- `read_by_internal_at`) and the `commented` portal event were built in Phase 2.
--
-- The functions, the trigger, the policy and the grants are expanded verbatim
-- from `supabase/schemas/02_functions.sql`, `04_triggers.sql`,
-- `05_policies.sql` and `06_grants.sql`, where the same objects live.
--

-- BEFORE INSERT on quote_comments: the currency carrier, the author, the thread
-- and the clock.
create or replace function public.quote_comments_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_parent public.quote_comments;
begin
    if new.currency is null then
        select q.currency into new.currency
          from public.quotes q where q.id = new.quote_id;
    end if;

    -- Authorship comes from the session, never from the request body: a client
    -- that could name its own author could forge a colleague's remark. A
    -- CUSTOMER comment is not written through this path at all -- it arrives
    -- through the portal function, which holds the service role -- and the
    -- `quote_comments_author` constraint refuses to attribute one to a `sales`
    -- row whatever gets posted here.
    --
    -- An internal comment is signed by its `sales` row and by nothing else: a
    -- name typed into the request would be the name the portal shows the
    -- customer.
    if new.author_kind = 'internal' then
        new.author_sales_id := public.current_sale_id();
        new.author_name     := null;
        new.author_email    := null;
    end if;

    -- One level of replies (§2.5), on the same quote. A reply to a reply is
    -- re-parented to the root rather than refused, the rule
    -- `task_comments_before_insert()` follows. A parent on ANOTHER quote is
    -- refused: `parent_id` cascades on delete, so a thread spanning two quotes
    -- is one purge away from removing the other quote's messages.
    if new.parent_id is not null then
        select * into v_parent from public.quote_comments c where c.id = new.parent_id;
        if not found or v_parent.quote_id is distinct from new.quote_id then
            raise exception 'comment % is not on quote %', new.parent_id, new.quote_id
                using errcode = 'check_violation', detail = 'quote_comment_parent_invalid';
        end if;
        new.parent_id := coalesce(v_parent.parent_id, v_parent.id);
    end if;

    -- What the thread is read by comes from the server: a comment posted with
    -- last month's date would reorder a negotiation, and one posted as already
    -- read would never raise the attention badge.
    new.created_at          := now();
    new.edited_at           := null;
    new.deleted_at          := null;
    new.read_by_internal_at := null;

    return new;
end;
$$;

-- BEFORE UPDATE on quote_comments: what a written comment still accepts.
--
-- A comment is a message somebody may already have read, so the only changes
-- are the ones that say what happened to it:
--
--   * its author edits the BODY of an internal comment, which stamps
--     `edited_at` on the server's clock, so "edited" can be neither faked nor
--     hidden -- the portal shows it to the customer too;
--   * its author deletes it SOFTLY, `deleted_at` stamped the same way. There is
--     no hard delete (no policy, no privilege): the row stays as a tombstone in
--     the team's thread and leaves the customer's;
--   * somebody on the team marks a CUSTOMER comment read, through
--     `mark_quote_comments_read()` -- the only change a customer comment accepts
--     at all. A customer's words are the other side's record of the
--     negotiation, and nobody on this side rewrites or removes them.
--
-- Everything else -- the quote, the author, the audience, the thread, the date
-- -- is refused, and so is any change to a deleted comment. Values are compared
-- rather than column names refused, because react-admin posts the whole record
-- back.
--
-- WHO may update is the row level security's decision: the author, for an
-- internal comment; nobody signed in, for a customer's. That is why the read
-- mark is a function.
create or replace function public.quote_comments_before_update() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if old.deleted_at is not null
       or new.quote_id        is distinct from old.quote_id
       or new.currency        is distinct from old.currency
       or new.version_id      is distinct from old.version_id
       or new.parent_id       is distinct from old.parent_id
       or new.author_sales_id is distinct from old.author_sales_id
       or new.author_kind     is distinct from old.author_kind
       or new.author_name     is distinct from old.author_name
       or new.author_email    is distinct from old.author_email
       or new.visibility      is distinct from old.visibility
       or new.created_at      is distinct from old.created_at
       or new.edited_at       is distinct from old.edited_at
       or (old.author_kind = 'customer'
           and (new.body is distinct from old.body
                or new.deleted_at is distinct from old.deleted_at))
       or (old.author_kind = 'internal'
           and new.read_by_internal_at is distinct from old.read_by_internal_at) then
        raise exception 'quote comment % cannot be changed that way', old.id
            using errcode = 'check_violation', detail = 'quote_comment_column_protected';
    end if;

    if new.body is distinct from old.body then
        new.edited_at := now();
    end if;

    if new.deleted_at is not null then
        new.deleted_at := now();
    end if;

    return new;
end;
$$;

-- Somebody on the team has read what the customer wrote (§11's attention badge,
-- `quotes_summary.nb_unanswered_customer_comments`). `authenticated`, restating
-- the quote capability check.
--
-- A function because no policy can say it: a comment update belongs to its
-- author, and a customer comment has no author on this side. Marks every unread
-- customer comment of the quote and returns how many; an already-read thread is
-- 0, not an error.
create or replace function public.mark_quote_comments_read(p_quote_id bigint)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    if not exists (select 1 from public.quotes q where q.id = p_quote_id) then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_see_quote(p_quote_id)) then
        raise exception 'no permission on quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    update public.quote_comments c
       set read_by_internal_at = now()
     where c.quote_id = p_quote_id
       and c.author_kind = 'customer'
       and c.read_by_internal_at is null
       and c.deleted_at is null;
    get diagnostics v_count = row_count;

    return v_count;
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
-- Null for a draft: a draft is not a document. The change-detection etag
-- (Phase 9) joins the payload with the poll that reads it.
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

-- The customer writes to the team (§2.5, Phase 8).
--
-- The comment is `customer`-authored and `shared` -- the only shape
-- `quote_comments_author` lets a customer comment take -- signed with the name
-- the customer typed, and filed under the version the link opens. In the order
-- the answers use, under the quote's lock:
--
--   1. the input: a body, a name to sign it with (the table requires one), an
--      optional email that is one, and the lengths. The signature follows the
--      rules and keys of `quote_portal_begin_answer()`; the body is capped at
--      4000 characters, inside the table's 8000, so a message in any script
--      fits the edge function's 16 KB request;
--   2. the link is alive, through `quote_portal_resolve()` and its throttle;
--   3. the thread is open (`quote_portal_comments_closed`), which is the
--      payload's own `actions.can_comment` -- read from the document rather than
--      restated, so the form and the refusal cannot disagree. A customer who
--      accepted, declined or holds a superseded link still READS the thread;
--   4. the link has not written `v_max_comments` comments in `v_window`
--      (`quote_portal_comment_limit`). Nobody can edit or delete a customer
--      comment, so a leaked link must not be able to bury a negotiation under
--      messages nobody can remove -- and the request throttle is a reader's
--      pace, thirty a minute, not a writer's.
--
-- The `commented` event carries the address and the browser, as every act on
-- the portal does; the comment row carries neither. Notifying the owner is
-- Phase 11 -- until then `quotes_summary.nb_unanswered_customer_comments` is
-- the signal.
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
     where v.id = (v_access ->> 'version_id')::bigint;

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

-- What a written comment still accepts: an edit, a soft delete, a read mark.
create or replace trigger quote_comments_before_update
    before update on public.quote_comments
    for each row execute function public.quote_comments_before_update();

-- Comments are deleted softly (see `quote_comments_before_update()`): no delete
-- policy and no DELETE privilege.
drop policy "Quote comments are deleted by their author" on public.quote_comments;
revoke delete on table public.quote_comments from authenticated;

revoke all on function public.mark_quote_comments_read(bigint) from public, anon;
grant execute on function public.mark_quote_comments_read(bigint) to authenticated, service_role;
revoke all on function public.quote_comments_before_update() from public, anon, authenticated;
grant execute on function public.quote_comments_before_update() to service_role;
revoke all on function public.quote_portal_comment(bytea, text, text, text, inet, text) from public, anon, authenticated;
grant execute on function public.quote_portal_comment(bytea, text, text, text, inet, text) to service_role;
