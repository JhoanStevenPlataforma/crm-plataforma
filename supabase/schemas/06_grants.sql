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
grant all on table public.deal_stage_changes to service_role;
revoke all on function public.deals_log_stage_change() from public, anon, authenticated;
grant all on function public.deals_log_stage_change() to service_role;
revoke all on function public.move_deal_stage(bigint, text, text, integer, jsonb) from public, anon;
grant execute on function public.move_deal_stage(bigint, text, text, integer, jsonb) to authenticated, service_role;
