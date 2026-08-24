import type { Team } from "../types";
import { attainmentRatio } from "./teamBudget";

/**
 * Is the period going well, or does it only look like it?
 *
 * Attainment on its own cannot answer that. A team at 45% of target is doing
 * well in March and is in trouble in November, and the dashboard used to render
 * both as the same bar. Everything here is arithmetic over columns
 * `teams_summary` already returns — no request, no new column — which is why it
 * lives in this layer and not in SQL.
 */

/**
 * How far past the target pace a team has to be before the dashboard says so.
 *
 * Ten points, not zero: attainment moves in steps the size of one deal, so a
 * threshold at parity would flag half the teams on any given morning and the
 * flag would stop meaning anything.
 */
export const PACE_TOLERANCE = 0.1;

/**
 * How much pipeline is conventionally needed to cover what is left of a target.
 * Below this the remaining gap has nothing behind it.
 */
export const HEALTHY_COVERAGE = 3;

export type PaceStatus = "ahead" | "on_track" | "behind" | "unknown";

export type TeamPace = {
  /** Share of the period elapsed, 0..1. Null when the team has no period. */
  elapsed: number | null;
  /** Share of the target won, 0..1. Null when there is no target. */
  attainment: number | null;
  /** attainment - elapsed. Positive is ahead. Null when either is unknown. */
  gap: number | null;
  status: PaceStatus;
};

/**
 * Share of the period already spent.
 *
 * Clamped to 0..1 so a budget whose period has not started yet reads as 0 and a
 * stale one reads as 1, rather than producing a pace that is arithmetically
 * fine and physically nonsense. Dates are compared as `YYYY-MM-DD` strings,
 * which is what the view returns: parsing them into `Date` would put anyone
 * west of Greenwich a day out, the same trap `formatMonthLabel` documents.
 */
export const periodProgress = (
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  today: Date = new Date(),
): number | null => {
  if (!periodStart || !periodEnd) return null;

  const start = Date.parse(`${periodStart}T00:00:00`);
  const end = Date.parse(`${periodEnd}T23:59:59`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

  const ratio = (today.getTime() - start) / (end - start);
  return Math.min(1, Math.max(0, ratio));
};

/**
 * Attainment measured against the calendar rather than against zero.
 *
 * `unknown` is a real answer and gets its own status: a team with no budget has
 * no pace, and rendering that as "behind" would put a warning on the one team
 * nobody has set a target for yet — which is a different problem, and not this
 * team's fault.
 */
export const paceOf = (
  team: Pick<Team, "won_amount" | "budget_amount" | "budget_period_start"> &
    Pick<Team, "budget_period_end">,
  today: Date = new Date(),
): TeamPace => {
  const elapsed = periodProgress(
    team.budget_period_start,
    team.budget_period_end,
    today,
  );
  const attainment = attainmentRatio(team.won_amount, team.budget_amount);

  if (elapsed == null || attainment == null) {
    return { elapsed, attainment, gap: null, status: "unknown" };
  }

  const gap = attainment - elapsed;
  const status: PaceStatus =
    gap > PACE_TOLERANCE
      ? "ahead"
      : gap < -PACE_TOLERANCE
        ? "behind"
        : "on_track";

  return { elapsed, attainment, gap, status };
};

/**
 * Pipeline against what is still missing from the target.
 *
 * Null once the target is met — "how many times over does the pipeline cover
 * the gap" has no answer when there is no gap, and `Infinity` renders as a
 * team in perfect health for the same reason a division by zero always does.
 */
export const pipelineCoverage = (
  team: Pick<Team, "pipeline_amount" | "won_amount" | "budget_amount">,
): number | null => {
  const budget = team.budget_amount;
  if (budget == null || budget <= 0) return null;

  const remaining = budget - (team.won_amount ?? 0);
  if (remaining <= 0) return null;

  return (team.pipeline_amount ?? 0) / remaining;
};

/**
 * Won against everything that reached a decision.
 *
 * Open deals are excluded from the denominator on purpose: counting them as
 * not-yet-won drags every rate towards zero early in a period and makes the
 * number say more about the calendar than about the selling. Null when nothing
 * has closed either way.
 */
export const winRate = (
  nbWon: number | null | undefined,
  nbLost: number | null | undefined,
): number | null => {
  const won = nbWon ?? 0;
  const decided = won + (nbLost ?? 0);
  return decided === 0 ? null : won / decided;
};

/** `2.4` -> `"2.4x"`, and `null` -> an em dash. */
export const formatCoverage = (coverage: number | null) =>
  coverage == null ? "—" : `${coverage.toFixed(1)}x`;

/** `-0.12` -> `"-12 pts"`. Signed, because the direction is the whole message. */
export const formatGap = (gap: number | null) => {
  if (gap == null) return "—";
  const points = Math.round(gap * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
};
