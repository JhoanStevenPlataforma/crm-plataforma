--
-- Quotes / CPQ module, Phase 10: the answer, where the team can read it
-- (docs/proposals/quotes-cpq-module.md §6.4).
--
-- ONE view, replaced. `quote_portal_reject()` has required a reason code since
-- Phase 7 precisely so "why we lost it" would be reportable, and no screen
-- could read it: `quotes_summary` carried `accepted_at` and nothing of the
-- refusal. The two columns below are the whole change -- no table, no function,
-- no grant.
--
-- `create or replace view`, not a drop and recreate: the columns are APPENDED
-- to the select list, which is the one shape a replace accepts, so the view's
-- own ACL survives untouched.
--
-- What a drop and recreate would have cost was MEASURED here, not assumed, and
-- it is worse than a lost grant. On this stack `alter default privileges` hands
-- every new object in `public` to `anon`, `authenticated` and `service_role`
-- alike, so a recreated `quotes_summary` comes back as
-- `anon=arwdDxt` -- the one role this module grants NOTHING, which is why the
-- customer portal is an edge function holding the service role (§6.1). RLS
-- would still return no rows to `anon`, so nothing would leak and nothing would
-- look wrong; the endpoint would simply become reachable. Verified: recreated
-- that way, `quotes_anon_grants.test.sql` goes red on two assertions, which is
-- the guard that catches this if anyone ever does drop it.
--
-- The CODE only, not the customer's free text: the code is what groups a
-- pipeline by loss reason, the text is read on the quotation's own page from
-- the version, and PostgREST asks this view for `select=*` on every list page.
--
-- Expanded verbatim from `supabase/schemas/03_views.sql`, which stays the
-- source of truth.
--
-- The list / board projection of a quote (§2.6).
--
-- The joins are one-to-one (company, deal, owner, status) and the current
-- version is one `left join lateral (… limit 1)`, the repo's idiom for "the
-- newest child". Every counter is a SCALAR SUBQUERY, never a join plus
-- GROUP BY: the 580 ms -> 5 ms rewrite documented on `companies_summary`
-- applies verbatim, and `nb_*` counters are exactly the shape it was measured
-- on. Keep them that way.
create or replace view public.quotes_summary with (security_invoker = on) as
select
    q.id,
    q.quote_number,
    q.title,
    q.deal_id,
    q.company_id,
    q.contact_id,
    q.sales_id,
    q.price_list_id,
    q.currency,
    q.status_key,
    q.valid_until,
    q.terms,
    q.internal_notes,
    q.created_by,
    q.created_at,
    q.updated_at,

    c.name as company_name,
    d.name as deal_name,
    nullif(btrim(concat_ws(' ', o.first_name, o.last_name)), '') as owner_name,

    st.label         as status_label,
    st.color         as status_color,
    st.is_open       as status_is_open,
    st.is_terminal   as status_is_terminal,
    st.counts_as_won as status_counts_as_won,

    -- The version being worked on: the draft when there is one, otherwise the
    -- newest issued document.
    cv.id             as current_version_id,
    cv.version_number as current_version_number,
    cv.issued_at,
    cv.subtotal,
    cv.discount_total,
    cv.tax_total,
    cv.total,
    cv.accepted_at,
    cv.party_snapshot,

    (select count(*) from public.quote_versions v
      where v.quote_id = q.id and v.issued_at is not null) as nb_issued_versions,
    (select count(*) from public.quote_lines l
      where l.version_id = cv.id) as nb_lines,
    (select count(*) from public.quote_comments qc
      where qc.quote_id = q.id and qc.visibility = 'shared'
        and qc.deleted_at is null) as nb_shared_comments,
    (select count(*) from public.quote_comments qc
      where qc.quote_id = q.id and qc.author_kind = 'customer'
        and qc.read_by_internal_at is null
        and qc.deleted_at is null) as nb_unanswered_customer_comments,
    (select count(*) from public.quote_portal_events e
      where e.quote_id = q.id and e.event_type = 'viewed') as nb_views,
    (select max(e.occurred_at) from public.quote_portal_events e
      where e.quote_id = q.id) as last_portal_activity_at,
    -- Through the summary view, not the table: the table has no select policy,
    -- so under `security_invoker = on` it would count zero for everybody.
    (select count(*) from public.quote_access_tokens_summary t
      where t.quote_id = q.id and t.is_active) as nb_active_tokens,

    -- Why we lost it (§6.4, Phase 10). Beside `accepted_at` in meaning, at the
    -- END of the select list in fact: `create or replace view` accepts appended
    -- columns and refuses inserted ones, so a column added here costs a plain
    -- replace rather than a drop that would take the grants and the policies
    -- with it. Anything added later goes below this, for the same reason.
    --
    -- The CODE only. The free text is read on the quotation's own page, from
    -- the version; it is the code that groups a pipeline by loss reason, and
    -- PostgREST asks this view for `select=*` on every list page.
    cv.rejected_at,
    cv.rejected_reason_code
from public.quotes q
    left join public.companies c on c.id = q.company_id
    left join public.deals d on d.id = q.deal_id
    left join public.sales o on o.id = q.sales_id
    left join public.quote_statuses st on st.key = q.status_key
    left join lateral (
        select v.id, v.version_number, v.issued_at, v.subtotal, v.discount_total,
               v.tax_total, v.total, v.accepted_at, v.party_snapshot,
               v.rejected_at, v.rejected_reason_code
          from public.quote_versions v
         where v.quote_id = q.id
         order by v.version_number desc
         limit 1
    ) cv on true;
