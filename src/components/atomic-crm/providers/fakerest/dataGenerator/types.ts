import type {
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  DealStageChange,
  Lead,
  Sale,
  Tag,
  Task,
  TaskAssignment,
  TaskAttachment,
  TaskCatalogEntry,
  TaskChecklistItem,
  TaskComment,
  TaskCommentReaction,
  TaskDependency,
  TaskCommentRevision,
  TaskEvent,
  TaskNotification,
  NotificationPreference,
  TaskReminder,
  Team,
  TeamBudget,
  TeamDealStat,
  TeamTaskStat,
  TeamWorkload,
  TeamMember,
  TeamMemberBudget,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  companies: Company[];
  contacts: Contact[];
  contact_notes: ContactNote[];
  deals: Deal[];
  deal_notes: DealNote[];
  // Why each deal moved. Seeded empty: the demo's deals were never dragged
  // anywhere, and inventing reasons nobody typed is the one thing an audit
  // trail exists to prevent.
  deal_stage_changes: DealStageChange[];
  leads: Lead[];
  sales: Sale[];
  tags: Tag[];
  teams: Team[];
  team_members: TeamMember[];
  team_budgets: TeamBudget[];
  // Each member's slice of a team budget. Unlike the aggregate stand-ins below,
  // this is real data the allocation panel writes to.
  team_member_budgets: TeamMemberBudget[];
  // Stand-in for the `team_deal_stats` view: the cube the dashboard
  // drill-downs chart. A snapshot, computed once the deals exist.
  team_deal_stats: TeamDealStat[];
  // Stand-in for the `team_task_stats` view: the task-flow cube the drill-downs
  // chart. Flow only -- the stock counters live on the team/member records.
  team_task_stats: TeamTaskStat[];
  // Stand-in for the `team_workload_summary` view: the dashboard's workload
  // report, deliberately not columns on the team record.
  team_workload_summary: TeamWorkload[];
  tasks: Task[];
  // Who is on a task and in what role (§7). Seeded with the owner row every
  // task gets on insert in the real backend; the rest is filled by the UI.
  task_assignments: TaskAssignment[];
  // Seeded catalogues, so the task form's ReferenceInputs resolve in demo mode.
  task_statuses: TaskCatalogEntry[];
  task_priorities: TaskCatalogEntry[];
  task_types: TaskCatalogEntry[];
  task_events: TaskEvent[];
  // Collaboration (§8). Seeded empty: the demo starts with a clean thread and
  // the provider callbacks fill it as the visitor comments.
  task_comments: TaskComment[];
  task_comment_revisions: TaskCommentRevision[];
  task_comment_reactions: TaskCommentReaction[];
  // Attachments (§3.2). Empty at seed time: a generated row would point at
  // bytes that were never uploaded in this browser session.
  task_attachments: TaskAttachment[];
  task_checklist_items: TaskChecklistItem[];
  task_dependencies: TaskDependency[];
  // Reminders (§9). Rules start empty like the rest; the outbox stays empty
  // because a demo tab has no scheduler, and inventing deliveries that never
  // happened would be the one thing the audit trail exists to prevent.
  task_reminders: TaskReminder[];
  task_notifications: TaskNotification[];
  // Anti-fatigue settings (§9.5). Empty means "everyone is on the defaults",
  // which is exactly what the real backend's `notification_prefs_for` does.
  notification_preferences: NotificationPreference[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
