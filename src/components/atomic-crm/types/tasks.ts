/**
 * The task module (proposal §3): the task itself, its catalogues, the
 * append-only event stream, collaboration, reminders and notifications.
 */

import type { Identifier, RaRecord } from "ra-core";

/** Lifecycle states (§4.1). Mirrors `public.task_statuses.key`. */
export type TaskStatusKey =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "rescheduled"
  | "completed"
  | "canceled"
  | "archived";

/** Mirrors `public.task_priorities.key`. */
export type TaskPriorityKey = "low" | "normal" | "high" | "urgent";

/** Mirrors `public.task_entity` — what a task can hang off (§14.1). */
export type TaskEntityType =
  | "contact"
  | "lead"
  | "company"
  | "deal"
  | "project"
  | "ticket"
  | "invoice"
  | "quote"
  | "order";

/**
 * A task as read from `public.tasks_summary` (§3.4).
 *
 * The `text` / `type` / `done_date` / `contact_id` fields are the legacy shims:
 * the database keeps them in sync with the new model for one release so the
 * existing create path keeps working (Appendix C step 7).
 */
export type Task = {
  // content
  title: string;
  description?: string | null;

  // classification (ids write, keys read)
  task_type_id?: Identifier;
  status_id?: Identifier;
  priority_id?: Identifier;
  status_key: TaskStatusKey;
  status_label?: string;
  status_color?: string;
  status_is_open?: boolean;
  status_is_terminal?: boolean;
  counts_as_done?: boolean;
  priority_key: TaskPriorityKey;
  priority_label?: string;
  priority_color?: string;
  priority_rank?: number;
  sla_hours?: number | null;
  type_key: string;
  type_label?: string;
  type_icon?: string | null;

  // scheduling
  due_date: string;
  start_at?: string | null;
  completed_at?: string | null;
  completed_by?: Identifier | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  is_overdue?: boolean;

  // ownership (§7)
  owner_sales_id?: Identifier;
  owner_name?: string | null;
  created_by?: Identifier;

  // lifecycle bookkeeping
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  archived_at?: string | null;

  // traceability counters (§3.4) — what the list badges render
  reschedule_count?: number;
  reassign_count?: number;
  comment_count?: number;
  attachment_count?: number;
  checklist_total?: number;
  checklist_done?: number;
  blocked_seconds?: number;
  source?: string;

  // primary link (§14.2)
  primary_entity_type?: TaskEntityType | null;
  primary_entity_id?: Identifier | null;
  primary_entity_label?: string | null;

  // legacy shims
  contact_id?: Identifier | null;
  type?: string;
  text?: string | null;
  done_date?: string | null;
  sales_id?: Identifier;
} & Pick<RaRecord, "id">;

/** A row of `public.task_statuses` / `task_priorities` / `task_types`. */
export type TaskCatalogEntry = {
  key: string;
  label: string;
  color?: string;
  rank?: number;
  icon?: string | null;
} & Pick<RaRecord, "id">;

/**
 * One immutable entry of the audit trail (§5). Never created or edited from
 * the client — the database emits these from triggers.
 */
export type TaskEvent = {
  task_id: Identifier;
  event_type: string;
  occurred_at: string;
  actor_sales_id?: Identifier | null;
  actor_kind: "user" | "system" | "automation" | "integration" | "import";
  field?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  note?: string | null;
  seq: number;
} & Pick<RaRecord, "id">;

/**
 * A comment on a task (§8.1).
 *
 * `body` holds the raw text including the `@[Name](sales:12)` mention tokens —
 * see `tasks/taskMentions.ts`. Deletion is soft, so a row with `deleted_at` set
 * still carries its body: the thread renders a tombstone, the audit view does
 * not lose the text.
 */
export type TaskComment = {
  task_id: Identifier;
  /** Set for a reply. Threads are one level deep (§8.2). */
  parent_id?: Identifier | null;
  author_id: Identifier;
  body: string;
  /** Internal note: author, managers and admins only. */
  is_private: boolean;
  edited_at?: string | null;
  edit_count: number;
  deleted_at?: string | null;
  deleted_by?: Identifier | null;
  created_at: string;
} & Pick<RaRecord, "id">;

/** A superseded body of an edited comment (§8.1). Append-only. */
export type TaskCommentRevision = {
  comment_id: Identifier;
  body: string;
  edited_by: Identifier;
  edited_at: string;
  revision: number;
} & Pick<RaRecord, "id">;

/**
 * A resolved @mention (§8.1). Written by the database from the comment body,
 * never by the client.
 */
export type TaskCommentMention = {
  comment_id: Identifier;
  mentioned_sales_id?: Identifier | null;
  mentioned_team_id?: Identifier | null;
  notified_at?: string | null;
  read_at?: string | null;
} & Pick<RaRecord, "id">;

/**
 * An emoji acknowledgement on a comment (§8.2).
 *
 * 👍 is a first-class "seen and agreed" signal: it saves a reply that says
 * nothing, and it is still in the audit trail like any other acknowledgement.
 * `sales_id` is stamped from the session — a reaction is always your own.
 */
export type TaskCommentReaction = {
  comment_id: Identifier;
  sales_id: Identifier;
  emoji: string;
  created_at: string;
} & Pick<RaRecord, "id">;

/**
 * A file attached to a task, or to one of its comments (§3.2, §8.2).
 *
 * The row is metadata; the bytes live in the private `task-attachments`
 * bucket under `<task_id>/…`, which is what lets the storage policy gate a
 * download on task visibility. Reads therefore go through a short-lived signed
 * URL (`dataProvider.getTaskAttachmentUrl`), never a public link.
 */
export type TaskAttachment = {
  task_id: Identifier;
  /** Null for a task-level file; set when it hangs off a comment. */
  comment_id?: Identifier | null;
  storage_path: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  checksum?: string | null;
  uploaded_by: Identifier;
  uploaded_at: string;
  deleted_at?: string | null;
  deleted_by?: Identifier | null;
} & Pick<RaRecord, "id">;

/**
 * What an upload returns, ready to become a `task_attachments` row.
 *
 * The bytes are stored first and the row second: a row pointing at an object
 * that failed to upload would be an audit entry for a file nobody can open.
 */
export type TaskAttachmentUpload = {
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  checksum: string | null;
};

/**
 * One step of a task's checklist (§11.2).
 *
 * A step is part of somebody else's work item: it has no status machine and
 * never appears in "my tasks". When a step needs its own owner it should become
 * a sub-task instead (§11.1).
 */
export type TaskChecklistItem = {
  task_id: Identifier;
  label: string;
  /** Fractional rank, so a reorder is one row update (§11.2). */
  position: number;
  is_done: boolean;
  done_at?: string | null;
  done_by?: Identifier | null;
  due_at?: string | null;
  assignee_id?: Identifier | null;
  created_by: Identifier;
  created_at: string;
  deleted_at?: string | null;
} & Pick<RaRecord, "id">;

/**
 * The four ways somebody can be attached to a task (§7.1).
 *
 * `owner` is exactly one at a time and is mirrored on `tasks.owner_sales_id`
 * for the hot path; the other three are open sets.
 */
export type TaskRole = "owner" | "collaborator" | "watcher" | "team";

/**
 * Who is attached to a task, in what role, since when and by whom (§7.2).
 *
 * Rows are **closed, never deleted**: removing a watcher sets `unassigned_at`,
 * so "who was on this task in June" stays answerable. Exactly one of
 * `sales_id` / `team_id` is set.
 */
export type TaskAssignment = {
  task_id: Identifier;
  sales_id?: Identifier | null;
  team_id?: Identifier | null;
  role: TaskRole;
  assigned_at: string;
  assigned_by: Identifier;
  unassigned_at?: string | null;
  unassigned_by?: Identifier | null;
  reason?: string | null;
} & Pick<RaRecord, "id">;

export type TaskDependencyKind = "blocks" | "parent" | "related" | "duplicates";

/**
 * A directed edge between two tasks (§10.1).
 *
 * Stored once; the inverse is derived ("A blocks B" means "B is blocked by A").
 * Storing both directions is the classic source of inconsistent graphs.
 */
export type TaskDependency = {
  source_task_id: Identifier;
  target_task_id: Identifier;
  kind: TaskDependencyKind;
  created_by: Identifier;
  created_at: string;
  removed_at?: string | null;
  removed_by?: Identifier | null;
} & Pick<RaRecord, "id">;

/** Mirrors `public.reminder_channel` (§9.1). */
export type ReminderChannel =
  | "in_app"
  | "email"
  | "push"
  | "whatsapp"
  | "sms"
  | "webhook";

/**
 * Per-user anti-fatigue settings (§9.5).
 *
 * Absent means the defaults, so nobody has to be backfilled. Every field here
 * is enforced in the database — the dispatcher defers or skips, and the claim
 * throttles — never in the browser.
 */
export type NotificationPreference = {
  sales_id: Identifier;
  /** IANA zone. Quiet hours only mean something in local time. */
  timezone: string;
  /** `HH:MM:SS`; null means no quiet window. May wrap midnight. */
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  /** One message at `digest_at` instead of N pings through the day. */
  digest_mode: boolean;
  digest_at: string;
  muted_channels: ReminderChannel[];
  /** Rolling-hour ceiling on deliveries, applied at claim time. */
  max_per_hour: number;
  /** "Same task, several rules" collapses inside this window. */
  dedupe_window_minutes: number;
  created_at?: string;
  updated_at?: string;
} & Pick<RaRecord, "id">;

/** How a reminder's firing time is expressed (§9.2). */
export type ReminderScheduleKind =
  | "absolute"
  | "relative_before_due"
  | "relative_after_due"
  | "recurring";

/** Who a reminder reaches (§9.1). */
export type ReminderRecipients =
  | "owner"
  | "assignees"
  | "watchers"
  | "all"
  | "custom";

/**
 * A reminder *rule* (§9.1).
 *
 * A rule is edited; a delivery is a fact. Editing "remind me a day before"
 * must not rewrite the record of the ping that already went out, which is why
 * this and `TaskNotification` are two types rather than one.
 *
 * `next_fire_at`, `fired_count` and `is_active` are maintained by the database
 * (the `task_reminders_before_write` trigger and the dispatcher). Writing them
 * from the client is ignored at best and re-fires a consumed occurrence at
 * worst.
 */
export type TaskReminder = {
  task_id: Identifier;
  created_by: Identifier;
  created_at: string;

  schedule_kind: ReminderScheduleKind;
  absolute_at?: string | null;
  /** For `relative_*`: 60 = one hour before (or after) the due date. */
  offset_minutes?: number | null;
  /** RFC 5545. The supported subset is documented on `next_rrule_occurrence`. */
  rrule?: string | null;
  timezone: string;
  until_at?: string | null;
  max_occurrences?: number | null;

  channels: ReminderChannel[];
  recipients: ReminderRecipients;
  custom_recipients?: Identifier[] | null;
  message_template?: string | null;

  is_active: boolean;
  next_fire_at?: string | null;
  fired_count: number;
  stop_on_complete: boolean;
} & Pick<RaRecord, "id">;

/**
 * One delivery attempt (§9.1) — the outbox row.
 *
 * Read-only from the client except for `read_at` / `acknowledged_at`: the
 * status belongs to the dispatcher and the worker. A reminder that was never
 * delivered stays visible AS SUCH, which is the whole point of O6.
 *
 * THE SUBJECT IS EITHER/OR. `task_id` for a reminder; the
 * (`entity_type`, `entity_id`) pair for a notification about something that is
 * not a task -- a quotation a customer opened, answered or wrote on (quotes
 * proposal §8). `task_notifications_subject` refuses a row carrying both or
 * neither, so exactly one of the two branches is populated on every row.
 */
export type TaskNotification = {
  reminder_id?: Identifier | null;
  task_id?: Identifier | null;
  entity_type?: TaskEntityType | null;
  entity_id?: Identifier | null;
  recipient_id: Identifier;
  channel: ReminderChannel;
  scheduled_for: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  acknowledged_at?: string | null;
  /**
   * The English text, and the truth for any reader with no i18n catalogue —
   * the `task-notification-worker` edge function above all.
   */
  title?: string | null;
  body?: string | null;
  /**
   * What a client with a catalogue renders instead (quotes §13.6 #18), e.g.
   * `crm.notifications.quote.accepted`. Null means this row has no
   * translatable form and `title` / `body` ARE the text — every task reminder,
   * and every row written before the column existed. `notificationText()` owns
   * the fallback.
   */
  message_key?: string | null;
  message_params?: Record<string, unknown> | null;
  status:
    | "queued"
    | "sending"
    | "sent"
    | "delivered"
    | "failed"
    | "bounced"
    | "skipped"
    | "canceled";
  attempt: number;
  error?: string | null;
  provider_message_id?: string | null;
  dedupe_key?: string | null;
  created_at: string;
} & Pick<RaRecord, "id">;
