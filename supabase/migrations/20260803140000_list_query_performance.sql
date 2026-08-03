--
-- List query performance.
--
-- Owner-scoped RLS makes admins and sales managers the "sees everything" case,
-- which is exactly the case the summary views handled worst. Measured on a
-- synthetic dataset of 50 users / 20k companies / 200k contacts / 100k deals /
-- 400k tasks / 400k notes, page 1 of the contact list took 1076 ms for a
-- manager and 118 ms for a rep.
--
-- Two changes, both measured:
--
--   1. The summary views aggregated a join with GROUP BY, so the entire table
--      was grouped before ORDER BY ... LIMIT could discard it. Rewritten as
--      scalar subqueries the count is only computed for the rows that survive
--      the limit. Verified to return identical numbers to the previous
--      definition.
--   2. Several list screens sort by a column with no index, forcing a top-N
--      heapsort over the whole table on every page load.
--
-- Result on the same dataset: contact list page 1076 ms -> 0.31 ms (manager)
-- and 118 ms -> 0.84 ms (rep); company list 582 ms -> 5.3 ms; deal kanban
-- 43.7 ms -> 0.15 ms; task list 68.6 ms -> 0.12 ms.
--

create or replace view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    (select count(*) from public.deals d where d.company_id = c.id) as nb_deals,
    (select count(*) from public.contacts co where co.company_id = c.id) as nb_contacts
from public.companies c;

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    (select count(*) from public.tasks t
      where t.contact_id = co.id and t.done_date is null) as nb_tasks
from public.contacts co
    left join public.companies c on co.company_id = c.id;

--
-- Ordering indexes. As in the RLS migration, `if not exists` lets an operator
-- build these with `create index concurrently` ahead of the deploy on a large
-- installation.
--
create index if not exists contacts_last_seen_idx
    on public.contacts using btree (last_seen desc);
create index if not exists contact_notes_date_idx
    on public.contact_notes using btree (date desc);
create index if not exists deal_notes_date_idx
    on public.deal_notes using btree (date desc);
create index if not exists tasks_pending_contact_id_idx
    on public.tasks using btree (contact_id) where done_date is null;
create index if not exists tasks_pending_due_date_idx
    on public.tasks using btree (due_date) where done_date is null;
create index if not exists deals_active_index_idx
    on public.deals using btree (index desc) where archived_at is null;
