--
-- Triggers
-- This file declares all triggers.
--

-- Auto-populate sales_id from current auth user on insert
create or replace trigger set_company_sales_id_trigger
    before insert on public.companies
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_sales_id_trigger
    before insert on public.contacts
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_notes_sales_id_trigger
    before insert on public.contact_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_deal_sales_id_trigger
    before insert on public.deals
    for each row execute function public.set_sales_id_default();

-- Deals are edited over time like leads are, and nothing moved this column
-- until now: `updated_at` equalled `created_at` on every pre-existing row.
create or replace trigger set_deal_updated_at_trigger
    before update on public.deals
    for each row execute function public.set_updated_at();

create or replace trigger set_deal_notes_sales_id_trigger
    before insert on public.deal_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_task_sales_id_trigger
    before insert on public.tasks
    for each row execute function public.set_sales_id_default();

create or replace trigger set_lead_sales_id_trigger
    before insert on public.leads
    for each row execute function public.set_sales_id_default();

-- Leads are worked over time, so the list can sort by "last touched".
create or replace trigger set_lead_updated_at_trigger
    before update on public.leads
    for each row execute function public.set_updated_at();

-- Auto-fetch company logo from website favicon on save
create or replace trigger company_saved
    before insert or update on public.companies
    for each row execute function public.handle_company_saved();

-- Lowercase contact emails before insert or update (must run before contact_saved)
create or replace trigger "10_lowercase_contact_emails"
    before insert or update on public.contacts
    for each row execute function public.lowercase_email_jsonb();

-- Auto-fetch contact avatar from email on save (runs after lowercase_contact_emails)
create or replace trigger "20_contact_saved"
    before insert or update on public.contacts
    for each row execute function public.handle_contact_saved();

-- Update contact.last_seen when a contact note is created
create or replace trigger on_public_contact_notes_created_or_updated
    after insert on public.contact_notes
    for each row execute function public.handle_contact_note_created_or_updated();

-- Cleanup storage attachments when contact notes are updated or deleted
create or replace trigger on_contact_notes_attachments_updated_delete_note_attachments
    after update on public.contact_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_contact_notes_deleted_delete_note_attachments
    after delete on public.contact_notes
    for each row execute function public.cleanup_note_attachments();

-- Cleanup storage attachments when deal notes are updated or deleted
create or replace trigger on_deal_notes_attachments_updated_delete_note_attachments
    after update on public.deal_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_deal_notes_deleted_delete_note_attachments
    after delete on public.deal_notes
    for each row execute function public.cleanup_note_attachments();

-- Auth triggers: sync auth.users to public.sales
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_update_user();

--
-- Task module (§3.3, §4.5, §5.4, §5.5, W8)
--

-- `updated_at` maintenance on tasks.
create or replace trigger tasks_set_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();

-- Keep the legacy `type`/`done_date` shims in sync with the new FK columns.
create or replace trigger tasks_keep_legacy_shims
    before insert or update on public.tasks
    for each row execute function public.tasks_keep_legacy_shims();

-- Fill the new NOT NULL columns from the legacy shims on insert (old frontend).
create or replace trigger tasks_defaults_on_insert
    before insert on public.tasks
    for each row execute function public.tasks_defaults_on_insert();

-- Seed the owner assignment and the primary contact link on insert.
create or replace trigger tasks_seed_assignments_links
    after insert on public.tasks
    for each row execute function public.tasks_seed_assignments_links();

-- Denormalized counters (reschedule/reassign/blocked clock).
create or replace trigger tasks_maintain_counters
    before insert or update on public.tasks
    for each row execute function public.tasks_maintain_counters();

-- Emit the immutable event stream.
create or replace trigger tasks_audit
    after insert or update on public.tasks
    for each row execute function public.log_task_changes();

-- Status changes may only come through `transition_task()`.
create or replace trigger tasks_status_guard
    before update on public.tasks
    for each row
    when (old.status_id is distinct from new.status_id)
    execute function public.tasks_status_guard();

-- "Delete" is a soft delete (W8 fix / §4.4).
create or replace trigger tasks_soft_delete
    before delete on public.tasks
    for each row execute function public.tasks_soft_delete();

-- Deleting a parent closes its task links instead of cascading (W8).
create or replace trigger tasks_close_links_on_contact_delete
    before delete on public.contacts
    for each row execute function public.close_task_links_for_entity('contact');

create or replace trigger tasks_close_links_on_lead_delete
    before delete on public.leads
    for each row execute function public.close_task_links_for_entity('lead');

create or replace trigger tasks_close_links_on_company_delete
    before delete on public.companies
    for each row execute function public.close_task_links_for_entity('company');

create or replace trigger tasks_close_links_on_deal_delete
    before delete on public.deals
    for each row execute function public.close_task_links_for_entity('deal');

-- The event stream is append-only (§5.5).
create or replace trigger task_events_immutable
    before update or delete on public.task_events
    for each row execute function public.reject_history_mutation();

-- Attribute a soft delete performed as an UPDATE (§5, §17.1).
create or replace trigger tasks_stamp_deleted_by
    before update on public.tasks
    for each row
    when (old.deleted_at is distinct from new.deleted_at)
    execute function public.tasks_stamp_deleted_by();

--
-- Collaboration (§8)
--

-- Authorship comes from the session; threads are one level deep.
create or replace trigger task_comments_before_insert
    before insert on public.task_comments
    for each row execute function public.task_comments_before_insert();

-- Counter, `comment.created`, and the server-side mention parse.
create or replace trigger task_comments_after_insert
    after insert on public.task_comments
    for each row execute function public.task_comments_after_insert();

-- The previous body becomes a revision before the update overwrites it.
create or replace trigger task_comments_before_update
    before update on public.task_comments
    for each row execute function public.task_comments_before_update();

-- `comment.edited` / `comment.deleted`, counter, mention re-parse.
create or replace trigger task_comments_after_update
    after update on public.task_comments
    for each row execute function public.task_comments_after_update();

-- Revisions are as immutable as the event stream: an edit history that can be
-- rewritten is not a history (§5.1).
create or replace trigger task_comment_revisions_immutable
    before update or delete on public.task_comment_revisions
    for each row execute function public.reject_history_mutation();

-- A reaction is always your own, and lands in the audit trail.
create or replace trigger task_comment_reactions_set_sale
    before insert on public.task_comment_reactions
    for each row execute function public.task_comment_reactions_set_sale();

create or replace trigger task_comment_reactions_audit
    after insert or delete on public.task_comment_reactions
    for each row execute function public.task_comment_reactions_audit();

--
-- Attachments (§3.2, §8.2)
--

-- Authorship from the session, and the row's path must match its task.
create or replace trigger task_attachments_before_insert
    before insert on public.task_attachments
    for each row execute function public.task_attachments_before_insert();

-- Who removed the file, and the facts that never move.
create or replace trigger task_attachments_before_update
    before update on public.task_attachments
    for each row execute function public.task_attachments_before_update();

-- `attachment.added` / `attachment.removed`, plus `tasks.attachment_count`.
create or replace trigger task_attachments_audit
    after insert or update on public.task_attachments
    for each row execute function public.task_attachments_audit();

--
-- Checklists (§11)
--

-- Authorship and default ordering.
create or replace trigger task_checklist_items_before_insert
    before insert on public.task_checklist_items
    for each row execute function public.task_checklist_items_before_insert();

-- Ticking the box stamps who did it and when.
create or replace trigger task_checklist_items_before_update
    before update on public.task_checklist_items
    for each row execute function public.task_checklist_items_before_update();

-- One event stream for everything (§11.3), plus the "3/7" counters.
create or replace trigger task_checklist_items_audit
    after insert or update on public.task_checklist_items
    for each row execute function public.task_checklist_items_audit();

--
-- Dependencies (§10)
--

-- The edge is created by the session.
create or replace trigger task_dependencies_before_insert
    before insert on public.task_dependencies
    for each row execute function public.task_dependencies_before_insert();

-- A cycle is refused before it exists (§10.3).
create or replace trigger task_dependencies_no_cycle
    before insert or update on public.task_dependencies
    for each row execute function public.assert_no_dependency_cycle();

-- Events on both tasks, plus the automatic block / release.
create or replace trigger task_dependencies_audit
    after insert or update on public.task_dependencies
    for each row execute function public.task_dependencies_audit();

-- Closing a task releases whatever it was blocking (§10.4). Declared after
-- `tasks_audit` so the task's own status event is emitted before the
-- dependents' unblock events, keeping the timeline in causal order.
create or replace trigger tasks_unblock_dependents
    after update on public.tasks
    for each row
    when (old.status_id is distinct from new.status_id)
    execute function public.tasks_unblock_dependents();

--
-- Reminders (§9)
--

-- Authorship, and the `next_fire_at` the scheduler actually reads.
create or replace trigger task_reminders_before_write
    before insert or update on public.task_reminders
    for each row execute function public.task_reminders_before_write();

-- Creating, editing and cancelling a rule are all in the task's timeline.
create or replace trigger task_reminders_audit
    after insert or update on public.task_reminders
    for each row execute function public.task_reminders_audit();

-- A delivery that failed is as much a fact as one that succeeded (O6).
create or replace trigger task_notifications_audit
    after update on public.task_notifications
    for each row execute function public.task_notifications_audit();

-- Moving the due date moves the reminders that hang off it.
create or replace trigger tasks_refresh_relative_reminders
    after update on public.tasks
    for each row
    when (old.due_date is distinct from new.due_date)
    execute function public.tasks_refresh_relative_reminders();

-- Closing or deleting a task stops its pending pings.
create or replace trigger tasks_cancel_reminders_on_close
    after update on public.tasks
    for each row
    when (old.status_id is distinct from new.status_id
       or old.deleted_at is distinct from new.deleted_at)
    execute function public.tasks_cancel_reminders_on_close();

--
-- Participants (§7)
--

-- Authorship on both ends of an assignment.
create or replace trigger task_assignments_before_write
    before insert or update on public.task_assignments
    for each row execute function public.task_assignments_before_write();

-- Watchers, collaborators and teams joining or leaving are in the timeline.
create or replace trigger task_assignments_audit
    after insert or update on public.task_assignments
    for each row execute function public.task_assignments_audit();

-- The owner projection on `tasks` and the assignment history cannot drift.
create or replace trigger tasks_sync_owner_assignment
    after update on public.tasks
    for each row
    when (old.owner_sales_id is distinct from new.owner_sales_id)
    execute function public.tasks_sync_owner_assignment();

-- Preferences carry an updated_at like every other user-editable row.
create or replace trigger notification_preferences_set_updated_at
    before update on public.notification_preferences
    for each row execute function public.set_updated_at();

--
-- Deal stage history
--

-- Every stage change is recorded, whichever path wrote it. The `when` clause
-- keeps the kanban's neighbour reindexing (which rewrites `index` on a handful
-- of rows per drop) out of the history.
create or replace trigger deals_log_stage_change
    after update of stage on public.deals
    for each row
    when (old.stage is distinct from new.stage)
    execute function public.deals_log_stage_change();

-- The requirements table is edited from a settings screen like any other
-- user-editable row, so it carries an updated_at that maintains itself.
create or replace trigger deal_stage_requirements_set_updated_at
    before update on public.deal_stage_requirements
    for each row execute function public.set_updated_at();

--
-- `reports.updated_at` maintains itself, like every other user-editable row.
--
-- The library sorts on this column, so without the trigger a report edited
-- today would keep sitting wherever its creation date put it -- the list would
-- look sorted and be wrong, which is the failure mode `deals.updated_at` spent
-- a whole migration fixing.
--
create or replace trigger reports_set_updated_at
    before update on public.reports
    for each row execute function public.set_updated_at();

--
-- Preferences carry an updated_at like every other user-editable row.
--
create or replace trigger report_preferences_set_updated_at
    before update on public.report_preferences
    for each row execute function public.set_updated_at();

--
-- Quotes / CPQ module (docs/proposals/quotes-cpq-module.md, Phase 2)
--

-- The catalogue carries an updated_at like every other user-editable row.
create or replace trigger products_set_updated_at
    before update on public.products
    for each row execute function public.set_updated_at();

create or replace trigger price_lists_set_updated_at
    before update on public.price_lists
    for each row execute function public.set_updated_at();

create or replace trigger quote_discount_rules_set_updated_at
    before update on public.quote_discount_rules
    for each row execute function public.set_updated_at();

-- "Who changed this price" has an answer.
create or replace trigger products_audit
    after insert or update on public.products
    for each row execute function public.products_audit();

create or replace trigger product_events_immutable
    before update or delete on public.product_events
    for each row execute function public.reject_quote_history_mutation();

-- Quote header: owner, number, author, and the working draft.
create or replace trigger set_quote_sales_id_trigger
    before insert on public.quotes
    for each row execute function public.set_sales_id_default();

create or replace trigger quotes_set_defaults
    before insert on public.quotes
    for each row execute function public.quotes_set_defaults();

create or replace trigger quotes_set_updated_at
    before update on public.quotes
    for each row execute function public.set_updated_at();

create or replace trigger quotes_seed_first_version
    after insert on public.quotes
    for each row execute function public.quotes_seed_first_version();

-- `valid_until` / `terms` on the header mirror the current version and are
-- edited there, never here.
create or replace trigger quotes_header_guard
    before update on public.quotes
    for each row
    when (old.valid_until is distinct from new.valid_until
          or old.terms is distinct from new.terms)
    execute function public.quotes_header_guard();

-- Status changes may only come through `transition_quote()` / the functions
-- that delegate to `apply_quote_status()`.
create or replace trigger quotes_status_guard
    before update on public.quotes
    for each row
    when (old.status_key is distinct from new.status_key)
    execute function public.quotes_status_guard();

-- Every status change is recorded, whichever function wrote it.
create or replace trigger quotes_log_status_change
    after update of status_key on public.quotes
    for each row
    when (old.status_key is distinct from new.status_key)
    execute function public.quotes_log_status_change();

-- Versions: carriers on the way in, immutability once issued.
create or replace trigger quote_versions_before_insert
    before insert on public.quote_versions
    for each row execute function public.quote_versions_before_insert();

-- The header's `valid_until` / `terms` follow the current version.
create or replace trigger quote_versions_sync_header
    after insert or update of valid_until, terms on public.quote_versions
    for each row execute function public.quote_versions_sync_header();

create or replace trigger quote_versions_freeze_guard
    before update or delete on public.quote_versions
    for each row execute function public.quote_versions_freeze_guard();

-- Lines: never under a frozen document, and the totals follow them.
create or replace trigger quote_lines_freeze_guard
    before insert or update or delete on public.quote_lines
    for each row execute function public.quote_lines_freeze_guard();

create or replace trigger quote_lines_set_carrier
    before insert on public.quote_lines
    for each row execute function public.quote_lines_set_carrier();

-- Named to sort AFTER the carrier: triggers of one kind fire in name order, and
-- the snapshot reads the product the carrier has nothing to do with, so the
-- order is incidental -- but a snapshot that ran first would be one rename away
-- from mattering.
create or replace trigger quote_lines_snapshot_defaults
    before insert on public.quote_lines
    for each row execute function public.quote_lines_snapshot_defaults();

create or replace trigger quote_lines_refresh_totals
    after insert or update or delete on public.quote_lines
    for each row execute function public.quote_lines_refresh_totals();

-- Authorship from the session, the thread one level deep, the server's clock.
create or replace trigger quote_comments_before_insert
    before insert on public.quote_comments
    for each row execute function public.quote_comments_before_insert();

-- What a written comment still accepts: an edit, a soft delete, a read mark.
create or replace trigger quote_comments_before_update
    before update on public.quote_comments
    for each row execute function public.quote_comments_before_update();

-- The audit trail is append-only (§5).
create or replace trigger quote_status_changes_immutable
    before update or delete on public.quote_status_changes
    for each row execute function public.reject_quote_history_mutation();

create or replace trigger quote_portal_events_immutable
    before update or delete on public.quote_portal_events
    for each row execute function public.reject_quote_history_mutation();

-- What the customer did, turned into a notification (§8, Phase 11).
--
-- AFTER INSERT, on the trail rather than inside each portal function: the event
-- row IS the record of what happened (§5), so deriving the notification from it
-- means a portal path added later cannot forget to notify. AFTER, so a
-- notification that fails cannot stop the event being recorded.
create or replace trigger quote_portal_events_notify
    after insert on public.quote_portal_events
    for each row execute function public.quote_portal_events_notify();

-- Customer portal slides: limits, box shape, the default template's lock.
create or replace trigger portal_slides_guard
    before insert or update or delete on public.portal_slides
    for each row execute function public.portal_slides_guard();

create or replace trigger portal_templates_guard
    before insert or update or delete on public.portal_templates
    for each row execute function public.portal_templates_guard();

-- The deal follows its quotations (`sync_deal_from_quote()`).
create or replace trigger quotes_sync_deal
    after update of status_key on public.quotes
    for each row
    when (old.status_key is distinct from new.status_key)
    execute function public.quotes_sync_deal();

create or replace trigger quote_portal_events_sync_deal
    after insert on public.quote_portal_events
    for each row execute function public.quote_portal_events_sync_deal();
