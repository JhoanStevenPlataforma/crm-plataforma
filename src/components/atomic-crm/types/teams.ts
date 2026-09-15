/**
 * Teams, their budgets and the reporting cubes behind /teams-dashboard.
 */

import type { Identifier, RaRecord } from "ra-core";

import type { CrmRole } from "./core";

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
