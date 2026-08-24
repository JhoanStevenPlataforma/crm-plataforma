import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

/**
 * Access level of a CRM user.
 *
 * - `admin`: full access, manages users and application configuration
 * - `manager`: sales manager — sees and reassigns every record, no user admin
 * - `rep`: sales representative — only sees and edits the records they own
 */
export type CrmRole = "admin" | "manager" | "rep";

export const CRM_ROLES: CrmRole[] = ["admin", "manager", "rep"];

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  role: CrmRole;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  role: CrmRole;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type Company = {
  name: string;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: number[];
  gender: string;
  sales_id?: Identifier;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  category: string;
  stage: string;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string;
  sales_id: Identifier;
  index: number;
  /** Which team the deal counts for in the budget dashboard. */
  team_id?: Identifier | null;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

/**
 * One row of `public.deal_stage_changes`: why a deal moved to a stage.
 *
 * Read-only from the client. The row is written by the `deals_log_stage_change`
 * trigger on any path that changes `deals.stage`, and `move_deal_stage()` is
 * what puts the reason and the files on it — so an undocumented move still
 * appears in the history, with a null `reason`.
 */
export type DealStageChange = {
  deal_id: Identifier;
  /** Null for the first recorded transition of a deal. */
  from_stage?: string | null;
  to_stage: string;
  reason?: string | null;
  /** Who moved it, resolved server-side from the session. */
  sales_id?: Identifier | null;
  changed_at: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

/**
 * An unqualified prospect, before it becomes a company + contact.
 *
 * `company_name` is free text rather than a `company_id`: a lead typically
 * arrives from a web form naming a company the CRM has never heard of. The
 * `converted_*` fields record what `convert_lead()` produced.
 */
export type Lead = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  /** Free text, as typed into a web form: the company may not exist yet. */
  company_name?: string;
  /** Set once the lead is recognised as belonging to a known company. */
  company_id?: Identifier | null;
  title?: string;
  source?: string;
  status: string;
  score?: number;
  notes?: string;
  tags?: number[];
  sales_id?: Identifier;
  created_at: string;
  updated_at: string;
  converted_at?: string | null;
  converted_contact_id?: Identifier | null;
  converted_company_id?: Identifier | null;
  converted_deal_id?: Identifier | null;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

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

/** Mirrors `public.task_dependency_kind` (§10.1). */
/** A group of reps, for assignment, escalation and reporting (§3.2, W12). */
export type Team = {
  name: string;
  description?: string | null;
  created_at?: string;
  /** From `teams_summary` only. */
  nb_members?: number;

  /**
   * Reporting columns, from `teams_summary` only — never written through the
   * team record. The budget fields describe the period containing today, and
   * are all null when the team has no budget for it. The amounts are scoped to
   * that same period, so `won_amount` and `budget_amount` compare like for like.
   */
  budget_id?: Identifier | null;
  budget_amount?: number | null;
  budget_period_start?: string | null;
  budget_period_end?: string | null;
  pipeline_amount?: number;
  won_amount?: number;
  nb_deals?: number;

  /**
   * The period's losses, and the two counts a win rate needs.
   *
   * `pipeline_amount` excludes `lost` (it used to be everything that was not
   * `won`, which booked dead deals as forecast), so the money that left the
   * pipeline is only visible through this column.
   */
  lost_amount?: number;
  nb_won?: number;
  nb_lost?: number;

  /**
   * How much of `budget_amount` is already allocated to members. Always a
   * number: allocations hang off the budget row, so a team with no budget has
   * none, and 0 handed out is a fact where "no target" is not.
   */
  allocated_amount?: number;

  /**
   * Write-only convenience fields, accepted by the data provider on create and
   * update and turned into a `team_budgets` row. They never come back on a read
   * — the reporting columns above do.
   */
  budget?: number | null;
  budget_start?: string | null;
  budget_end?: string | null;
} & Pick<RaRecord, "id">;

/**
 * A team's workload, from `team_workload_summary`.
 *
 * Its own record rather than four more columns on `Team`, because it is its own
 * view — measured, not stylistic: as columns on `teams_summary` these counters
 * took the dashboard query from 35 ms to 330 ms at 200k tasks, and PostgREST
 * asks for every column, so the plain `/teams` list paid it too.
 *
 * `id` is the team id, so the row joins straight onto a `Team`.
 *
 * `nb_tasks_overdue` is a SUBSET of `nb_open_tasks`, never a sibling: stack the
 * two without subtracting and every late task is drawn twice. `workloadOf` does
 * the subtraction once, for everybody.
 */
export type TeamWorkload = {
  team_id: Identifier;
  nb_open_tasks: number;
  nb_tasks_overdue: number;
  nb_tasks_due_next_7d: number;
  nb_tasks_completed: number;
} & Pick<RaRecord, "id">;

/**
 * What a team is expected to sell over a period.
 *
 * Its own table rather than a column on `Team`: a budget with no period cannot
 * answer "how did we do in Q3", and overwriting the number to set the next
 * target would destroy the only record of the previous one. Periods for one
 * team may not overlap — the database rejects it.
 */
export type TeamBudget = {
  team_id: Identifier;
  period_start: string;
  period_end: string;
  amount: number;
  created_at?: string;
} & Pick<RaRecord, "id">;

/**
 * One member's slice of a team budget.
 *
 * Keyed on `budget_id`, so an allocation belongs to a period and opening the
 * next one starts from a blank slate rather than silently restating what was
 * promised before. Keyed on `team_member_id` rather than on the person, so a
 * member removed from the team carries no quota in it and the roster always
 * sums to the team's `allocated_amount`.
 *
 * `team_id` is denormalized on purpose: it lets the composite foreign keys
 * reject an allocation that pairs one team's budget with another team's member.
 */
export type TeamMemberBudget = {
  team_id: Identifier;
  budget_id: Identifier;
  team_member_id: Identifier;
  amount: number;
  created_at?: string;
} & Pick<RaRecord, "id">;

/**
 * One row per team, member, month and stage — the cube the dashboard
 * drill-downs read.
 *
 * From `team_deal_stats` only, and scoped to the team's current budget period
 * (the calendar year when it has none), so the charts reconcile with the totals
 * they sit under. `sales_id` is null for a deal booked to the team but owned by
 * nobody.
 */
export type TeamDealStat = {
  team_id: Identifier;
  sales_id: Identifier | null;
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  stage: string;
  nb_deals: number;
  amount: number;
} & Pick<RaRecord, "id">;

/**
 * One row per team, member and month — the task-flow cube.
 *
 * The counterpart to `TeamDealStat`, separate from it because the two use
 * different date bases: a deal belongs to the month it closes in, a task to the
 * month it was created in *and* the month it was completed in.
 *
 * Flow only. "How many are open right now" is not an event that happened in
 * March, so the stock counters live on `TeamMember` instead.
 */
export type TeamTaskStat = {
  team_id: Identifier;
  sales_id: Identifier;
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  nb_created: number;
  nb_completed: number;
  nb_completed_on_time: number;
  /**
   * Mean `completed_at - created_at` for the month, null when nothing closed —
   * `avg` over no rows has no answer, and 0 would claim instant turnaround.
   */
  avg_cycle_hours: number | null;
} & Pick<RaRecord, "id">;

/** Membership of a team. Plain join row — the history lives on the task. */
export type TeamMember = {
  team_id: Identifier;
  sales_id: Identifier;
  created_at?: string;

  /**
   * Roster columns, from `team_members_summary` only — never written.
   *
   * The deal figures are scoped to the member's ownership AND the team's budget
   * period, so summing them across a team reproduces that team's totals exactly.
   * `nb_contacts` / `nb_companies` are not scoped that way: those records belong
   * to no team and no period. `nb_deals_all` counts every live deal the member
   * owns, so the gap against `nb_deals` shows work done outside this team.
   */
  first_name?: string;
  last_name?: string;
  email?: string;
  role?: CrmRole;
  disabled?: boolean;
  nb_contacts?: number;
  nb_companies?: number;
  nb_deals?: number;
  nb_deals_all?: number;
  pipeline_amount?: number;
  won_amount?: number;

  /**
   * Workload. `nb_open_tasks` counts on the task columns (not on
   * `task_statuses.is_open`), so it equals the list it links to.
   *
   * `nb_tasks_overdue` and `nb_tasks_due_next_7d` are subsets of it — a
   * snapshot of now, with no month and no period. The two `completed` counters
   * are the flow side, windowed exactly like the deal amounts, and share a
   * denominator on purpose so the on-time rate cannot exceed 100%.
   */
  nb_open_tasks?: number;
  nb_tasks_overdue?: number;
  nb_tasks_due_next_7d?: number;
  nb_tasks_completed?: number;
  nb_tasks_completed_on_time?: number;
  /**
   * The member's own slice of the team target for the current period. Null when
   * nothing was allocated to them — "no target" and "a target of nothing" are
   * different statements and the roster renders them differently.
   */
  budget_amount?: number | null;
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

/**
 * One row of `public.timeline_events` (§6.2) — the task event stream merged
 * with the surrounding note activity.
 *
 * `id` is a string (`task_event:918273`, `contact_note:44`) because the union
 * has no shared numeric key. Read-only: every branch is written elsewhere, and
 * the task branch is append-only.
 */
export type TimelineEvent = {
  id: string;
  occurred_at: string;
  event_type: string;
  source: "task" | "contact_note" | "deal_note" | "deal_stage_change";
  task_id?: Identifier | null;
  actor_sales_id?: Identifier | null;
  actor_kind: "user" | "system" | "automation" | "integration" | "import";
  entity_type?: TaskEntityType | null;
  entity_id?: Identifier | null;
  payload?: Record<string, unknown> | null;
};

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
 */
export type TaskNotification = {
  reminder_id?: Identifier | null;
  task_id: Identifier;
  recipient_id: Identifier;
  channel: ReminderChannel;
  scheduled_for: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  acknowledged_at?: string | null;
  title?: string | null;
  body?: string | null;
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

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type DealStage = LabeledValue;

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}
