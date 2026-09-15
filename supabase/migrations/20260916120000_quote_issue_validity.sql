--
-- Quotes / CPQ module, Phase 5: an elapsed offer can no longer be issued.
--
-- docs/proposals/quotes-cpq-module.md §13.6 #12. `create_quote_link()` already
-- refuses to mint a link for a document whose `valid_until` has passed
-- (`quote_validity_elapsed`), because `mint_quote_token()` clamps every link to
-- the day after that date and the link would be dead on arrival.
-- `issue_quote_version()` mints through the same function and did NOT refuse:
-- a draft carrying yesterday's date could be sent, and the customer received a
-- link that had already expired. The editor's `min` on the date input only
-- covers a draft saved today, so the hole stayed open for every draft written
-- before its own validity elapsed.
--
-- One condition, in the one path that was missing it. The two ways a token is
-- minted now refuse on the same test and with the same error key, which is what
-- keeps them from drifting apart again.
--
-- The function is expanded verbatim from `supabase/schemas/02_functions.sql`,
-- where the same object now lives. The signature is unchanged, so
-- `create or replace` keeps the existing privileges; they are restated below to
-- keep this file readable on its own.
--

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

revoke all on function public.issue_quote_version(bigint, integer, text, text, text) from public, anon;
grant execute on function public.issue_quote_version(bigint, integer, text, text, text) to authenticated, service_role;
