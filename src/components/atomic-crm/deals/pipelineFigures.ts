import { calendarDaysBetween } from "../misc/relativeTime";
import type { Deal, DealStage } from "../types";
import { findDealProbability } from "./dealUtils";

/**
 * Pipeline figures folded from deals already loaded — the board uses the open
 * total for each column's share, so it follows the board's filters (one rep,
 * one company, one team) without a second query. The close-date rules and the
 * definition of a decided stage are shared with the dashboard.
 */

/**
 * Stages where a deal is decided. `dealPipelineStatuses` names the won ones;
 * `lost` is the one terminal stage the configuration has no list for, and the
 * analytics layer (`deal_stage_stats`) excludes it by value the same way.
 */
export const closedDealStages = (
  dealPipelineStatuses: readonly string[],
): string[] => [...dealPipelineStatuses, "lost"];

/** A close date within this many days is flagged as imminent. */
export const CLOSING_SOON_DAYS = 7;

/**
 * `expected_closing_date` is usually a bare `YYYY-MM-DD`, which `new Date()`
 * reads as UTC midnight — the previous day for anyone west of Greenwich.
 */
export const parseCalendarDate = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
};

export type CloseDateStatus = "overdue" | "soon" | "later";

export const closeDateStatus = (
  value: string | null | undefined,
  now: Date,
): CloseDateStatus | null => {
  if (!value) return null;
  const days = calendarDaysBetween(parseCalendarDate(value), now);
  if (days < 0) return "overdue";
  if (days <= CLOSING_SOON_DAYS) return "soon";
  return "later";
};

export interface StageShare {
  stage: string;
  amount: number;
  count: number;
  /** Of the open pipeline, 0..1. */
  share: number;
}

export interface PipelineSummary {
  openAmount: number;
  openCount: number;
  weightedAmount: number;
  /** Open amount in stages with no configured probability. */
  unweightedAmount: number;
  closingThisMonth: { count: number; amount: number };
  overdueCount: number;
  /** Open stages in board order, including empty ones. */
  stages: StageShare[];
}

export const summarizePipeline = (
  deals: readonly Deal[],
  dealStages: DealStage[],
  closedStages: readonly string[],
  now: Date,
): PipelineSummary => {
  const openStages = dealStages.filter(
    (stage) => !closedStages.includes(stage.value),
  );
  const byStage = new Map(
    openStages.map((stage) => [stage.value, { amount: 0, count: 0 }]),
  );

  let weightedAmount = 0;
  let unweightedAmount = 0;
  let overdueCount = 0;
  const closingThisMonth = { count: 0, amount: 0 };

  for (const deal of deals) {
    const bucket = byStage.get(deal.stage);
    if (!bucket || deal.archived_at) continue;

    bucket.amount += deal.amount;
    bucket.count += 1;

    const probability = findDealProbability(dealStages, deal.stage);
    if (probability == null) unweightedAmount += deal.amount;
    else weightedAmount += deal.amount * probability;

    if (closeDateStatus(deal.expected_closing_date, now) === "overdue") {
      overdueCount += 1;
    } else if (deal.expected_closing_date) {
      const close = parseCalendarDate(deal.expected_closing_date);
      if (
        close.getFullYear() === now.getFullYear() &&
        close.getMonth() === now.getMonth()
      ) {
        closingThisMonth.count += 1;
        closingThisMonth.amount += deal.amount;
      }
    }
  }

  const openAmount = [...byStage.values()].reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );

  return {
    openAmount,
    openCount: [...byStage.values()].reduce((sum, b) => sum + b.count, 0),
    weightedAmount,
    unweightedAmount,
    closingThisMonth,
    overdueCount,
    stages: openStages.map((stage) => {
      const bucket = byStage.get(stage.value)!;
      return {
        stage: stage.value,
        amount: bucket.amount,
        count: bucket.count,
        share: openAmount > 0 ? bucket.amount / openAmount : 0,
      };
    }),
  };
};

/** Light to dark in board order; the first stage never fades below legible. */
export const stageOpacity = (index: number, count: number): number =>
  count <= 1 ? 1 : 0.35 + (0.65 * index) / (count - 1);
