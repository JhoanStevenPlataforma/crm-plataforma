import type { Identifier } from "ra-core";

import type {
  Team,
  TeamBudget,
  TeamMember,
  TeamMemberBudget,
  TeamWorkload,
} from "../../../types";
import type { Db } from "./types";

/**
 * Two teams, so demo mode can show what a team assignment does (§3.2).
 *
 * The membership matters more than the names: the task access rule (§7.3)
 * grants a task to every member of an assigned team, and with an empty
 * `team_members` that rule is untestable by hand.
 */
const TEAM_NAMES: Array<Pick<Team, "name" | "description">> = [
  { name: "Renewals", description: "Existing accounts up for renewal" },
  { name: "New business", description: "Inbound and outbound prospecting" },
];

/** Everyone lands in a team, alternating. One rule, used by both generators. */
const teamIndexFor = (salesIndex: number) => salesIndex % TEAM_NAMES.length;

export const generateTeams = (db: Db): Team[] =>
  TEAM_NAMES.map((team, index) => ({
    id: index + 1,
    ...team,
    created_at: new Date().toISOString(),
    // `teams_summary.nb_members` in the real backend. Here it is a stored
    // counter the team_members callbacks keep up to date, the same way the
    // fake provider maintains `nb_tasks` and `nb_contacts`.
    nb_members: db.sales.filter((_, i) => teamIndexFor(i) === index).length,
  }));

export const generateTeamMembers = (db: Db): TeamMember[] =>
  db.sales.map((sale, index) => ({
    id: index + 1,
    team_id: db.teams[teamIndexFor(index)].id,
    sales_id: sale.id,
    created_at: new Date().toISOString(),
  }));

/** The calendar year containing today — the default period the form offers. */
const currentPeriod = () => {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
};

/**
 * One budget per team for the current year, so the dashboard has something to
 * report against in demo mode. The amounts differ per team on purpose: a
 * dashboard where every bar is identical hides the bugs it exists to show.
 */
export const generateTeamBudgets = (db: Db): TeamBudget[] => {
  const { start, end } = currentPeriod();
  return db.teams.map((team, index) => ({
    id: index + 1,
    team_id: team.id,
    period_start: start,
    period_end: end,
    amount: 500_000 + index * 250_000,
    created_at: new Date().toISOString(),
  }));
};

/**
 * A split of each team's target between its members.
 *
 * Deliberately only 80% of the budget: a demo that opens on a team whose split
 * already adds up hides the remainder, which is the number the allocation panel
 * exists to show. The share is per member and rounded, so the sum is a real
 * number a manager can recognise rather than a suspiciously exact one.
 */
export const generateTeamMemberBudgets = (db: Db): TeamMemberBudget[] => {
  const rows: TeamMemberBudget[] = [];

  db.team_budgets.forEach((budget) => {
    const members = db.team_members.filter(
      (member) => member.team_id === budget.team_id,
    );
    if (members.length === 0) return;

    const share = Math.round((budget.amount * 0.8) / members.length);
    members.forEach((member) => {
      rows.push({
        id: rows.length + 1,
        team_id: budget.team_id,
        budget_id: budget.id,
        team_member_id: member.id,
        amount: share,
        created_at: new Date().toISOString(),
      });
    });
  });

  return rows;
};

/**
 * `teams_summary` has no view in demo mode, so its reporting columns are
 * computed once here, after deals exist.
 *
 * Unlike `nb_members` — which callbacks keep live because the UI edits
 * membership on the spot — these are a snapshot: editing a deal in demo mode
 * does not move the dashboard totals until reload. Demo data resets on reload
 * anyway, and the alternative is recomputing four aggregates on every deal
 * write to emulate a view that the real backend computes for free.
 */
export const decorateTeamsWithBudgets = (db: Db): Team[] =>
  db.teams.map((team) => {
    const budget = db.team_budgets.find((b) => b.team_id === team.id);
    const teamDeals = db.deals.filter((deal) => deal.team_id === team.id);
    const inPeriod = teamDeals.filter(
      (deal) =>
        budget != null &&
        deal.expected_closing_date >= budget.period_start &&
        deal.expected_closing_date <= budget.period_end,
    );
    const sum = (deals: typeof teamDeals) =>
      deals.reduce((total, deal) => total + (deal.amount ?? 0), 0);

    return {
      ...team,
      budget_id: budget?.id ?? null,
      budget_amount: budget?.amount ?? null,
      budget_period_start: budget?.period_start ?? null,
      budget_period_end: budget?.period_end ?? null,
      pipeline_amount: sum(inPeriod.filter((deal) => deal.stage !== "won")),
      won_amount: sum(inPeriod.filter((deal) => deal.stage === "won")),
      nb_deals: teamDeals.length,
      // Unlike the deal aggregates above, this one IS kept live by the
      // `team_member_budgets` callbacks: the allocation panel writes it and
      // the dashboard reads it back in the same session.
      allocated_amount: db.team_member_budgets
        .filter((allocation) => allocation.budget_id === budget?.id)
        .reduce((total, allocation) => total + allocation.amount, 0),
    };
  });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The demo-mode copies of the task predicates the views use.
 *
 * Written once here rather than inline at each counter, because the whole point
 * of the change they came from is that there is exactly ONE definition of an
 * open task -- and two copies in this file would be two definitions again.
 */
const openTasksOf = (db: Db, salesId: Identifier) =>
  db.tasks.filter(
    (task) =>
      task.owner_sales_id === salesId &&
      task.deleted_at == null &&
      task.archived_at == null &&
      task.completed_at == null &&
      task.canceled_at == null,
  );

const isOverdue = (task: Db["tasks"][number]) =>
  task.due_date != null && new Date(task.due_date).getTime() < Date.now();

const isDueSoon = (task: Db["tasks"][number]) => {
  if (task.due_date == null) return false;
  const due = new Date(task.due_date).getTime();
  return due >= Date.now() && due < Date.now() + 7 * DAY_MS;
};

/**
 * Completed work is a flow, so it is windowed -- to the team's budget period,
 * falling back to the calendar year, exactly as the view does. A team with no
 * target still closes tasks, and reporting 0 there would read as a team that
 * does nothing.
 */
const completedTasksOf = (
  db: Db,
  salesId: Identifier,
  budget: { period_start: string; period_end: string } | undefined,
) => {
  const year = new Date().getFullYear();
  const start = budget?.period_start ?? `${year}-01-01`;
  const end = budget?.period_end ?? `${year}-12-31`;

  return db.tasks.filter((task) => {
    if (task.owner_sales_id !== salesId) return false;
    if (task.deleted_at != null || task.completed_at == null) return false;
    const day = task.completed_at.slice(0, 10);
    return day >= start && day <= end;
  });
};

const wasOnTime = (task: Db["tasks"][number]) =>
  task.completed_at != null &&
  (task.due_date == null ||
    new Date(task.completed_at).getTime() <= new Date(task.due_date).getTime());

/**
 * `team_members_summary` has no view in demo mode either, so the roster columns
 * are computed here once the sales, deals and contacts exist.
 *
 * The deal figures are scoped to the member AND the team, mirroring the view,
 * so the roster adds up to the team header. Like the team counters above this
 * is a snapshot, not a live projection.
 */
export const decorateTeamMembersWithStats = (db: Db): TeamMember[] =>
  db.team_members.map((member) => {
    const sale = db.sales.find((s) => s.id === member.sales_id);
    const budget = db.team_budgets.find((b) => b.team_id === member.team_id);
    const ownDeals = db.deals.filter(
      (deal) => deal.sales_id === member.sales_id,
    );
    const teamDeals = ownDeals.filter(
      (deal) => deal.team_id === member.team_id,
    );
    const inPeriod = teamDeals.filter(
      (deal) =>
        budget != null &&
        deal.expected_closing_date >= budget.period_start &&
        deal.expected_closing_date <= budget.period_end,
    );
    const sum = (deals: typeof ownDeals) =>
      deals.reduce((total, deal) => total + (deal.amount ?? 0), 0);

    return {
      ...member,
      first_name: sale?.first_name,
      last_name: sale?.last_name,
      email: sale?.email,
      role: sale?.role,
      disabled: sale?.disabled ?? false,
      nb_contacts: db.contacts.filter((c) => c.sales_id === member.sales_id)
        .length,
      nb_companies: db.companies.filter((c) => c.sales_id === member.sales_id)
        .length,
      nb_deals_all: ownDeals.length,
      nb_deals: teamDeals.length,
      pipeline_amount: sum(inPeriod.filter((deal) => deal.stage !== "won")),
      won_amount: sum(inPeriod.filter((deal) => deal.stage === "won")),
      // Counted on the COLUMNS, mirroring the view: `status_key` and the
      // columns disagree on an archived task, and demo mode has to reproduce
      // the definition the real backend uses or it hides the discrepancy.
      nb_open_tasks: openTasksOf(db, member.sales_id).length,
      nb_tasks_overdue: openTasksOf(db, member.sales_id).filter(isOverdue)
        .length,
      nb_tasks_due_next_7d: openTasksOf(db, member.sales_id).filter(isDueSoon)
        .length,
      nb_tasks_completed: completedTasksOf(db, member.sales_id, budget).length,
      nb_tasks_completed_on_time: completedTasksOf(
        db,
        member.sales_id,
        budget,
      ).filter(wasOnTime).length,
      // Null, not zero, when nobody allocated anything to them — the roster
      // renders the two differently and only one of them is true.
      budget_amount:
        db.team_member_budgets.find(
          (allocation) =>
            allocation.budget_id === budget?.id &&
            allocation.team_member_id === member.id,
        )?.amount ?? null,
    };
  });

/**
 * Demo-mode stand-in for the `team_workload_summary` view.
 *
 * Its own collection, mirroring the real backend, where the workload is its own
 * view rather than four more columns on `teams_summary` — as columns they took
 * the dashboard query from 35 ms to 330 ms at 200k tasks and every reader paid
 * it. Demo mode has no such volume, but it has to expose the same SHAPE or the
 * dashboard would need two different data paths.
 *
 * Sums the roster the decoration above already computed, so the team totals and
 * the roster underneath them cannot disagree.
 */
export const generateTeamWorkloads = (db: Db): TeamWorkload[] =>
  db.teams.map((team) => {
    const roster = db.team_members.filter(
      (member) => member.team_id === team.id,
    );
    const sum = (pick: (member: TeamMember) => number | undefined) =>
      roster.reduce((total, member) => total + (pick(member) ?? 0), 0);

    return {
      id: team.id,
      team_id: team.id,
      nb_open_tasks: sum((member) => member.nb_open_tasks),
      nb_tasks_overdue: sum((member) => member.nb_tasks_overdue),
      nb_tasks_due_next_7d: sum((member) => member.nb_tasks_due_next_7d),
      nb_tasks_completed: sum((member) => member.nb_tasks_completed),
    };
  });
