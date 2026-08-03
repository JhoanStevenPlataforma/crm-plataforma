--
-- Row Level Security
-- This file declares RLS policies for all tables.
--
-- Ownership model
-- ---------------
-- Every CRM record carries a `sales_id` owner. A sales rep only sees and edits
-- the records they own; admins and sales managers (`public.can_manage_all()`)
-- see and edit everything.
--
-- Two details matter:
--
-- 1. The UPDATE policies repeat the predicate in WITH CHECK. That is what stops
--    a rep from handing a record to somebody else: they may edit their own row,
--    but the row must still belong to them afterwards. Reassignment is
--    therefore a manager-only operation, enforced by Postgres rather than by
--    the UI.
--
-- 2. Notes and tasks derive their visibility from their parent record instead
--    of their own `sales_id`. A note written by a manager on a rep's contact
--    stays visible to that rep, and reassigning a contact carries its whole
--    history along with it.
--
-- The helper functions are wrapped in scalar subqueries — `(select f())` — so
-- the planner hoists them into an InitPlan and evaluates them once per
-- statement instead of once per row.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.leads enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;

--
-- Companies
--
-- Deliberately readable by everyone: `contacts_summary` left-joins companies
-- for the company name, the company autocomplete needs the full list to keep
-- reps from creating duplicates, and a company is shared reference data rather
-- than a private record. Writing one is still restricted to its owner.
--
create policy "Companies are readable by every authenticated user"
    on public.companies for select to authenticated
    using (true);

create policy "Companies are created for their own owner"
    on public.companies for insert to authenticated
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Companies are updated by their owner or a manager"
    on public.companies for update to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    )
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Companies are deleted by their owner or a manager"
    on public.companies for delete to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

--
-- Contacts
--
create policy "Contacts are visible to their owner or a manager"
    on public.contacts for select to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Contacts are created for their own owner"
    on public.contacts for insert to authenticated
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Contacts are updated by their owner or a manager"
    on public.contacts for update to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    )
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Contacts are deleted by their owner or a manager"
    on public.contacts for delete to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

--
-- Leads
--
create policy "Leads are visible to their owner or a manager"
    on public.leads for select to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Leads are created for their own owner"
    on public.leads for insert to authenticated
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Leads are updated by their owner or a manager"
    on public.leads for update to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    )
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Leads are deleted by their owner or a manager"
    on public.leads for delete to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

--
-- Contact Notes (visibility follows the contact)
--
create policy "Contact notes follow their contact for reads"
    on public.contact_notes for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = contact_notes.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

create policy "Contact notes follow their contact for writes"
    on public.contact_notes for insert to authenticated
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = contact_notes.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

create policy "Contact notes follow their contact for updates"
    on public.contact_notes for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = contact_notes.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

create policy "Contact notes follow their contact for deletes"
    on public.contact_notes for delete to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = contact_notes.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

--
-- Deals
--
create policy "Deals are visible to their owner or a manager"
    on public.deals for select to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Deals are created for their own owner"
    on public.deals for insert to authenticated
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Deals are updated by their owner or a manager"
    on public.deals for update to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    )
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Deals are deleted by their owner or a manager"
    on public.deals for delete to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

--
-- Deal Notes (visibility follows the deal)
--
create policy "Deal notes follow their deal for reads"
    on public.deal_notes for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.deals d
            where d.id = deal_notes.deal_id
              and d.sales_id = (select public.current_sale_id())
        )
    );

create policy "Deal notes follow their deal for writes"
    on public.deal_notes for insert to authenticated
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.deals d
            where d.id = deal_notes.deal_id
              and d.sales_id = (select public.current_sale_id())
        )
    );

create policy "Deal notes follow their deal for updates"
    on public.deal_notes for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.deals d
            where d.id = deal_notes.deal_id
              and d.sales_id = (select public.current_sale_id())
        )
    );

create policy "Deal notes follow their deal for deletes"
    on public.deal_notes for delete to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.deals d
            where d.id = deal_notes.deal_id
              and d.sales_id = (select public.current_sale_id())
        )
    );

--
-- Tasks (visibility follows the contact)
--
create policy "Tasks follow their contact for reads"
    on public.tasks for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = tasks.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

create policy "Tasks follow their contact for writes"
    on public.tasks for insert to authenticated
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = tasks.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

create policy "Tasks follow their contact for updates"
    on public.tasks for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = tasks.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

create policy "Tasks follow their contact for deletes"
    on public.tasks for delete to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.contacts c
            where c.id = tasks.contact_id
              and c.sales_id = (select public.current_sale_id())
        )
    );

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags (shared vocabulary, not owned by anyone)
create policy "Enable read access for authenticated users" on public.tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tags for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.tags for update to authenticated using (true);
create policy "Enable delete for authenticated users only" on public.tags for delete to authenticated using (true);

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);
