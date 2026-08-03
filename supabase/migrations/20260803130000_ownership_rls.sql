--
-- Ownership row level security.
--
-- Replaces the blanket `using (true)` policies with owner scoping: a sales rep
-- only reaches the records they own, while admins and sales managers reach
-- everything. Reassignment is restricted to managers by repeating the
-- predicate in the UPDATE ... WITH CHECK clauses.
--
-- Records with a NULL `sales_id` become an unassigned pool: managers see them,
-- reps do not. Audit before deploying:
--
--   select count(*) filter (where sales_id is null) from public.contacts;
--
-- and hand them out from the Contacts list once the migration is in.
--

--
-- Indexes first: creating them after the policies would leave a window where
-- every owner-scoped query sequentially scans the table.
--
-- `if not exists` is deliberate. On a large installation, build these ahead of
-- the deploy without locking writes:
--
--   create index concurrently companies_sales_id_idx on public.companies (sales_id);
--
-- and this migration will then skip them.
--
create index if not exists companies_sales_id_idx on public.companies using btree (sales_id);
create index if not exists contacts_sales_id_idx on public.contacts using btree (sales_id);
create index if not exists deals_sales_id_idx on public.deals using btree (sales_id);
create index if not exists contact_notes_sales_id_idx on public.contact_notes using btree (sales_id);
create index if not exists deal_notes_sales_id_idx on public.deal_notes using btree (sales_id);
create index if not exists tasks_contact_id_idx on public.tasks using btree (contact_id);
create index if not exists tasks_sales_id_due_date_idx on public.tasks using btree (sales_id, due_date);

--
-- Drop the open policies.
--
drop policy if exists "Enable read access for authenticated users" on public.companies;
drop policy if exists "Enable insert for authenticated users only" on public.companies;
drop policy if exists "Enable update for authenticated users only" on public.companies;
drop policy if exists "Company Delete Policy" on public.companies;

drop policy if exists "Enable read access for authenticated users" on public.contacts;
drop policy if exists "Enable insert for authenticated users only" on public.contacts;
drop policy if exists "Enable update for authenticated users only" on public.contacts;
drop policy if exists "Contact Delete Policy" on public.contacts;

drop policy if exists "Enable read access for authenticated users" on public.contact_notes;
drop policy if exists "Enable insert for authenticated users only" on public.contact_notes;
drop policy if exists "Contact Notes Update policy" on public.contact_notes;
drop policy if exists "Contact Notes Delete Policy" on public.contact_notes;

drop policy if exists "Enable read access for authenticated users" on public.deals;
drop policy if exists "Enable insert for authenticated users only" on public.deals;
drop policy if exists "Enable update for authenticated users only" on public.deals;
drop policy if exists "Deals Delete Policy" on public.deals;

drop policy if exists "Enable read access for authenticated users" on public.deal_notes;
drop policy if exists "Enable insert for authenticated users only" on public.deal_notes;
drop policy if exists "Deal Notes Update Policy" on public.deal_notes;
drop policy if exists "Deal Notes Delete Policy" on public.deal_notes;

drop policy if exists "Enable read access for authenticated users" on public.tasks;
drop policy if exists "Enable insert for authenticated users only" on public.tasks;
drop policy if exists "Task Update Policy" on public.tasks;
drop policy if exists "Task Delete Policy" on public.tasks;

--
-- Companies: shared reference data, so reads stay open. `contacts_summary`
-- left-joins companies for the company name and the autocomplete needs the
-- full list to prevent duplicate records.
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
-- Contact notes: visibility follows the contact, so a reassigned contact
-- carries its history and a manager's note stays readable by the rep.
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
-- Deal notes: visibility follows the deal.
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
-- Tasks: visibility follows the contact.
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
