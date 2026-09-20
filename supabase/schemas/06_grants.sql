--
-- Grants
-- This file declares all grants and default privileges for the public schema.
--

-- Schema usage
grant usage on schema public to postgres;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Function grants
grant all on function public.cleanup_note_attachments() to anon;
grant all on function public.cleanup_note_attachments() to authenticated;
grant all on function public.cleanup_note_attachments() to service_role;

grant all on function public.can_manage_all() to anon;
grant all on function public.can_manage_all() to authenticated;
grant all on function public.can_manage_all() to service_role;

grant all on function public.current_sale_id() to anon;
grant all on function public.current_sale_id() to authenticated;
grant all on function public.current_sale_id() to service_role;

grant all on function public.current_sales_role() to anon;
grant all on function public.current_sales_role() to authenticated;
grant all on function public.current_sales_role() to service_role;

grant all on function public.convert_lead(bigint, boolean, text, bigint) to anon;
grant all on function public.convert_lead(bigint, boolean, text, bigint) to authenticated;
grant all on function public.convert_lead(bigint, boolean, text, bigint) to service_role;

grant all on function public.get_avatar_for_email(text) to anon;
grant all on function public.get_avatar_for_email(text) to authenticated;
grant all on function public.get_avatar_for_email(text) to service_role;

grant all on function public.get_domain_favicon(text) to anon;
grant all on function public.get_domain_favicon(text) to authenticated;
grant all on function public.get_domain_favicon(text) to service_role;

grant all on function public.get_note_attachments_function_url() to anon;
grant all on function public.get_note_attachments_function_url() to authenticated;
grant all on function public.get_note_attachments_function_url() to service_role;

revoke all on function public.get_user_id_by_email(text) from public;
grant all on function public.get_user_id_by_email(text) to service_role;

grant all on function public.handle_company_saved() to anon;
grant all on function public.handle_company_saved() to authenticated;
grant all on function public.handle_company_saved() to service_role;

grant all on function public.handle_contact_note_created_or_updated() to anon;
grant all on function public.handle_contact_note_created_or_updated() to authenticated;
grant all on function public.handle_contact_note_created_or_updated() to service_role;

grant all on function public.handle_contact_saved() to anon;
grant all on function public.handle_contact_saved() to authenticated;
grant all on function public.handle_contact_saved() to service_role;

grant all on function public.handle_new_user() to anon;
grant all on function public.handle_new_user() to authenticated;
grant all on function public.handle_new_user() to service_role;

grant all on function public.handle_update_user() to anon;
grant all on function public.handle_update_user() to authenticated;
grant all on function public.handle_update_user() to service_role;

grant all on function public.is_admin() to anon;
grant all on function public.is_admin() to authenticated;
grant all on function public.is_admin() to service_role;

grant all on function public.lowercase_email_jsonb() to anon;
grant all on function public.lowercase_email_jsonb() to authenticated;
grant all on function public.lowercase_email_jsonb() to service_role;

grant all on function public.merge_contacts(bigint, bigint) to anon;
grant all on function public.merge_contacts(bigint, bigint) to authenticated;
grant all on function public.merge_contacts(bigint, bigint) to service_role;

grant all on function public.set_sales_id_default() to anon;
grant all on function public.set_sales_id_default() to authenticated;
grant all on function public.set_sales_id_default() to service_role;

grant all on function public.set_updated_at() to anon;
grant all on function public.set_updated_at() to authenticated;
grant all on function public.set_updated_at() to service_role;

-- Task module functions (§7.3, §4.5, §5.5, §17.3)
grant all on function public.can_see_task(bigint) to authenticated;
grant all on function public.can_see_task(bigint) to service_role;

grant all on function public.transition_task(bigint, text, text, jsonb) to authenticated;
grant all on function public.transition_task(bigint, text, text, jsonb) to service_role;

grant all on function public.link_task_to_entity(bigint, public.task_entity, bigint, text, boolean) to authenticated;
grant all on function public.link_task_to_entity(bigint, public.task_entity, bigint, text, boolean) to service_role;

grant all on function public.request_context() to authenticated;
grant all on function public.request_context() to service_role;

grant all on function public.emit_task_event(bigint, public.task_event_type, bigint, jsonb, jsonb, jsonb, text, text) to service_role;
grant all on function public.log_task_changes() to service_role;
grant all on function public.reject_history_mutation() to service_role;
grant all on function public.tasks_status_guard() to service_role;
grant all on function public.tasks_stamp_deleted_by() to service_role;

-- Collaboration triggers (§8). Trigger functions are never called directly by
-- a client, so `authenticated` gets nothing.
grant all on function public.sync_comment_mentions(bigint, bigint, text, bigint) to service_role;
grant all on function public.task_comments_before_insert() to service_role;
grant all on function public.task_comments_after_insert() to service_role;
grant all on function public.task_comments_before_update() to service_role;
grant all on function public.task_comments_after_update() to service_role;
grant all on function public.task_comment_reactions_set_sale() to service_role;
grant all on function public.task_comment_reactions_audit() to service_role;

-- Attachment triggers (§3.2, §8.2).
grant all on function public.refresh_attachment_counter(bigint) to service_role;
grant all on function public.task_attachments_before_insert() to service_role;
grant all on function public.task_attachments_before_update() to service_role;
grant all on function public.task_attachments_audit() to service_role;

-- Checklist triggers (§11).
grant all on function public.refresh_checklist_counters(bigint) to service_role;
grant all on function public.task_checklist_items_before_insert() to service_role;
grant all on function public.task_checklist_items_before_update() to service_role;
grant all on function public.task_checklist_items_audit() to service_role;

-- Dependencies (§10). `task_has_open_blockers` is read-only and useful to the
-- UI ("why is this blocked?"), so authenticated may call it.
grant all on function public.task_has_open_blockers(bigint) to authenticated;
grant all on function public.task_has_open_blockers(bigint) to service_role;
grant all on function public.set_task_status_system(bigint, text, public.task_event_type, jsonb) to service_role;
grant all on function public.assert_no_dependency_cycle() to service_role;
grant all on function public.task_dependencies_before_insert() to service_role;
grant all on function public.task_dependencies_audit() to service_role;
grant all on function public.tasks_unblock_dependents() to service_role;

-- Reminders (§9). The schedule helpers are read-only and the reminder form
-- needs them to show "next: Monday 09:00" before saving, so authenticated may
-- call them. `dispatch_due_reminders` is the scheduler's, and only the
-- scheduler's: it writes the outbox on behalf of everyone.
grant all on function public.next_rrule_occurrence(text, timestamp with time zone, text, timestamp with time zone) to authenticated;
grant all on function public.next_rrule_occurrence(text, timestamp with time zone, text, timestamp with time zone) to service_role;
grant all on function public.compute_reminder_next_fire(jsonb, timestamp with time zone) to authenticated;
grant all on function public.compute_reminder_next_fire(jsonb, timestamp with time zone) to service_role;
grant all on function public.reminder_recipient_ids(jsonb) to service_role;
grant all on function public.dispatch_due_reminders(integer) to service_role;
grant all on function public.task_reminders_before_write() to service_role;
grant all on function public.task_reminders_audit() to service_role;
grant all on function public.task_notifications_audit() to service_role;
grant all on function public.tasks_refresh_relative_reminders() to service_role;
grant all on function public.tasks_cancel_reminders_on_close() to service_role;
grant all on function public.task_assignments_before_write() to service_role;
grant all on function public.task_assignments_audit() to service_role;
grant all on function public.tasks_sync_owner_assignment() to service_role;

-- Deal visibility predicate, read by the deal-attachments storage policy.
grant all on function public.can_see_deal(bigint) to authenticated;
grant all on function public.can_see_deal(bigint) to service_role;

-- Partition maintenance (§5.1). The scheduler's and an operator's; a browser
-- session has no reason to create tables.
revoke all on function public.ensure_task_events_partitions(integer) from public, anon, authenticated;
grant all on function public.ensure_task_events_partitions(integer) to service_role;

-- The delivery worker's claim/settle pair (§9.3). Service role only: these
-- bypass RLS by design, so no browser session may reach them.
revoke all on function public.claim_task_notifications(public.reminder_channel[], integer) from public, anon, authenticated;
revoke all on function public.complete_task_notification(bigint, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.requeue_stale_task_notifications(interval) from public, anon, authenticated;
grant all on function public.claim_task_notifications(public.reminder_channel[], integer) to service_role;
grant all on function public.complete_task_notification(bigint, text, text, text, integer) to service_role;
grant all on function public.requeue_stale_task_notifications(interval) to service_role;

-- Table grants
grant all on table public.companies to anon;
grant all on table public.companies to authenticated;
grant all on table public.companies to service_role;

grant all on table public.contacts to anon;
grant all on table public.contacts to authenticated;
grant all on table public.contacts to service_role;

grant all on table public.contact_notes to anon;
grant all on table public.contact_notes to authenticated;
grant all on table public.contact_notes to service_role;

grant all on table public.deals to anon;
grant all on table public.deals to authenticated;
grant all on table public.deals to service_role;

grant all on table public.deal_notes to anon;
grant all on table public.deal_notes to authenticated;
grant all on table public.deal_notes to service_role;

grant all on table public.sales to anon;
grant all on table public.sales to authenticated;
grant all on table public.sales to service_role;

grant all on table public.leads to anon;
grant all on table public.leads to authenticated;
grant all on table public.leads to service_role;

grant all on table public.tags to anon;
grant all on table public.tags to authenticated;
grant all on table public.tags to service_role;

grant all on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

-- Task module tables (§17.3 P1: no anon grants on task tables)
grant select, insert, update, delete on table public.task_statuses to authenticated;
grant all on table public.task_statuses to service_role;

grant select, insert, update, delete on table public.task_priorities to authenticated;
grant all on table public.task_priorities to service_role;

grant select, insert, update, delete on table public.task_types to authenticated;
grant all on table public.task_types to service_role;

grant select, insert, update on table public.task_assignments to authenticated;
grant all on table public.task_assignments to service_role;

grant select, insert, update on table public.task_links to authenticated;
grant all on table public.task_links to service_role;

-- Writes are gated to admins and managers by RLS (05_policies.sql).
grant select, insert, update, delete on table public.teams to authenticated;
grant all on table public.teams to service_role;

grant select, insert, update, delete on table public.team_members to authenticated;
grant all on table public.team_members to service_role;

-- Reads are gated too, not just writes: see the policy in 05_policies.sql.
grant select, insert, update, delete on table public.team_budgets to authenticated;
grant all on table public.team_budgets to service_role;

-- Same gating, for the same reason: a personal quota is not public either.
grant select, insert, update, delete on table public.team_member_budgets to authenticated;
grant all on table public.team_member_budgets to service_role;

grant all on table public.task_transitions to authenticated;
grant all on table public.task_transitions to service_role;

grant select on table public.task_events to authenticated;
grant all on table public.task_events to service_role;

-- Collaboration (§8). No `delete` on comments: deletion is a soft delete
-- performed as an update, so the body survives for the audit view.
grant select, insert, update on table public.task_comments to authenticated;
grant all on table public.task_comments to service_role;

-- Revisions are written by the trigger only, and never rewritten.
grant select on table public.task_comment_revisions to authenticated;
grant all on table public.task_comment_revisions to service_role;

-- Mentions are derived from the body server-side; a client may only mark its
-- own as read.
grant select, update on table public.task_comment_mentions to authenticated;
grant all on table public.task_comment_mentions to service_role;

grant select, insert, delete on table public.task_comment_reactions to authenticated;
grant all on table public.task_comment_reactions to service_role;

-- `alter default privileges` (bottom of this file) hands `anon` every new table
-- in the schema. RLS already refuses anon — none of these has a policy for it —
-- but §17.3 P1 asks for no anon grants on task tables at all, so the blanket
-- default is taken back explicitly here rather than left to the policy layer.
revoke all on table public.task_comments from anon;
revoke all on table public.task_comment_revisions from anon;
revoke all on table public.task_comment_mentions from anon;
revoke all on table public.task_comment_reactions from anon;

-- Attachments (§3.2). No `delete`: removal is a soft delete via update, so the
-- `attachment.removed` event keeps pointing at a row that still exists.
grant select, insert, update on table public.task_attachments to authenticated;
grant all on table public.task_attachments to service_role;
revoke all on table public.task_attachments from anon;

-- Checklists (§11). No `delete`: removal is a soft delete via update.
grant select, insert, update on table public.task_checklist_items to authenticated;
grant all on table public.task_checklist_items to service_role;
revoke all on table public.task_checklist_items from anon;

-- Dependencies (§10). No `delete`: an edge is closed with `removed_at`.
grant select, insert, update on table public.task_dependencies to authenticated;
grant all on table public.task_dependencies to service_role;
revoke all on table public.task_dependencies from anon;

-- Reminders (§9). No `delete` on rules: cancelling is `is_active = false`, so
-- the fact that somebody switched the chase off stays in the history.
grant select, insert, update on table public.task_reminders to authenticated;
grant all on table public.task_reminders to service_role;
revoke all on table public.task_reminders from anon;

-- The outbox is written by the dispatcher, never by a client: `authenticated`
-- may read its own rows and stamp them read/acknowledged, nothing more. An
-- insert grant here would let any client forge a delivery receipt.
grant select, update on table public.task_notifications to authenticated;
grant all on table public.task_notifications to service_role;
revoke all on table public.task_notifications from anon;

grant all on table public.configuration to anon;
grant all on table public.configuration to authenticated;
grant all on table public.configuration to service_role;

grant all on table public.favicons_excluded_domains to anon;
grant all on table public.favicons_excluded_domains to authenticated;
grant all on table public.favicons_excluded_domains to service_role;

-- View grants
grant all on table public.activity_log to anon;
grant all on table public.activity_log to authenticated;
grant all on table public.activity_log to service_role;

grant all on table public.companies_summary to anon;
grant all on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;

grant all on table public.contacts_summary to anon;
grant all on table public.contacts_summary to authenticated;
grant all on table public.contacts_summary to service_role;
-- tasks_summary is read-only: writes go to public.tasks (§3.4).
grant select on table public.tasks_summary to authenticated;
grant select on table public.tasks_summary to service_role;
-- teams_summary likewise: writes go to public.teams.
grant select on table public.teams_summary to authenticated;
grant select on table public.teams_summary to service_role;
-- team_members_summary likewise: writes go to public.team_members.
grant select on table public.team_members_summary to authenticated;
grant select on table public.team_members_summary to service_role;
-- The dashboard drill-down cube. Pure aggregate — there is nothing to write to.
grant select on table public.team_deal_stats to authenticated;
grant select on table public.team_deal_stats to service_role;
-- team_workload_summary: read-only workload report, kept off teams_summary so
-- the plain team list does not pay for counters it never shows.
grant select on table public.team_workload_summary to authenticated;
grant select on table public.team_workload_summary to service_role;
-- team_task_stats: read-only reporting cube, like team_deal_stats above.
grant select on table public.team_task_stats to authenticated;
grant select on table public.team_task_stats to service_role;

-- The unified timeline (§6.2). Read-only by construction — it is a union of
-- history that is written elsewhere, and `task_events` is append-only.
grant select on table public.timeline_events to authenticated;
grant select on table public.timeline_events to service_role;

grant all on table public.init_state to anon;
grant all on table public.init_state to authenticated;
grant all on table public.init_state to service_role;

-- Sequence grants
grant all on sequence public.companies_id_seq to anon;
grant all on sequence public.companies_id_seq to authenticated;
grant all on sequence public.companies_id_seq to service_role;

grant all on sequence public."contactNotes_id_seq" to anon;
grant all on sequence public."contactNotes_id_seq" to authenticated;
grant all on sequence public."contactNotes_id_seq" to service_role;

grant all on sequence public.contacts_id_seq to anon;
grant all on sequence public.contacts_id_seq to authenticated;
grant all on sequence public.contacts_id_seq to service_role;

grant all on sequence public."dealNotes_id_seq" to anon;
grant all on sequence public."dealNotes_id_seq" to authenticated;
grant all on sequence public."dealNotes_id_seq" to service_role;

grant all on sequence public.deals_id_seq to anon;
grant all on sequence public.deals_id_seq to authenticated;
grant all on sequence public.deals_id_seq to service_role;

grant all on sequence public.favicons_excluded_domains_id_seq to anon;
grant all on sequence public.favicons_excluded_domains_id_seq to authenticated;
grant all on sequence public.favicons_excluded_domains_id_seq to service_role;

grant all on sequence public.leads_id_seq to anon;
grant all on sequence public.leads_id_seq to authenticated;
grant all on sequence public.leads_id_seq to service_role;

grant all on sequence public.sales_id_seq to anon;
grant all on sequence public.sales_id_seq to authenticated;
grant all on sequence public.sales_id_seq to service_role;

grant all on sequence public.tags_id_seq to anon;
grant all on sequence public.tags_id_seq to authenticated;
grant all on sequence public.tags_id_seq to service_role;

grant all on sequence public.tasks_id_seq to authenticated;
grant all on sequence public.tasks_id_seq to service_role;

grant usage, select on sequence public.task_assignments_id_seq to authenticated;
grant all on sequence public.task_assignments_id_seq to service_role;

grant usage, select on sequence public.task_links_id_seq to authenticated;
grant all on sequence public.task_links_id_seq to service_role;

grant usage, select on sequence public.task_transitions_id_seq to authenticated;
grant all on sequence public.task_transitions_id_seq to service_role;

grant usage, select on sequence public.teams_id_seq to authenticated;
grant all on sequence public.teams_id_seq to service_role;

grant usage, select on sequence public.team_members_id_seq to authenticated;
grant all on sequence public.team_members_id_seq to service_role;

-- Only `task_comments` is inserted into directly by a client; revisions and
-- mentions are written by SECURITY DEFINER triggers, which run as the owner.
grant usage, select on sequence public.task_comments_id_seq to authenticated;
grant all on sequence public.task_comments_id_seq to service_role;
grant all on sequence public.task_comment_revisions_id_seq to service_role;
grant all on sequence public.task_comment_mentions_id_seq to service_role;

grant usage, select on sequence public.task_comment_reactions_id_seq to authenticated;
grant all on sequence public.task_comment_reactions_id_seq to service_role;

grant usage, select on sequence public.task_attachments_id_seq to authenticated;
grant all on sequence public.task_attachments_id_seq to service_role;

grant usage, select on sequence public.task_checklist_items_id_seq to authenticated;
grant all on sequence public.task_checklist_items_id_seq to service_role;

grant usage, select on sequence public.task_dependencies_id_seq to authenticated;
grant all on sequence public.task_dependencies_id_seq to service_role;

-- A client creates reminder RULES; the outbox rows are the dispatcher's, so
-- `authenticated` never needs its sequence.
grant usage, select on sequence public.task_reminders_id_seq to authenticated;
grant all on sequence public.task_reminders_id_seq to service_role;
grant all on sequence public.task_notifications_id_seq to service_role;

-- Rules are created by clients; notifications only ever by the dispatcher.
grant usage, select on sequence public.task_reminders_id_seq to authenticated;
grant all on sequence public.task_reminders_id_seq to service_role;
grant all on sequence public.task_notifications_id_seq to service_role;

-- Default privileges
alter default privileges for role postgres in schema public grant all on sequences to postgres;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant all on sequences to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to service_role;

alter default privileges for role postgres in schema public grant all on functions to postgres;
alter default privileges for role postgres in schema public grant all on functions to anon;
alter default privileges for role postgres in schema public grant all on functions to authenticated;
alter default privileges for role postgres in schema public grant all on functions to service_role;

alter default privileges for role postgres in schema public grant all on tables to postgres;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;

-- Anti-fatigue preferences (§9.5). Writes are owner-only via RLS.
grant select, insert, update, delete on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;
grant usage, select on sequence public.notification_preferences_id_seq to authenticated;
grant all on sequence public.notification_preferences_id_seq to service_role;
revoke all on function public.notification_prefs_for(bigint) from public, anon;
grant all on function public.notification_prefs_for(bigint) to authenticated, service_role;
grant all on function public.next_allowed_send_at(timestamp with time zone, text, time, time) to authenticated, service_role;
grant all on function public.next_digest_at(timestamp with time zone, text, time) to authenticated, service_role;

-- Retention only: a hard delete is available to nobody else (§4.4).
revoke all on function public.purge_tasks(bigint[], boolean) from public, anon, authenticated;
grant all on function public.purge_tasks(bigint[], boolean) to service_role;
grant all on function public.tasks_soft_delete() to service_role;

-- Deal stage history. Read-only for users: the rows come from the trigger, and
-- `move_deal_stage()` is the only way to add the reason and the files to one.
grant select on table public.deal_stage_changes to authenticated;
-- The default privileges on `public` already granted every DML verb to `anon`
-- and `authenticated` when the table was created, so the grant above narrows
-- nothing on its own. Row level security blocks the writes, but an UPDATE or
-- DELETE matching no row succeeds silently and TRUNCATE ignores RLS entirely.
revoke insert, update, delete, truncate on table public.deal_stage_changes
    from anon, authenticated;
grant all on table public.deal_stage_changes to service_role;
revoke all on function public.deals_log_stage_change() from public, anon, authenticated;
grant all on function public.deals_log_stage_change() to service_role;
revoke all on function public.move_deal_stage(bigint, text, text, integer, jsonb, text) from public, anon;
grant execute on function public.move_deal_stage(bigint, text, text, integer, jsonb, text) to authenticated, service_role;

-- The completed-task rule. Read-only for users on the table, and the gate
-- itself is executable by everyone: the kanban dialog calls it to show what is
-- missing before the move is attempted, and it is the same call the RPC makes
-- to decide, so the two can never disagree.
-- The write privileges are granted to `authenticated` and then narrowed to
-- admins by the policy, the same shape every other tunable table uses: the
-- privilege alone is not the authorisation.
grant select, insert, update, delete on table public.deal_stage_requirements to authenticated;
grant all on table public.deal_stage_requirements to service_role;
revoke all on function public.deal_stage_gate(bigint, text) from public, anon;
grant execute on function public.deal_stage_gate(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE to PUBLIC by default, which would reach `anon`.
-- RLS would still return nothing to an anonymous caller (every policy on these
-- tables is `to authenticated`), but revoking first is the same defence in
-- depth the rest of this schema applies.
--
revoke all on function public.deal_stage_stats(bigint, bigint) from public, anon;
revoke all on function public.deal_flow_stats(date, date, bigint, bigint) from public, anon;
revoke all on function public.deal_owner_stats(date, date, bigint) from public, anon;
revoke all on function public.lead_flow_stats(date, date, bigint) from public, anon;
revoke all on function public.lead_breakdown_stats(date, date, bigint) from public, anon;
revoke all on function public.task_flow_stats(date, date, bigint) from public, anon;
revoke all on function public.task_stock_stats(bigint) from public, anon;
revoke all on function public.task_type_stats(date, date, bigint) from public, anon;

grant execute on function public.deal_stage_stats(bigint, bigint) to authenticated, service_role;
grant execute on function public.deal_flow_stats(date, date, bigint, bigint) to authenticated, service_role;
grant execute on function public.deal_owner_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.lead_flow_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.lead_breakdown_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.task_flow_stats(date, date, bigint) to authenticated, service_role;
grant execute on function public.task_stock_stats(bigint) to authenticated, service_role;
grant execute on function public.task_type_stats(date, date, bigint) to authenticated, service_role;

--
-- Reports module
--
-- The catalogue is read-only for users at the PRIVILEGE level, not only at the
-- policy level. `report_fields.sql_expr` reaches the statement `run_report()`
-- executes, so write access to this table is write access to the database
-- under your own identity. Two independent mechanisms withhold it.
--
grant select on table public.report_datasets to authenticated;
grant select on table public.report_fields to authenticated;

revoke insert, update, delete, truncate on table public.report_datasets
    from authenticated, anon;
revoke insert, update, delete, truncate on table public.report_fields
    from authenticated, anon;

grant all on table public.report_datasets to service_role;
grant all on table public.report_fields to service_role;

-- Saved reports are ordinary user data: the policies do the scoping.
grant select, insert, update, delete on table public.reports to authenticated;
grant usage, select on sequence public.reports_id_seq to authenticated;
grant all on table public.reports to service_role;

grant execute on function public.report_catalog() to authenticated;
grant execute on function public.run_report(jsonb) to authenticated;

-- Granted, and it HAS to be: `run_report()` is SECURITY INVOKER, so its body
-- runs with the caller's privileges and an internal call to a function the
-- caller may not execute fails at run time. Withholding this grant would break
-- every report while looking like a tightening.
--
-- Exposing it costs nothing. It is immutable, it executes no SQL, and it
-- returns a string: a user calling it directly gets back a predicate they still
-- have no way to run.
grant execute on function
    public.report_filter_sql(text, text, text, jsonb) to authenticated;

grant select, insert, update, delete
    on table public.report_preferences to authenticated;
grant all on table public.report_preferences to service_role;

-- ===========================================================================
-- Quotes / CPQ module (docs/proposals/quotes-cpq-module.md, Phase 2, §7)
-- ===========================================================================
--
-- The `alter default privileges` block above hands `anon` AND `authenticated`
-- every privilege on every new table, view, sequence and function at creation
-- time -- including TRUNCATE, which ignores row level security entirely. So
-- every object below starts from `revoke all` and grants back exactly what it
-- needs. Narrowing by `grant` alone narrows nothing.
--
-- `quotes_anon_grants.test.sql` asserts `anon` holds no privilege on any table,
-- view or function in this module. That single test is what catches this trap
-- on the next table somebody adds.
--

-- Catalogue and tunables: readable by every user, written through the policies
-- (managers for the catalogue, admins for the status machine and the discount
-- ceiling). The privilege alone is not the authorisation.
revoke all on table public.tax_rates from anon, authenticated;
grant select, insert, update, delete on table public.tax_rates to authenticated;
grant all on table public.tax_rates to service_role;

revoke all on table public.quote_statuses from anon, authenticated;
grant select, insert, update, delete on table public.quote_statuses to authenticated;
grant all on table public.quote_statuses to service_role;

revoke all on table public.quote_transitions from anon, authenticated;
grant select, insert, update, delete on table public.quote_transitions to authenticated;
grant all on table public.quote_transitions to service_role;

revoke all on table public.quote_discount_rules from anon, authenticated;
grant select, insert, update, delete on table public.quote_discount_rules to authenticated;
grant all on table public.quote_discount_rules to service_role;

revoke all on table public.products from anon, authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant all on table public.products to service_role;

revoke all on table public.price_lists from anon, authenticated;
grant select, insert, update, delete on table public.price_lists to authenticated;
grant all on table public.price_lists to service_role;

revoke all on table public.price_list_items from anon, authenticated;
grant select, insert, update, delete on table public.price_list_items to authenticated;
grant all on table public.price_list_items to service_role;

-- Catalogue history: written by `products_audit()` only.
revoke all on table public.product_events from anon, authenticated;
grant select on table public.product_events to authenticated;
grant all on table public.product_events to service_role;

-- Quotes and their editable children. The policies scope the rows; the freeze
-- guards decide which of them are still writable.
--
-- No DELETE on `quotes`: a quote ends as `canceled`, and `purge_quotes()` is the
-- only way one is removed.
revoke all on table public.quotes from anon, authenticated;
grant select, insert, update on table public.quotes to authenticated;
grant all on table public.quotes to service_role;

-- No insert, no delete: see the policies. `update` stays table-level rather than
-- per column because react-admin posts the whole record back; the column rule
-- lives in `quote_versions_freeze_guard()`, which compares values instead of
-- refusing the column name.
revoke all on table public.quote_versions from anon, authenticated;
grant select, update on table public.quote_versions to authenticated;
grant all on table public.quote_versions to service_role;

revoke all on table public.quote_lines from anon, authenticated;
grant select, insert, update, delete on table public.quote_lines to authenticated;
grant all on table public.quote_lines to service_role;

-- No delete: a comment is deleted softly (see the policies).
revoke all on table public.quote_comments from anon, authenticated;
grant select, insert, update on table public.quote_comments to authenticated;
grant all on table public.quote_comments to service_role;

-- Tokens: nothing at all for users. Reads through the summary view, writes
-- through the functions.
revoke all on table public.quote_access_tokens from anon, authenticated;
grant all on table public.quote_access_tokens to service_role;

-- The audit trail: read-only for users, the double blindfold of §5.
revoke all on table public.quote_status_changes from anon, authenticated;
grant select on table public.quote_status_changes to authenticated;
grant all on table public.quote_status_changes to service_role;

revoke all on table public.quote_portal_events from anon, authenticated;
grant select on table public.quote_portal_events to authenticated;
grant all on table public.quote_portal_events to service_role;

-- Views: read-only projections.
revoke all on table public.quotes_summary from anon, authenticated;
grant select on table public.quotes_summary to authenticated;
grant select on table public.quotes_summary to service_role;

revoke all on table public.quote_access_tokens_summary from anon, authenticated;
grant select on table public.quote_access_tokens_summary to authenticated;
grant select on table public.quote_access_tokens_summary to service_role;

revoke all on table public.price_book from anon, authenticated;
grant select on table public.price_book to authenticated;
grant select on table public.price_book to service_role;

-- Sequences: `authenticated` only where a client inserts the row itself.
revoke all on sequence public.tax_rates_id_seq from anon;
revoke all on sequence public.quote_statuses_id_seq from anon;
revoke all on sequence public.quote_transitions_id_seq from anon;
revoke all on sequence public.products_id_seq from anon;
revoke all on sequence public.price_lists_id_seq from anon;
revoke all on sequence public.price_list_items_id_seq from anon;
revoke all on sequence public.quotes_id_seq from anon;
revoke all on sequence public.quote_lines_id_seq from anon;
revoke all on sequence public.quote_comments_id_seq from anon;
revoke all on sequence public.product_events_id_seq from anon, authenticated;
revoke all on sequence public.quote_versions_id_seq from anon, authenticated;
revoke all on sequence public.quote_access_tokens_id_seq from anon, authenticated;
revoke all on sequence public.quote_status_changes_id_seq from anon, authenticated;
revoke all on sequence public.quote_portal_events_id_seq from anon, authenticated;
revoke all on sequence public.quote_number_seq from anon, authenticated;

grant usage, select on sequence public.tax_rates_id_seq to authenticated;
grant usage, select on sequence public.quote_statuses_id_seq to authenticated;
grant usage, select on sequence public.quote_transitions_id_seq to authenticated;
grant usage, select on sequence public.products_id_seq to authenticated;
grant usage, select on sequence public.price_lists_id_seq to authenticated;
grant usage, select on sequence public.price_list_items_id_seq to authenticated;
grant usage, select on sequence public.quotes_id_seq to authenticated;
grant usage, select on sequence public.quote_lines_id_seq to authenticated;
grant usage, select on sequence public.quote_comments_id_seq to authenticated;

grant all on sequence public.tax_rates_id_seq to service_role;
grant all on sequence public.quote_statuses_id_seq to service_role;
grant all on sequence public.quote_transitions_id_seq to service_role;
grant all on sequence public.products_id_seq to service_role;
grant all on sequence public.price_lists_id_seq to service_role;
grant all on sequence public.price_list_items_id_seq to service_role;
grant all on sequence public.quotes_id_seq to service_role;
grant all on sequence public.quote_lines_id_seq to service_role;
grant all on sequence public.quote_comments_id_seq to service_role;
grant all on sequence public.product_events_id_seq to service_role;
grant all on sequence public.quote_versions_id_seq to service_role;
grant all on sequence public.quote_access_tokens_id_seq to service_role;
grant all on sequence public.quote_status_changes_id_seq to service_role;
grant all on sequence public.quote_portal_events_id_seq to service_role;
grant all on sequence public.quote_number_seq to service_role;

-- Functions. PostgreSQL grants EXECUTE to PUBLIC by default and the default
-- privileges above add `anon` explicitly, so every function is revoked from both
-- first.

-- Callable by users. Each one restates the quote visibility rule internally,
-- because SECURITY DEFINER bypasses the policies that would otherwise apply.
-- `can_see_quote` must stay executable: the storage policies and
-- `quote_access_tokens_summary` call it with the reader's privileges.
revoke all on function public.can_see_quote(bigint) from public, anon;
revoke all on function public.transition_quote(bigint, text, text, jsonb) from public, anon;
revoke all on function public.quote_discount_gate(bigint) from public, anon;
revoke all on function public.issue_quote_version(bigint, integer, text, text, text) from public, anon;
revoke all on function public.revise_quote(bigint, text) from public, anon;
revoke all on function public.create_quote_link(bigint, integer, text) from public, anon;
revoke all on function public.revoke_quote_token(bigint) from public, anon;
revoke all on function public.mark_quote_comments_read(bigint) from public, anon;

grant execute on function public.can_see_quote(bigint) to authenticated, service_role;
grant execute on function public.transition_quote(bigint, text, text, jsonb) to authenticated, service_role;
grant execute on function public.quote_discount_gate(bigint) to authenticated, service_role;
grant execute on function public.issue_quote_version(bigint, integer, text, text, text) to authenticated, service_role;
grant execute on function public.revise_quote(bigint, text) to authenticated, service_role;
grant execute on function public.create_quote_link(bigint, integer, text) to authenticated, service_role;
grant execute on function public.revoke_quote_token(bigint) to authenticated, service_role;
grant execute on function public.mark_quote_comments_read(bigint) to authenticated, service_role;

-- `service_role` only. `apply_quote_status` above all: it trusts its
-- `p_actor_kind` argument, so a user able to call it could simply declare
-- themselves the customer. `mint_quote_token` likewise trusts its caller to have
-- decided who may share the quote. The functions users may call reach both as
-- the owner.
revoke all on function public.apply_quote_status(bigint, text, text, text, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.mint_quote_token(bigint, integer, text) from public, anon, authenticated;
revoke all on function public.purge_quotes(bigint[], boolean) from public, anon, authenticated;
revoke all on function public.sweep_expired_quotes() from public, anon, authenticated;
revoke all on function public.refresh_quote_version_totals(bigint) from public, anon, authenticated;
revoke all on function public.quote_party_snapshot(bigint) from public, anon, authenticated;

grant execute on function public.apply_quote_status(bigint, text, text, text, bigint, jsonb, text) to service_role;
grant execute on function public.mint_quote_token(bigint, integer, text) to service_role;
grant execute on function public.purge_quotes(bigint[], boolean) to service_role;
grant execute on function public.sweep_expired_quotes() to service_role;
grant execute on function public.refresh_quote_version_totals(bigint) to service_role;
grant execute on function public.quote_party_snapshot(bigint) to service_role;

-- Trigger functions: never called directly by anybody.
revoke all on function public.quotes_set_defaults() from public, anon, authenticated;
revoke all on function public.quotes_seed_first_version() from public, anon, authenticated;
revoke all on function public.quote_versions_before_insert() from public, anon, authenticated;
revoke all on function public.quote_versions_sync_header() from public, anon, authenticated;
revoke all on function public.quotes_header_guard() from public, anon, authenticated;
revoke all on function public.quote_lines_set_carrier() from public, anon, authenticated;
revoke all on function public.quote_lines_snapshot_defaults() from public, anon, authenticated;
revoke all on function public.quote_comments_before_insert() from public, anon, authenticated;
revoke all on function public.quote_comments_before_update() from public, anon, authenticated;
revoke all on function public.quote_lines_refresh_totals() from public, anon, authenticated;
revoke all on function public.quote_lines_freeze_guard() from public, anon, authenticated;
revoke all on function public.quote_versions_freeze_guard() from public, anon, authenticated;
revoke all on function public.reject_quote_history_mutation() from public, anon, authenticated;
revoke all on function public.products_audit() from public, anon, authenticated;
revoke all on function public.quotes_status_guard() from public, anon, authenticated;
revoke all on function public.quotes_log_status_change() from public, anon, authenticated;

grant execute on function public.quotes_set_defaults() to service_role;
grant execute on function public.quotes_seed_first_version() to service_role;
grant execute on function public.quote_versions_before_insert() to service_role;
grant execute on function public.quote_versions_sync_header() to service_role;
grant execute on function public.quotes_header_guard() to service_role;
grant execute on function public.quote_lines_set_carrier() to service_role;
grant execute on function public.quote_lines_snapshot_defaults() to service_role;
grant execute on function public.quote_comments_before_insert() to service_role;
grant execute on function public.quote_comments_before_update() to service_role;
grant execute on function public.quote_lines_refresh_totals() to service_role;
grant execute on function public.quote_lines_freeze_guard() to service_role;
grant execute on function public.quote_versions_freeze_guard() to service_role;
grant execute on function public.reject_quote_history_mutation() to service_role;
grant execute on function public.products_audit() to service_role;
grant execute on function public.quotes_status_guard() to service_role;
grant execute on function public.quotes_log_status_change() to service_role;

-- The customer portal (Phase 7): `service_role` only, which only the
-- `quote-portal` edge function holds. Not `anon` -- the portal is not a
-- PostgREST client (F2, D1) -- and not `authenticated` either: these functions
-- take the token hash as the WHOLE authorisation, so a user able to call them
-- would be one hash away from answering for a customer.
revoke all on function public.quote_portal_log(bigint, bigint, bigint, text, inet, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.quote_portal_resolve(bytea, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_document(bigint) from public, anon, authenticated;
revoke all on function public.quote_portal_view(bytea, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_accept(bytea, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_reject(bytea, text, text, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_comment(bytea, text, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.quote_portal_version(bytea) from public, anon, authenticated;

grant execute on function public.quote_portal_log(bigint, bigint, bigint, text, inet, text, text, text, jsonb) to service_role;
grant execute on function public.quote_portal_resolve(bytea, inet, text) to service_role;
grant execute on function public.quote_portal_document(bigint) to service_role;
grant execute on function public.quote_portal_view(bytea, inet, text) to service_role;
grant execute on function public.quote_portal_begin_answer(bytea, text, text, boolean, inet, text) to service_role;
grant execute on function public.quote_portal_accept(bytea, text, text, inet, text) to service_role;
grant execute on function public.quote_portal_reject(bytea, text, text, text, text, inet, text) to service_role;
grant execute on function public.quote_portal_comment(bytea, text, text, text, inet, text) to service_role;
grant execute on function public.quote_portal_version(bytea) to service_role;
