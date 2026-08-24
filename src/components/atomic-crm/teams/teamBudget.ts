import type { Team } from "../types";

/**
 * Budget maths for the team dashboard.
 *
 * Kept out of the components because these are the parts with edge cases worth
 * testing: a team with no budget, a budget of zero, and the difference between
 * "0% attained" and "there is nothing to attain".
 */

/** The calendar year containing `today` — the period the team form defaults to. */
export const currentYearPeriod = (today: Date = new Date()) => {
  const year = today.getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
};

/**
 * Share of the budget already won, as a 0..1 ratio.
 *
 * `null` means the question does not apply — no budget set, or a budget of
 * zero. Returning 0 instead would render as a team that sold nothing, which is
 * a different and wrong statement.
 */
export const attainmentRatio = (
  wonAmount: number | null | undefined,
  budgetAmount: number | null | undefined,
): number | null => {
  if (budgetAmount == null || budgetAmount <= 0) {
    return null;
  }
  return (wonAmount ?? 0) / budgetAmount;
};

/**
 * How a team target is split between its members.
 *
 * The database does not cap the sum at the budget on purpose — reallocating
 * between two people is two writes, and a per-row invariant would reject the
 * first one purely for being first — so saying whether the split adds up is
 * this layer's job, and `remaining` is signed so it can say by how much.
 */
export type BudgetAllocation = {
  allocated: number;
  /** Budget minus allocated, negative when over-allocated. Null with no budget. */
  remaining: number | null;
  isOverAllocated: boolean;
  /** Share of the budget handed out, 0..1+. Null when there is nothing to share. */
  coverage: number | null;
};

export const allocationOf = (
  budgetAmount: number | null | undefined,
  allocatedAmount: number | null | undefined,
): BudgetAllocation => {
  const allocated = allocatedAmount ?? 0;
  // No budget is not a budget of zero: there is nothing to be over or under.
  if (budgetAmount == null || budgetAmount <= 0) {
    return {
      allocated,
      remaining: null,
      isOverAllocated: false,
      coverage: null,
    };
  }
  const remaining = budgetAmount - allocated;
  return {
    allocated,
    remaining,
    isOverAllocated: remaining < 0,
    coverage: allocated / budgetAmount,
  };
};

/** Totals across every team, for the dashboard's summary row. */
export type TeamTotals = {
  budget: number;
  allocated: number;
  pipeline: number;
  won: number;
  lost: number;
  deals: number;
  nbWon: number;
  nbLost: number;
  /** Overall attainment, or null when no team has a budget for the period. */
  attainment: number | null;
};

export const sumTeamTotals = (teams: Team[] | undefined): TeamTotals => {
  const totals = (teams ?? []).reduce(
    (acc, team) => ({
      budget: acc.budget + (team.budget_amount ?? 0),
      allocated: acc.allocated + (team.allocated_amount ?? 0),
      pipeline: acc.pipeline + (team.pipeline_amount ?? 0),
      won: acc.won + (team.won_amount ?? 0),
      lost: acc.lost + (team.lost_amount ?? 0),
      deals: acc.deals + (team.nb_deals ?? 0),
      nbWon: acc.nbWon + (team.nb_won ?? 0),
      nbLost: acc.nbLost + (team.nb_lost ?? 0),
    }),
    {
      budget: 0,
      allocated: 0,
      pipeline: 0,
      won: 0,
      lost: 0,
      deals: 0,
      nbWon: 0,
      nbLost: 0,
    },
  );

  return { ...totals, attainment: attainmentRatio(totals.won, totals.budget) };
};

/**
 * Money, formatted the way the deal cards already do it — same options, so the
 * dashboard and the pipeline never disagree about what "$1.2M" means.
 */
export const formatMoney = (
  value: number | null | undefined,
  currency: string,
  locale = "en-US",
) =>
  (value ?? 0).toLocaleString(locale, {
    notation: "compact",
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 1,
  });

/** `0.42` -> `"42%"`, and `null` -> an em dash rather than "0%". */
export const formatAttainment = (ratio: number | null) =>
  ratio == null ? "—" : `${Math.round(ratio * 100)}%`;
