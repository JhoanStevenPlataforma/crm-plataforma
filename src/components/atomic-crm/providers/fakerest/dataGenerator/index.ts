import { defaultTaskTypes } from "../../../root/defaultConfiguration";
import { generateCompanies } from "./companies";
import { generateContactNotes } from "./contactNotes";
import { generateContacts } from "./contacts";
import { generateDealNotes } from "./dealNotes";
import { generateDeals } from "./deals";
import { finalize } from "./finalize";
import { generateLeads } from "./leads";
import { generateSales } from "./sales";
import { generateTags } from "./tags";
import { generateTasks } from "./tasks";
import { TASK_PRIORITIES, TASK_STATUSES } from "./taskCatalogues";
import { DEMO_QUOTE_DISCOUNT_RULES } from "./quoteDiscountRules";
import { DEMO_QUOTE_STATUSES } from "./quoteStatuses";
import { DEMO_QUOTE_TRANSITIONS } from "./quoteTransitions";
import { DEMO_TAX_RATES } from "./taxRates";
import { generateTeamDealStats } from "./teamDealStats";
import { generateTeamTaskStats } from "./teamTaskStats";
import {
  decorateTeamMembersWithStats,
  decorateTeamsWithBudgets,
  generateTeamBudgets,
  generateTeamMemberBudgets,
  generateTeamMembers,
  generateTeams,
  generateTeamWorkloads,
} from "./teams";
import type { Db } from "./types";

export default (): Db => {
  const db = {} as Db;
  db.sales = generateSales(db);
  db.teams = generateTeams(db);
  db.team_members = generateTeamMembers(db);
  db.team_budgets = generateTeamBudgets(db);
  db.team_member_budgets = generateTeamMemberBudgets(db);
  db.tags = generateTags(db);
  db.companies = generateCompanies(db);
  db.contacts = generateContacts(db);
  db.contact_notes = generateContactNotes(db);
  db.deals = generateDeals(db);
  // Stands in for `teams_summary`: the reporting columns can only be computed
  // once the deals they aggregate exist.
  db.teams = decorateTeamsWithBudgets(db);
  // Stands in for `team_deal_stats`, the cube the drill-downs chart. Same
  // dependency: it aggregates the deals generated just above.
  db.team_deal_stats = generateTeamDealStats(db);
  db.deal_notes = generateDealNotes(db);
  db.deal_stage_changes = [];
  db.task_statuses = TASK_STATUSES;
  db.task_priorities = TASK_PRIORITIES;
  db.task_types = defaultTaskTypes.map((taskType, index) => ({
    id: index + 1,
    key: taskType.value,
    label: taskType.label,
  }));
  db.tasks = generateTasks(db);
  // Stands in for `team_members_summary`. Last of the three decorations
  // because it aggregates contacts, deals AND tasks.
  db.team_members = decorateTeamMembersWithStats(db);
  // Stands in for `team_task_stats`. After the tasks, and after the roster it
  // resolves ownership through.
  db.team_task_stats = generateTeamTaskStats(db);
  // Stands in for `team_workload_summary`, which aggregates that same roster.
  db.team_workload_summary = generateTeamWorkloads(db);
  // The owner assignment every task gets on insert in the real backend
  // (`tasks_seed_assignments_links`). Without it the People tab would claim
  // nobody is on a task that plainly has an owner.
  db.task_assignments = db.tasks.map((task, index) => ({
    id: index + 1,
    task_id: task.id,
    sales_id: task.owner_sales_id ?? null,
    team_id: null,
    role: "owner" as const,
    assigned_at: task.created_at ?? new Date().toISOString(),
    assigned_by: task.created_by ?? task.owner_sales_id ?? 0,
    unassigned_at: null,
  }));
  // One `task.created` event per task: demo mode has no triggers, but the
  // History tab has to show the same thing the real backend produces.
  db.task_events = db.tasks.map((task, index) => ({
    id: index + 1,
    task_id: task.id,
    event_type: "task.created",
    occurred_at: task.created_at ?? new Date().toISOString(),
    actor_sales_id: task.created_by ?? null,
    actor_kind: "user",
    seq: 1,
    metadata: { source: "manual" },
  }));
  db.task_comments = [];
  db.task_comment_revisions = [];
  db.task_comment_reactions = [];
  // Attachments start empty on purpose: the bytes of a seeded file would not
  // exist in the browser's object store, so every generated row would be a
  // download that cannot open.
  db.task_attachments = [];
  db.task_checklist_items = [];
  db.task_dependencies = [];
  db.task_reminders = [];
  db.task_notifications = [];
  db.notification_preferences = [];
  db.leads = generateLeads(db);
  // The quotes catalogue. The tax rates mirror the rows the migration seeds, so
  // the product form's tax picker resolves; products and price lists start
  // empty, because the demo mirror of the quotes module is Phase 5 (§10.1).
  db.tax_rates = DEMO_TAX_RATES;
  db.products = [];
  db.price_lists = [];
  db.price_list_items = [];
  // Quotations. The status catalogue mirrors the rows the migration seeds, so a
  // list filter and a status badge resolve; the documents themselves start
  // empty, because a quotation is written by a person and a fabricated one that
  // a customer was supposedly shown is exactly what this module refuses to
  // produce. The collections must exist all the same, or the screens read from
  // a resource FakeRest has never heard of.
  db.quote_statuses = DEMO_QUOTE_STATUSES;
  // The graph and the ceilings, mirrored from the migration: the demo mirror of
  // the status machine reads them exactly as `apply_quote_status()` does, so a
  // move demo mode refuses is a move the real backend refuses too (quotes §3).
  db.quote_transitions = DEMO_QUOTE_TRANSITIONS;
  db.quote_discount_rules = DEMO_QUOTE_DISCOUNT_RULES;
  db.quotes = [];
  db.quote_versions = [];
  db.quote_lines = [];
  db.quote_comments = [];
  db.quote_status_changes = [];
  db.quote_access_tokens = [];
  db.configuration = [
    {
      id: 1,
      config: {} as Db["configuration"][number]["config"],
    },
  ];
  finalize(db);

  return db;
};
