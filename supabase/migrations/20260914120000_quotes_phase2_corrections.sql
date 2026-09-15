--
-- Quotes / CPQ module: corrections to the Phase 2 data model.
--
-- docs/proposals/quotes-cpq-module.md §13.6 lists five defects found in Phase 2
-- while its as-built contract was being written (items 1-4 and 11). They are
-- fixed here, before any screen depends on the broken contract:
--
--   1. `requires_reason_above` is enforced. `quote_discount_gate()` reports
--      `reason_required`; `issue_quote_version()` gains `p_reason`, refuses an
--      in-band discount without one, and stores it on the `sent` history row.
--   2. `revoke_quote_token()` returns nothing instead of a row carrying
--      `token_hash`.
--   3. `quotes.valid_until` / `terms` mirror the current version
--      (`quote_versions_sync_header`) and are no longer editable on the header
--      (`quotes_header_guard`), so the sweeper expires on the document's date.
--   4. `create_quote_link()` mints another link for the live issued version.
--      Minting moves into `mint_quote_token()`, shared with the issue.
--  11. Users can no longer delete a quote: the delete policy and the DELETE
--      privilege are gone. A quote ends as `canceled`.
--
-- Functions, triggers, policies and grants are copied verbatim from
-- `supabase/schemas/0{2,4,5,6}_*.sql`, where the same objects now live.
--

--
-- 11. No quote is deleted.
--
drop policy "Quotes are deleted by their owner or a manager" on public.quotes;
revoke delete on table public.quotes from authenticated;

--
-- 3. The header mirrors the current version.
--
-- The header's `valid_until` and `terms`, kept equal to the current version's.
--
-- Both columns exist on the quote AND on each version. The version is the
-- source: it is what the document prints and what a link's expiry is clamped
-- to. The header copy exists for `quotes_expiring_idx` -- the sweeper's only
-- query -- and for the list, so it must say what the CURRENT version says: the
-- draft while there is one, otherwise the newest issued document. Two writable
-- copies meant a quote could print one date and expire on another.
--
-- AFTER INSERT OR UPDATE OF valid_until, terms on quote_versions. Issued
-- versions are frozen, so the row firing this is always the newest one.
create or replace function public.quote_versions_sync_header() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    perform set_config('app.quote_header_sync', new.quote_id::text, true);

    update public.quotes q
       set valid_until = new.valid_until,
           terms       = new.terms
     where q.id = new.quote_id
       and (q.valid_until is distinct from new.valid_until
            or q.terms is distinct from new.terms);

    perform set_config('app.quote_header_sync', '', true);

    return null;
end;
$$;

-- BEFORE UPDATE on quotes: the header copy is not a second place to type.
--
-- A client writes `valid_until` / `terms` on INSERT, where they seed version 1,
-- and on the draft version after that. The trigger's WHEN clause compares
-- values, so a record posted back unchanged -- react-admin's habit -- passes.
create or replace function public.quotes_header_guard() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if coalesce(current_setting('app.quote_header_sync', true), '') <> old.id::text then
        raise exception 'valid_until and terms of quote % belong to its current version: edit the draft version',
                old.id
            using errcode = 'check_violation', detail = 'quote_header_derived';
    end if;
    return new;
end;
$$;

-- Existing quotes adopt their current version's values BEFORE the guard exists;
-- from then on only the mirror writes them.
update public.quotes q
   set valid_until = cv.valid_until,
       terms       = cv.terms
  from (select distinct on (v.quote_id) v.quote_id, v.valid_until, v.terms
          from public.quote_versions v
         order by v.quote_id, v.version_number desc) cv
 where cv.quote_id = q.id
   and (q.valid_until is distinct from cv.valid_until
        or q.terms is distinct from cv.terms);

-- `valid_until` / `terms` on the header mirror the current version and are
-- edited there, never here.
create or replace trigger quotes_header_guard
    before update on public.quotes
    for each row
    when (old.valid_until is distinct from new.valid_until
          or old.terms is distinct from new.terms)
    execute function public.quotes_header_guard();

-- The header's `valid_until` / `terms` follow the current version.
create or replace trigger quote_versions_sync_header
    after insert or update of valid_until, terms on public.quote_versions
    for each row execute function public.quote_versions_sync_header();

revoke all on function public.quote_versions_sync_header() from public, anon, authenticated;
revoke all on function public.quotes_header_guard() from public, anon, authenticated;
grant execute on function public.quote_versions_sync_header() to service_role;
grant execute on function public.quotes_header_guard() to service_role;

--
-- 1. The reason band, and 4. another link.
--
--
-- Discount approval (§3.1)
--
-- ONE function with TWO callers -- the RPC that enforces it and the dialog that
-- explains it. Two implementations of one rule drift, and always in the same
-- direction: a dialog enabling a button for something the server then refuses.
--
-- `max_allowed: null` with `ok: true` reports "no rule applies" SEPARATELY from
-- "satisfied", because they are different facts and only one of them means the
-- control is working.
--
-- The effective discount is read off the LINES, not off
-- `quote_versions.discount_percent`: that column is a record of intent, and the
-- commercial control has to be based on what the document actually grants.
--
-- SECURITY DEFINER to read `quotes` and `quote_lines` regardless of who asks, so
-- the number is the same for a rep and for the manager auditing them. The quotes
-- select policy is therefore restated here -- without it this is a probe for the
-- existence of other people's quotes.
create or replace function public.quote_discount_gate(p_quote_id bigint)
returns jsonb
    language plpgsql stable security definer
    set search_path to ''
as $$
declare
    v_quote     public.quotes;
    v_role      public.sales_role;
    v_rule      public.quote_discount_rules;
    v_rule_found boolean;
    v_max       numeric(5,2);
    v_approver_max  numeric(5,2);
    v_approver_role public.sales_role;
    v_approval_reason text;
    v_version_id bigint;
    v_gross     numeric(14,2);
    v_disc      numeric(14,2);
    v_effective numeric(5,2);
    v_offending bigint[];
    v_reason_required boolean;
begin
    select * into v_quote from public.quotes where id = p_quote_id;
    if not found or not (select public.can_see_quote(p_quote_id)) then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- The role of the person ASKING, which is also the person who would issue.
    v_role := (select public.current_sales_role());

    -- The current version: the draft when there is one, otherwise the newest
    -- issued document. `revise_quote()` numbers a new draft max + 1, so the
    -- highest number is always the one being worked on.
    select v.id into v_version_id
      from public.quote_versions v
     where v.quote_id = p_quote_id
     order by v.version_number desc
     limit 1;

    select coalesce(sum(l.line_gross), 0), coalesce(sum(l.line_discount), 0)
      into v_gross, v_disc
      from public.quote_lines l
     where l.version_id = v_version_id;

    v_effective := case when coalesce(v_gross, 0) = 0 then 0
                        else round(v_disc * 100 / v_gross, 2) end;

    select * into v_rule
      from public.quote_discount_rules r where r.role = v_role;
    v_rule_found := found;

    -- No role (a service-role caller), no rule for it, the rule not switched on
    -- yet, or a quote created before it was: the issue is free. Reported with
    -- `max_allowed: null` so a caller can tell "no rule applies here" from
    -- "the rule is satisfied".
    if v_role is null
       or not v_rule_found
       or v_rule.enforced_from is null
       or v_quote.created_at < v_rule.enforced_from then
        return jsonb_build_object(
            'quote_id', p_quote_id,
            'role', v_role,
            'max_allowed', null,
            'effective_discount_percent', v_effective,
            'ok', true,
            'reason_required', false,
            'requires_reason_above', null,
            'since', v_rule.enforced_from,
            'offending_line_ids', '[]'::jsonb);
    end if;

    v_max := v_rule.max_discount_percent;

    -- AN APPROVAL RAISES THE CEILING TO THE APPROVER'S. That is what
    -- `pending_approval -> approved` is for: a rep whose limit is 10% sends the
    -- quote up, a manager signs off, and the rep may then issue at up to the
    -- manager's 25%. Never lower than the asker's own ceiling -- an approval by
    -- somebody with a smaller limit is not a reason to refuse what the asker
    -- could have issued alone.
    --
    -- The latest approval is the one that counts, and it certifies exactly the
    -- lines it saw: `quote_lines_freeze_guard` refuses line edits once the quote
    -- has left 'draft', so the only way to change them is to send the quote back,
    -- and the next approval is a new row.
    if v_quote.status_key = 'approved' then
        select r.max_discount_percent, s.role, nullif(btrim(sc.reason), '')
          into v_approver_max, v_approver_role, v_approval_reason
          from public.quote_status_changes sc
          join public.sales s on s.id = sc.sales_id
          left join public.quote_discount_rules r on r.role = s.role
         where sc.quote_id = p_quote_id
           and sc.to_status = 'approved'
         order by sc.seq desc
         limit 1;

        if v_approver_max is not null and v_approver_max > v_max then
            v_max := v_approver_max;
        end if;
    end if;

    -- Which lines to point the user at. The aggregate decides the verdict; this
    -- is what lets the dialog say WHERE the problem is instead of only that
    -- there is one.
    select coalesce(array_agg(l.id order by l."position", l.id), '{}'::bigint[])
      into v_offending
      from public.quote_lines l
     where l.version_id = v_version_id
       and l.discount_percent > v_max;

    -- THE REASON BAND. Inside the ceiling but above `requires_reason_above`, an
    -- issue still needs a written reason, which `issue_quote_version()` stores
    -- on the `sent` history row. A written approval already is one: the rep is
    -- not asked to restate a motive a manager signed off on. Reported here
    -- rather than recomputed by the caller, so the dialog and the RPC cannot
    -- disagree about when the reason box is mandatory.
    v_reason_required := coalesce(v_effective > v_rule.requires_reason_above, false)
        and v_approval_reason is null;

    return jsonb_build_object(
        'quote_id', p_quote_id,
        'role', v_role,
        'approved_by_role', v_approver_role,
        'max_allowed', v_max,
        'effective_discount_percent', v_effective,
        'ok', v_effective <= v_max,
        'reason_required', v_reason_required,
        'requires_reason_above', v_rule.requires_reason_above,
        'since', v_rule.enforced_from,
        'offending_line_ids', to_jsonb(v_offending));
end;
$$;

-- A new trailing parameter changes the signature, so the old function goes first.
drop function public.issue_quote_version(bigint, integer, text, text);

-- Mint one link to an issued document, and return the raw token once.
--
-- `service_role` only: its callers (`issue_quote_version()`,
-- `create_quote_link()`) have already decided who may share the quote, and this
-- is the ONE place that decides how a link is made. "A link never outlives the
-- offer it points at" is a security property, and two copies of it drift.
create or replace function public.mint_quote_token(
    p_version_id  bigint,
    p_token_days  integer default 30,
    p_token_label text    default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_version  public.quote_versions;
    v_token    bytea := extensions.gen_random_bytes(32);
    v_token_id bigint;
    v_expires  timestamp with time zone;
begin
    -- A token pointing at a draft is a link whose contents change while the
    -- customer reads them.
    select * into v_version from public.quote_versions v where v.id = p_version_id;
    if not found or v_version.issued_at is null then
        raise exception 'quote version % is not an issued document', p_version_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    -- `least` ignores nulls, so a document with no `valid_until` simply gets the
    -- requested window.
    v_expires := least(
        now() + make_interval(days => greatest(coalesce(p_token_days, 30), 1)),
        (v_version.valid_until + 1)::timestamp with time zone);

    insert into public.quote_access_tokens
        (quote_id, version_id, token_hash, label, created_by, expires_at)
    values (v_version.quote_id, v_version.id, sha256(v_token), p_token_label,
            public.current_sale_id(), v_expires)
    returning id into v_token_id;

    return jsonb_build_object(
        'token_id',   v_token_id,
        'token',      encode(v_token, 'hex'),
        'expires_at', v_expires);
end;
$$;

-- Turn the working draft into a document, and mint the link that shows it.
--
-- Everything here happens in ONE transaction because the halves are not
-- independently meaningful: a version stamped issued with no token is a
-- document nobody can open, and a token pointing at a draft is a link whose
-- contents change while the customer reads them.
--
-- Returns the RAW TOKEN, exactly once. Only its sha256 is stored, so there is no
-- second chance to read it -- which is the whole point, and why the UI offers
-- "generate a new link" (`create_quote_link()`) rather than a copy button that
-- cannot work.
--
-- Two written motives, kept apart because they mean different things:
-- `p_override_reason` is an admin skipping the discount ceiling and lands on
-- `override_reason`; `p_reason` explains a discount inside the ceiling but above
-- the reason band and lands on `reason`.
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
           party_snapshot = public.quote_party_snapshot(p_quote_id)
     where v.id = v_version.id
    returning * into v_version;

    perform set_config('app.quote_version_system_write', '', true);

    v_link := public.mint_quote_token(v_version.id, p_token_days, p_token_label);

    perform public.apply_quote_status(
        p_quote_id, 'sent', v_reason, 'internal', v_actor, null, v_override);

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number) || v_link;
end;
$$;

-- "Generate a new link" (§6.2): another token for the document the customer is
-- currently being offered. Returns the raw token once, exactly like the issue;
-- older links keep working until somebody revokes them.
--
-- Refused while a revision is open: `revise_quote()` revoked the links to the
-- version it is replacing precisely so nobody accepts it, and a fresh link would
-- reopen that door. Refused for an elapsed offer too, because the expiry clamp
-- would hand back a link that is dead on arrival.
create or replace function public.create_quote_link(
    p_quote_id    bigint,
    p_token_days  integer default 30,
    p_token_label text    default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote   public.quotes;
    v_actor   bigint := public.current_sale_id();
    v_version public.quote_versions;
begin
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- Same rule as `issue_quote_version()`. Restated because SECURITY DEFINER
    -- bypasses RLS.
    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to share quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_version
      from public.quote_versions v
     where v.quote_id = p_quote_id
       and v.issued_at is not null
       and v.superseded_at is null;
    if not found then
        raise exception 'quote % has no issued version to link to', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    if exists (select 1 from public.quote_versions v
                where v.quote_id = p_quote_id and v.issued_at is null) then
        raise exception 'quote % has an open revision: issue it instead', p_quote_id
            using errcode = 'check_violation', detail = 'quote_draft_exists';
    end if;

    if v_version.valid_until < current_date then
        raise exception 'the offer in quote % expired on %', p_quote_id, v_version.valid_until
            using errcode = 'check_violation', detail = 'quote_validity_elapsed';
    end if;

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number)
        || public.mint_quote_token(v_version.id, p_token_days, p_token_label);
end;
$$;

--
-- 2. Revoking hands nothing back. A changed return type needs a drop.
--
drop function public.revoke_quote_token(bigint);

-- Withdraw one link. `authenticated`, restating the quote capability check.
--
-- Returns nothing: the token row carries `token_hash`, which must never reach a
-- browser -- that is what `quote_access_tokens_summary` is for. The caller
-- re-reads the summary.
create or replace function public.revoke_quote_token(p_token_id bigint)
returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote_id bigint;
    v_revoked  timestamp with time zone;
    v_actor    bigint := public.current_sale_id();
begin
    select t.quote_id, t.revoked_at into v_quote_id, v_revoked
      from public.quote_access_tokens t where t.id = p_token_id for update;
    if not found then
        raise exception 'token % not found', p_token_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_see_quote(v_quote_id)) then
        raise exception 'no permission to revoke token %', p_token_id
            using errcode = 'insufficient_privilege';
    end if;

    -- Idempotent: revoking twice is not an error, and re-stamping the date would
    -- rewrite when the link actually stopped working.
    if v_revoked is null then
        update public.quote_access_tokens t
           set revoked_at = now(), revoked_by = v_actor
         where t.id = p_token_id;
    end if;
end;
$$;

-- `alter default privileges` hands every new function to PUBLIC and `anon`, so
-- each one starts from `revoke all`.
revoke all on function public.issue_quote_version(bigint, integer, text, text, text) from public, anon;
revoke all on function public.create_quote_link(bigint, integer, text) from public, anon;
revoke all on function public.revoke_quote_token(bigint) from public, anon;
revoke all on function public.mint_quote_token(bigint, integer, text) from public, anon, authenticated;

grant execute on function public.issue_quote_version(bigint, integer, text, text, text) to authenticated, service_role;
grant execute on function public.create_quote_link(bigint, integer, text) to authenticated, service_role;
grant execute on function public.revoke_quote_token(bigint) to authenticated, service_role;
grant execute on function public.mint_quote_token(bigint, integer, text) to service_role;
