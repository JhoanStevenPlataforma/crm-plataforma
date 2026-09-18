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
  PriceList,
  PriceListItem,
  Product,
  Quote,
  QuoteAccessToken,
  QuoteComment,
  QuoteDiscountRule,
  QuoteLine,
  QuoteStatus,
  QuoteStatusChange,
  QuoteTransition,
  QuoteVersion,
  TaxRate,
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
  // The quotes catalogue. Tax rates are seeded as the migration seeds them; the
  // rest starts empty until the module's demo mirror (quotes Phase 5).
  tax_rates: TaxRate[];
  products: Product[];
  price_lists: PriceList[];
  price_list_items: PriceListItem[];
  // Quotations (quotes Phase 4). Empty in the generated demo dataset — a
  // quotation is written by a person, one at a time, and inventing a document
  // somebody was supposedly shown is the one thing this module exists to
  // prevent. The collections are declared so stories and tests can seed them,
  // and so the line triggers' demo stand-ins have somewhere to write.
  quote_statuses: QuoteStatus[];
  // The status machine and the discount ceilings, seeded exactly as the
  // migration seeds them — the graph as data (quotes §3) and the rule switched
  // OFF (§3.1). A demo that shipped the ceiling enforced would refuse issues
  // the real backend allows.
  quote_transitions: QuoteTransition[];
  quote_discount_rules: QuoteDiscountRule[];
  quotes: Quote[];
  quote_versions: QuoteVersion[];
  quote_lines: QuoteLine[];
  // The negotiation thread (Phase 8). Empty, for the reason the documents are.
  quote_comments: QuoteComment[];
  // The audit trail and the portal links a Phase 5 move writes. Empty to start
  // with, because both are records of something that happened.
  quote_status_changes: QuoteStatusChange[];
  quote_access_tokens: QuoteAccessToken[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
