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
-- Task catalogues (§17.1): shared reference data, readable by every
-- authenticated user, writable only by admins (`task.manage_catalogs`).
--
-- `task_transitions` belongs to this group and was originally left out of it:
-- no RLS at all, on a table that already carried `grant all to authenticated`.
-- It is not passive reference data -- `transition_task()` reads it to decide
-- whether a status change is legal -- so any rep could declare a transition
-- the state machine forbids, clear `requires_reason`, or delete the rows and
-- break the workflow for the whole organisation.
--
alter table public.task_statuses enable row level security;
alter table public.task_priorities enable row level security;
alter table public.task_types enable row level security;
alter table public.task_transitions enable row level security;

create policy "Catalogues are readable by every authenticated user"
    on public.task_statuses for select to authenticated
    using (true);
create policy "Catalogues are manageable by admins only"
    on public.task_statuses for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Catalogues are readable by every authenticated user"
    on public.task_priorities for select to authenticated
    using (true);
create policy "Catalogues are manageable by admins only"
    on public.task_priorities for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Catalogues are readable by every authenticated user"
    on public.task_types for select to authenticated
    using (true);
create policy "Catalogues are manageable by admins only"
    on public.task_types for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Catalogues are readable by every authenticated user"
    on public.task_transitions for select to authenticated
    using (true);
create policy "Catalogues are manageable by admins only"
    on public.task_transitions for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

--
-- Tasks (§7.3 access rule)
--
-- A task is visible to you if any of these is true:
--   1. you are an active owner/collaborator/watcher, or
--   2. you are a member of an assigned team, or
--   3. you are the creator (of a task that is not deleted), or
--   4. you own a linked record (contact/lead/company/deal), or
--   5. can_manage_all() — admin or manager.
--
-- The `exists` clauses are inlined (not `can_see_task()`) so the planner can
-- drive them off `task_assignments_active_by_sale` / `task_links_entity` as
-- semi-joins (§7.3 performance note).
--
create policy "Tasks are visible per the §7.3 access rule"
    on public.tasks for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.task_assignments a
            where a.task_id = tasks.id
              and a.unassigned_at is null
              and (a.sales_id = (select public.current_sale_id())
                   or a.team_id in (select tm.team_id from public.team_members tm
                                    where tm.sales_id = (select public.current_sale_id())))
        )
        or (tasks.created_by = (select public.current_sale_id())
            and tasks.deleted_at is null)
        or exists (
            select 1 from public.task_links l
            where l.task_id = tasks.id
              and l.unlinked_at is null
              and (
                  (l.entity_type = 'contact'
                   and exists (select 1 from public.contacts c
                               where c.id = l.entity_id
                                 and c.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'lead'
                      and exists (select 1 from public.leads ld
                                  where ld.id = l.entity_id
                                    and ld.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'company'
                      and exists (select 1 from public.companies co
                                  where co.id = l.entity_id
                                    and co.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'deal'
                      and exists (select 1 from public.deals d
                                  where d.id = l.entity_id
                                    and d.sales_id = (select public.current_sale_id())))
              )
        )
    );

create policy "Tasks can be created by their creator or linked-record owners"
    on public.tasks for insert to authenticated
    with check (
        (select public.can_manage_all())
        or tasks.created_by = (select public.current_sale_id())
        -- preserve the legacy guard: a task may not be pinned to a contact
        -- the user does not own (§7.3 rule 4)
        or (tasks.contact_id is not null
            and exists (select 1 from public.contacts c
                        where c.id = tasks.contact_id
                          and c.sales_id = (select public.current_sale_id())))
    );

create policy "Tasks can be updated by the §7.3 access rule"
    on public.tasks for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.task_assignments a
            where a.task_id = tasks.id
              and a.unassigned_at is null
              and (a.sales_id = (select public.current_sale_id())
                   or a.team_id in (select tm.team_id from public.team_members tm
                                    where tm.sales_id = (select public.current_sale_id())))
        )
        or (tasks.created_by = (select public.current_sale_id())
            and tasks.deleted_at is null)
        or exists (
            select 1 from public.task_links l
            where l.task_id = tasks.id
              and l.unlinked_at is null
              and (
                  (l.entity_type = 'contact'
                   and exists (select 1 from public.contacts c
                               where c.id = l.entity_id
                                 and c.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'lead'
                      and exists (select 1 from public.leads ld
                                  where ld.id = l.entity_id
                                    and ld.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'company'
                      and exists (select 1 from public.companies co
                                  where co.id = l.entity_id
                                    and co.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'deal'
                      and exists (select 1 from public.deals d
                                  where d.id = l.entity_id
                                    and d.sales_id = (select public.current_sale_id())))
              )
        )
    )
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.task_assignments a
            where a.task_id = tasks.id
              and a.unassigned_at is null
              and (a.sales_id = (select public.current_sale_id())
                   or a.team_id in (select tm.team_id from public.team_members tm
                                    where tm.sales_id = (select public.current_sale_id())))
        )
        or (tasks.created_by = (select public.current_sale_id())
            and tasks.deleted_at is null)
        or exists (
            select 1 from public.task_links l
            where l.task_id = tasks.id
              and l.unlinked_at is null
              and (
                  (l.entity_type = 'contact'
                   and exists (select 1 from public.contacts c
                               where c.id = l.entity_id
                                 and c.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'lead'
                      and exists (select 1 from public.leads ld
                                  where ld.id = l.entity_id
                                    and ld.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'company'
                      and exists (select 1 from public.companies co
                                  where co.id = l.entity_id
                                    and co.sales_id = (select public.current_sale_id())))
                  or (l.entity_type = 'deal'
                      and exists (select 1 from public.deals d
                                  where d.id = l.entity_id
                                    and d.sales_id = (select public.current_sale_id())))
              )
        )
    );

-- §17.1: soft delete is reserved for managers/admins; hard delete is revoked
-- at role level (migration step 8). Keep a hard-delete path only for
-- managers/admins until the frontend switches to soft delete.
create policy "Tasks can be deleted by managers or admins only"
    on public.tasks for delete to authenticated
    using ((select public.can_manage_all()));

--
-- Task assignments and links follow their task (§7.3)
--

alter table public.task_assignments enable row level security;
alter table public.task_links enable row level security;

create policy "Assignments follow their task for reads"
    on public.task_assignments for select to authenticated
    using (public.can_see_task(task_id));

create policy "Assignments follow their task for writes"
    on public.task_assignments for insert to authenticated
    with check (public.can_see_task(task_id));

create policy "Assignments follow their task for updates"
    on public.task_assignments for update to authenticated
    using (public.can_see_task(task_id))
    with check (public.can_see_task(task_id));

create policy "Links follow their task for reads"
    on public.task_links for select to authenticated
    using (public.can_see_task(task_id));

create policy "Links follow their task for writes"
    on public.task_links for insert to authenticated
    with check (public.can_see_task(task_id));

create policy "Links follow their task for updates"
    on public.task_links for update to authenticated
    using (public.can_see_task(task_id))
    with check (public.can_see_task(task_id));

--
-- Teams (§7.1, deliverable 2.4)
--
-- Readable by everyone: a rep must be able to see which team a task is assigned
-- to, and the RLS on tasks itself resolves membership through `team_members`.
-- Editing a team is the same question as reassigning work, so it gets the same
-- answer — `can_manage_all()`, admin or manager. `for all` is OR'd with the
-- permissive select policies below, so reads stay open.
--

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Teams are readable by every authenticated user"
    on public.teams for select to authenticated using (true);
create policy "Team memberships are readable by every authenticated user"
    on public.team_members for select to authenticated using (true);

create policy "Teams are manageable by managers and admins"
    on public.teams for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

create policy "Team memberships are manageable by managers and admins"
    on public.team_members for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

--
-- Team budgets
--
-- Unlike `teams`, this is NOT readable by everyone. A quota is commercially
-- sensitive and a rep has no product reason to read another team's target, so
-- the whole table is admin/manager only — read included. Opening it to a rep's
-- own team is a deliberate product decision, not a default: it would take a
-- second `for select` policy joined through `team_members`.
--
alter table public.team_budgets enable row level security;

create policy "Team budgets are readable and manageable by managers and admins"
    on public.team_budgets for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

--
-- Per-member allocations of that budget. A personal quota is at least as
-- sensitive as the team target it is carved out of, so it gets the same answer.
-- Letting a rep read their own is the same product decision as above, and would
-- take the same second `for select` policy.
--
alter table public.team_member_budgets enable row level security;

create policy "Member budgets are readable and manageable by managers and admins"
    on public.team_member_budgets for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

--
-- Task events: readable with their task (RLS applies transitively); the table
-- is append-only — update/delete are revoked and blocked (§5.5).
--

alter table public.task_events enable row level security;
create policy "Task events are readable with their task"
    on public.task_events for select to authenticated
    using (exists (select 1 from public.tasks t
                   where t.id = task_events.task_id));

--
-- Comments follow their task (§8.2)
--
-- Two extra rules on top of task visibility:
--   * a private comment is an internal note — author, managers and admins only;
--   * editing and deleting are the author's, or a manager's, never a bystander's
--     who merely has access to the task.
--

alter table public.task_comments enable row level security;
alter table public.task_comment_revisions enable row level security;
alter table public.task_comment_mentions enable row level security;
alter table public.task_comment_reactions enable row level security;

create policy "Comments are readable with their task"
    on public.task_comments for select to authenticated
    using (
        public.can_see_task(task_id)
        and (
            is_private = false
            or author_id = (select public.current_sale_id())
            or (select public.can_manage_all())
        )
    );

create policy "Comments are written by users who can see the task"
    on public.task_comments for insert to authenticated
    with check (public.can_see_task(task_id));

-- No `for delete` policy: deletion is the soft delete performed by this update
-- path (§8.2). A hard delete has no policy, so it is refused.
create policy "Comments are edited by their author or a manager"
    on public.task_comments for update to authenticated
    using (
        author_id = (select public.current_sale_id())
        or (select public.can_manage_all())
    )
    with check (
        author_id = (select public.current_sale_id())
        or (select public.can_manage_all())
    );

create policy "Comment revisions are readable with their comment"
    on public.task_comment_revisions for select to authenticated
    using (exists (select 1 from public.task_comments c
                   where c.id = task_comment_revisions.comment_id));

create policy "Mentions are readable with their comment"
    on public.task_comment_mentions for select to authenticated
    using (exists (select 1 from public.task_comments c
                   where c.id = task_comment_mentions.comment_id));

-- Only the mentioned person marks their own mention as read.
create policy "You mark your own mentions as read"
    on public.task_comment_mentions for update to authenticated
    using (mentioned_sales_id = (select public.current_sale_id()))
    with check (mentioned_sales_id = (select public.current_sale_id()));

create policy "Reactions are readable with their comment"
    on public.task_comment_reactions for select to authenticated
    using (exists (select 1 from public.task_comments c
                   where c.id = task_comment_reactions.comment_id));

create policy "You add your own reactions"
    on public.task_comment_reactions for insert to authenticated
    with check (
        sales_id = (select public.current_sale_id())
        and exists (select 1 from public.task_comments c
                    where c.id = task_comment_reactions.comment_id)
    );

create policy "You remove your own reactions"
    on public.task_comment_reactions for delete to authenticated
    using (sales_id = (select public.current_sale_id()));

--
-- Attachments follow their task (§3.2, §8.2)
--
-- Same shape as the checklist: whoever can act on the task can attach a file
-- to it. There is no `for delete` policy — removal is the soft delete done as
-- an update, so the history keeps resolving the attachment it references.
--

alter table public.task_attachments enable row level security;

create policy "Attachments are readable with their task"
    on public.task_attachments for select to authenticated
    using (public.can_see_task(task_id));

create policy "Attachments are written by users who can see the task"
    on public.task_attachments for insert to authenticated
    with check (public.can_see_task(task_id));

create policy "Attachments are updated by users who can see the task"
    on public.task_attachments for update to authenticated
    using (public.can_see_task(task_id))
    with check (public.can_see_task(task_id));

--
-- Checklist items follow their task (§11)
--
-- A checklist is part of the work item, not a separate object with its own
-- ownership: anyone who can act on the task can tick its steps. There is no
-- `for delete` policy — removal is the soft delete performed as an update.
--

alter table public.task_checklist_items enable row level security;

create policy "Checklist items are readable with their task"
    on public.task_checklist_items for select to authenticated
    using (public.can_see_task(task_id));

create policy "Checklist items are written by users who can see the task"
    on public.task_checklist_items for insert to authenticated
    with check (public.can_see_task(task_id));

create policy "Checklist items are updated by users who can see the task"
    on public.task_checklist_items for update to authenticated
    using (public.can_see_task(task_id))
    with check (public.can_see_task(task_id));

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags (shared vocabulary, not owned by anyone)
--
-- Creating and renaming stay open to everyone: tagging is a rep's daily work
-- and needing a manager to add "congreso-2027" would just push people to stop
-- tagging. Deleting is the asymmetric one -- a tag is referenced by
-- `contacts.tags`, so removing it edits records the deleting user may not even
-- be allowed to see, and nothing brings it back. That one is admin/manager.
create policy "Enable read access for authenticated users" on public.tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tags for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.tags for update to authenticated using (true);
create policy "Tags are deleted by managers and admins" on public.tags for delete to authenticated using ((select public.can_manage_all()));

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);

--
-- Dependencies follow their tasks (§10)
--
-- Visible when you can see EITHER end: a blocked task must show what is
-- blocking it even when the blocker itself belongs to someone else, otherwise
-- "why can't I start?" has no answer. The blocker's own contents stay hidden —
-- only the edge is exposed.
--

alter table public.task_dependencies enable row level security;

create policy "Dependencies are readable from either end"
    on public.task_dependencies for select to authenticated
    using (public.can_see_task(source_task_id)
        or public.can_see_task(target_task_id));

create policy "Dependencies are created by users who can see both ends"
    on public.task_dependencies for insert to authenticated
    with check (public.can_see_task(source_task_id)
            and public.can_see_task(target_task_id));

-- No `for delete`: an edge is closed with `removed_at`, never dropped.
create policy "Dependencies are closed by users who can see either end"
    on public.task_dependencies for update to authenticated
    using (public.can_see_task(source_task_id)
        or public.can_see_task(target_task_id))
    with check (public.can_see_task(source_task_id)
             or public.can_see_task(target_task_id));

--
-- Reminders follow their task (§9, §17)
--
-- A reminder rule is part of the work item: anyone who can see the task can
-- see and set its reminders. Deliveries are stricter — a notification is
-- addressed to one person, and only that person reads it.
--

alter table public.task_reminders enable row level security;

create policy "Reminders are readable with their task"
    on public.task_reminders for select to authenticated
    using (public.can_see_task(task_id));

create policy "Reminders are created by users who can see the task"
    on public.task_reminders for insert to authenticated
    with check (public.can_see_task(task_id));

-- No `for delete`: a rule is deactivated (`is_active = false`), which emits
-- `reminder.canceled`. Dropping the row would erase the fact that somebody
-- turned the chase off.
create policy "Reminders are updated by users who can see the task"
    on public.task_reminders for update to authenticated
    using (public.can_see_task(task_id))
    with check (public.can_see_task(task_id));

alter table public.task_notifications enable row level security;

-- Your inbox is yours. Managers read delivery history through the task's
-- timeline (`task_events`), not by reading other people's notifications.
create policy "You read your own notifications"
    on public.task_notifications for select to authenticated
    using (recipient_id = (select public.current_sale_id()));

-- Only ever your own, and only the read/acknowledge stamps: the outbox status
-- belongs to the worker, never to a client.
create policy "You acknowledge your own notifications"
    on public.task_notifications for update to authenticated
    using (recipient_id = (select public.current_sale_id()))
    with check (recipient_id = (select public.current_sale_id()));

--
-- Notification preferences (§9.5)
--
alter table public.notification_preferences enable row level security;

create policy "Notification preferences are readable by their owner"
    on public.notification_preferences for select to authenticated
    using (sales_id = (select public.current_sale_id())
           or (select public.can_manage_all()));

-- Deliberately owner-only for writes, including admins: quiet hours are a
-- personal setting, and an admin silently muting somebody's reminders would be
-- indistinguishable from a bug.
create policy "Notification preferences are written by their owner"
    on public.notification_preferences for all to authenticated
    using (sales_id = (select public.current_sale_id()))
    with check (sales_id = (select public.current_sale_id()));

--
-- Deal stage history (visibility follows the deal, append-only)
--
alter table public.deal_stage_changes enable row level security;

create policy "Deal stage changes follow their deal for reads"
    on public.deal_stage_changes for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.deals d
            where d.id = deal_stage_changes.deal_id
              and d.sales_id = (select public.current_sale_id())
        )
    );

-- No insert / update / delete policy on purpose. The only writer is
-- `deals_log_stage_change()`, which is SECURITY DEFINER: an audit trail a
-- client can edit answers no question worth asking. The grants in
-- 06_grants.sql withhold the privileges as well, so this is not resting on
-- the absence of a policy alone.

--
-- Deal stage requirements (readable by everyone, tuned by admins only)
--
alter table public.deal_stage_requirements enable row level security;

-- Every user has to be able to read the rule that is about to refuse their
-- move: the kanban dialog says "0 of 1 tasks completed" before the user has
-- typed anything, and a rule nobody can read reads as a bug.
create policy "Deal stage requirements are readable by everyone"
    on public.deal_stage_requirements for select to authenticated
    using (true);

-- Writes are admin-only, not `can_manage_all()`. Editing this table is a
-- strictly larger power than the one-off override in `move_deal_stage()`, which
-- is already admin-only: a manager who could set `min_completed_tasks` to 0
-- would be overriding the rule for everyone, permanently, and leaving no row in
-- `deal_stage_changes.override_reason` to show for it.
create policy "Deal stage requirements are tuned by admins"
    on public.deal_stage_requirements for all to authenticated
    using ((select public.current_sales_role()) = 'admin'::public.sales_role)
    with check ((select public.current_sales_role()) = 'admin'::public.sales_role);

--
-- Report catalogue (readable by everyone, writable by nobody)
--
-- Read is open because the builder renders its pickers from it, and a picker
-- that cannot describe itself is a broken screen. It exposes which FIELDS
-- exist, never which rows: grouping by `owner` still aggregates only the deals
-- the reader's own policies expose.
--
-- There is no write policy, and that is the load-bearing part. `sql_expr` is
-- interpolated into the statement `run_report()` executes, so a user who could
-- write this table could run arbitrary SQL as themselves -- a privilege
-- escalation that starts at "can edit a dropdown". Seeded by migration and
-- reachable only by `service_role`, which bypasses row level security. The
-- grants in 06_grants.sql withhold the privileges as well, so this does not
-- rest on the absence of a policy alone.
--
alter table public.report_datasets enable row level security;
alter table public.report_fields enable row level security;

create policy "Report datasets are readable by everyone"
    on public.report_datasets for select to authenticated
    using (true);

create policy "Report fields are readable by everyone"
    on public.report_fields for select to authenticated
    using (true);

--
-- Saved reports (own, shared, and the built-in library)
--
-- What is protected here is the DEFINITION, not the data. Every report is
-- executed by `run_report()` under the reader's own row level security, so a
-- shared report hands over a question, never an answer -- a rep opening the
-- manager's "pipeline by owner" sees their own pipeline. The library screen
-- says so, because two people reading different numbers under one title is
-- surprising unless it is stated.
--
alter table public.reports enable row level security;

create policy "Reports are readable by their owner, or when shared"
    on public.reports for select to authenticated
    using (
        is_builtin
        or visibility = 'shared'
        or sales_id = (select public.current_sale_id())
        or (select public.can_manage_all())
    );

-- Creation is for yourself only. Without the `sales_id` check a user could
-- author a report attributed to somebody else, which is how a shared library
-- acquires entries nobody admits to writing.
create policy "Reports are created for their own owner"
    on public.reports for insert to authenticated
    with check (
        not is_builtin
        and sales_id = (select public.current_sale_id())
    );

-- Managers may fix or retire a colleague's report, the same reassignment
-- privilege they already have over leads, contacts, companies and deals.
create policy "Reports are updated by their owner or a manager"
    on public.reports for update to authenticated
    using (
        not is_builtin
        and (sales_id = (select public.current_sale_id())
             or (select public.can_manage_all()))
    )
    with check (
        not is_builtin
        and (sales_id = (select public.current_sale_id())
             or (select public.can_manage_all()))
    );

create policy "Reports are deleted by their owner or a manager"
    on public.reports for delete to authenticated
    using (
        not is_builtin
        and (sales_id = (select public.current_sale_id())
             or (select public.can_manage_all()))
    );

-- `is_builtin` is excluded from every write policy above rather than guarded by
-- a trigger: the seeded library is the one place a user can always find a
-- working example of each visualisation, so it survives whatever they do to
-- their own copies. Duplicating one produces an ordinary owned report.

--
-- Row level security: yours, and only ever yours.
--
-- No `can_manage_all()` branch anywhere here, which is a deliberate departure
-- from every other table in this schema. A manager has no business reading how
-- a rep prefers to look at a chart, and an admin quietly changing somebody's
-- saved view would be indistinguishable from a bug. `notification_preferences`
-- made the same call for the same reason.
--
alter table public.report_preferences enable row level security;

create policy "Report preferences are read by their owner"
    on public.report_preferences for select to authenticated
    using (sales_id = (select public.current_sale_id()));

create policy "Report preferences are written by their owner"
    on public.report_preferences for all to authenticated
    using (sales_id = (select public.current_sale_id()))
    with check (sales_id = (select public.current_sale_id()));

-- ===========================================================================
-- Quotes / CPQ module (docs/proposals/quotes-cpq-module.md, Phase 2, §7)
-- ===========================================================================
--
-- RLS is the real boundary; `providers/commons/canAccess.ts` only decides which
-- buttons render. Immutability is enforced by TRIGGERS, not here: row level
-- security decides WHOSE rows, the freeze guards decide WHICH rows are still
-- writable.
--
-- No policy in this section grants `anon`, preserving the invariant F2 names:
-- no policy anywhere in this repository does. The public portal reads through
-- an edge function holding the service role (Phase 7), never through PostgREST.
--

alter table public.tax_rates enable row level security;
alter table public.quote_statuses enable row level security;
alter table public.quote_transitions enable row level security;
alter table public.products enable row level security;
alter table public.product_events enable row level security;
alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_lines enable row level security;
alter table public.quote_comments enable row level security;
alter table public.quote_access_tokens enable row level security;
alter table public.quote_status_changes enable row level security;
alter table public.quote_portal_events enable row level security;
alter table public.quote_discount_rules enable row level security;

--
-- The catalogue is priced data: a rep quotes FROM it, a manager maintains it.
-- A rep who could write it could price their own deal.
--
create policy "Tax rates are readable by everyone"
    on public.tax_rates for select to authenticated
    using (true);

create policy "Tax rates are maintained by managers"
    on public.tax_rates for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

create policy "Products are readable by everyone"
    on public.products for select to authenticated
    using (true);

create policy "Products are maintained by managers"
    on public.products for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

-- Catalogue history is readable like the catalogue it describes, and written by
-- `products_audit()` only.
create policy "Product events are readable by everyone"
    on public.product_events for select to authenticated
    using (true);

create policy "Price lists are readable by everyone"
    on public.price_lists for select to authenticated
    using (true);

create policy "Price lists are maintained by managers"
    on public.price_lists for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

create policy "Price list items are readable by everyone"
    on public.price_list_items for select to authenticated
    using (true);

create policy "Price list items are maintained by managers"
    on public.price_list_items for all to authenticated
    using ((select public.can_manage_all()))
    with check ((select public.can_manage_all()));

--
-- The status machine and the discount ceiling: readable by everyone, tuned by
-- admins only.
--
-- Readable because the UI has to explain a refusal before the user acts on it.
-- Admin-only writes, deliberately not `can_manage_all()`, for the reason given
-- on `deal_stage_requirements` above: `quote_transitions.allowed_actor` decides
-- what the anonymous portal may do, and `max_discount_percent = 100` would
-- override the discount rule for the whole organisation, permanently, leaving no
-- `override_reason` row behind. A manager may exceed their own limit only with
-- an admin's written override, which IS recorded.
--
create policy "Quote statuses are readable by everyone"
    on public.quote_statuses for select to authenticated
    using (true);

create policy "Quote statuses are tuned by admins"
    on public.quote_statuses for all to authenticated
    using ((select public.current_sales_role()) = 'admin'::public.sales_role)
    with check ((select public.current_sales_role()) = 'admin'::public.sales_role);

create policy "Quote transitions are readable by everyone"
    on public.quote_transitions for select to authenticated
    using (true);

create policy "Quote transitions are tuned by admins"
    on public.quote_transitions for all to authenticated
    using ((select public.current_sales_role()) = 'admin'::public.sales_role)
    with check ((select public.current_sales_role()) = 'admin'::public.sales_role);

create policy "Quote discount rules are readable by everyone"
    on public.quote_discount_rules for select to authenticated
    using (true);

create policy "Quote discount rules are tuned by admins"
    on public.quote_discount_rules for all to authenticated
    using ((select public.current_sales_role()) = 'admin'::public.sales_role)
    with check ((select public.current_sales_role()) = 'admin'::public.sales_role);

--
-- Quotes: the rep-scoped shape used by deals. The repeated `with check` on
-- UPDATE is what makes reassignment manager-only.
--
create policy "Quotes are visible to their owner or a manager"
    on public.quotes for select to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Quotes are created for their own owner"
    on public.quotes for insert to authenticated
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

create policy "Quotes are updated by their owner or a manager"
    on public.quotes for update to authenticated
    using (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    )
    with check (
        (select public.can_manage_all())
        or sales_id = (select public.current_sale_id())
    );

-- No delete policy, and no DELETE privilege (06_grants.sql). A quote ends as
-- `canceled`; only `purge_quotes()` removes one. A delete could never succeed
-- anyway -- the history is append-only, and the lines' freeze guard fires on
-- the cascade after the quote row is gone -- so offering one only produced a
-- misleading error.

--
-- Versions and lines follow their quote.
--
-- No insert or delete policy on versions: version 1 is created by the quote's
-- own trigger and every later one by `revise_quote()`, and an issued document
-- is never removed. The draft header is updatable here; which of its columns a
-- client may actually change is `quote_versions_freeze_guard()`'s decision.
--
create policy "Quote versions follow their quote for reads"
    on public.quote_versions for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_versions.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

create policy "Quote versions follow their quote for updates"
    on public.quote_versions for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_versions.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    )
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_versions.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

create policy "Quote lines follow their quote for reads"
    on public.quote_lines for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_lines.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

-- `quote_lines.quote_id` is filled by a BEFORE trigger when the client omits it,
-- and WITH CHECK is evaluated after BEFORE triggers, so the check below sees the
-- derived value rather than a null.
create policy "Quote lines follow their quote for inserts"
    on public.quote_lines for insert to authenticated
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_lines.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

create policy "Quote lines follow their quote for updates"
    on public.quote_lines for update to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_lines.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    )
    with check (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_lines.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

create policy "Quote lines follow their quote for deletes"
    on public.quote_lines for delete to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_lines.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

--
-- Comments: reads follow the quote, edits belong to the author.
--
-- Update is AUTHOR-only, not owner-only: a rep editing a colleague's note on a
-- shared quote is indistinguishable from a forgery. There is NO delete policy
-- (and no DELETE privilege): a comment is deleted softly, through this same
-- update, because a shared message may already have been read and `parent_id`
-- would cascade a hard delete into other people's replies. What the update may
-- change is `quote_comments_before_update()`'s decision.
--
-- A client may only ever write an INTERNAL comment. Customer comments arrive
-- through the portal function (service role); without `author_kind =
-- 'internal'` in the check below, any signed-in user could post a remark in a
-- customer's name.
--
create policy "Quote comments follow their quote for reads"
    on public.quote_comments for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_comments.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

create policy "Quote comments are written internally on visible quotes"
    on public.quote_comments for insert to authenticated
    with check (
        author_kind = 'internal'
        and author_sales_id = (select public.current_sale_id())
        and (
            (select public.can_manage_all())
            or exists (
                select 1 from public.quotes q
                where q.id = quote_comments.quote_id
                  and q.sales_id = (select public.current_sale_id())
            )
        )
    );

create policy "Quote comments are edited by their author"
    on public.quote_comments for update to authenticated
    using (author_sales_id = (select public.current_sale_id()))
    with check (author_sales_id = (select public.current_sale_id()));

create policy "Quote comments are deleted by their author"
    on public.quote_comments for delete to authenticated
    using (author_sales_id = (select public.current_sale_id()));

--
-- Access tokens: row level security ON and NO POLICY AT ALL, on purpose.
--
-- Reads go through `quote_access_tokens_summary`, which omits `token_hash`;
-- writes go through `issue_quote_version()` / `revoke_quote_token()`. A select
-- policy here would put the hash one PostgREST call away from every rep.
--

--
-- Audit trail: reads follow the quote, and nothing else.
--
-- No insert / update / delete policy on purpose. The writers are SECURITY
-- DEFINER functions; the grants in 06_grants.sql withhold the privileges as
-- well, and a trigger refuses the mutation on top of that.
--
-- The select policy on `quote_portal_events` is not optional even though the
-- table is written server-side only: Realtime honours RLS (Phase 9), and a
-- subscription with no policy behind it delivers nothing, in silence.
--
create policy "Quote status changes follow their quote for reads"
    on public.quote_status_changes for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_status_changes.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );

create policy "Quote portal events follow their quote for reads"
    on public.quote_portal_events for select to authenticated
    using (
        (select public.can_manage_all())
        or exists (
            select 1 from public.quotes q
            where q.id = quote_portal_events.quote_id
              and q.sales_id = (select public.current_sale_id())
        )
    );
