import { findDealProbability } from "../deals/dealUtils";
import type {
  DealFlowStat,
  DealOwnerStat,
  DealStage,
  DealStageStat,
} from "../types";

/**
 * Folds over the deal aggregates. Pure, so the arithmetic is tested away from
 * React and a chart component never contains a business rule.
 *
 * Nothing here re-aggregates: the sums arrive from Postgres already correct.
 * These functions only re-shape and combine, which is the one thing that is
 * safe to do in the browser — `max_rows = 1000` makes summing a list here a
 * silent under-count.
 */

export interface StagePoint {
  stage: string;
  nbDeals: number;
  amount: number;
}

/**
 * The live pipeline, laid out in configured stage order.
 *
 * Ordered by `dealStages` rather than by size, because here the order IS the
 * meaning: a pipeline sorted by amount is just a bar chart. Stages the
 * configuration knows but no live deal occupies are dropped rather than drawn
 * as zero — an empty bar in the middle of a funnel reads as a stage deals skip.
 *
 * This is deliberately NOT a conversion funnel and never prints a rate: a deal
 * sits in exactly one stage, so dividing one stage's count by the previous
 * one's would produce a "conversion" from two numbers that were never a cohort.
 * A real rate needs `deal_stage_changes` — phase 2, and a different chart.
 */
export const stageSeries = (
  stats: DealStageStat[] | undefined,
  stageOrder: string[],
): StagePoint[] => {
  const byStage = new Map((stats ?? []).map((row) => [row.stage, row]));

  return stageOrder
    .map((stage) => byStage.get(stage))
    .filter((row): row is DealStageStat => row != null)
    .map((row) => ({
      stage: row.stage,
      nbDeals: row.nb_deals,
      amount: row.amount,
    }));
};

/** Everything currently in flight, summed across stages. */
export const pipelineTotal = (
  stats: DealStageStat[] | undefined,
): { nbDeals: number; amount: number } =>
  (stats ?? []).reduce(
    (total, row) => ({
      nbDeals: total.nbDeals + row.nb_deals,
      amount: total.amount + row.amount,
    }),
    { nbDeals: 0, amount: 0 },
  );

export interface DealFlowPoint {
  month: string;
  createdAmount: number;
  wonAmount: number;
  lostAmount: number;
  nbCreated: number;
  nbWon: number;
  nbLost: number;
}

/**
 * The monthly series, already sorted by the database.
 *
 * Kept as one point per month carrying all three measures so the chart cannot
 * accidentally plot won and created from differently filtered arrays — they
 * came from one call precisely so they cannot disagree.
 */
export const flowSeries = (
  stats: DealFlowStat[] | undefined,
): DealFlowPoint[] =>
  (stats ?? []).map((row) => ({
    month: row.month,
    createdAmount: row.amount_created,
    wonAmount: row.amount_won,
    lostAmount: row.amount_lost,
    nbCreated: row.nb_created,
    nbWon: row.nb_won,
    nbLost: row.nb_lost,
  }));

export interface DealPeriodTotals {
  nbCreated: number;
  createdAmount: number;
  nbWon: number;
  wonAmount: number;
  nbLost: number;
  lostAmount: number;
  nbForecast: number;
  forecastDaysTotal: number;
}

/** Everything the period's tiles need, summed once from the monthly rows. */
export const periodTotals = (
  stats: DealFlowStat[] | undefined,
): DealPeriodTotals =>
  (stats ?? []).reduce<DealPeriodTotals>(
    (total, row) => ({
      nbCreated: total.nbCreated + row.nb_created,
      createdAmount: total.createdAmount + row.amount_created,
      nbWon: total.nbWon + row.nb_won,
      wonAmount: total.wonAmount + row.amount_won,
      nbLost: total.nbLost + row.nb_lost,
      lostAmount: total.lostAmount + row.amount_lost,
      nbForecast: total.nbForecast + row.nb_forecast,
      forecastDaysTotal: total.forecastDaysTotal + row.forecast_days_total,
    }),
    {
      nbCreated: 0,
      createdAmount: 0,
      nbWon: 0,
      wonAmount: 0,
      nbLost: 0,
      lostAmount: 0,
      nbForecast: 0,
      forecastDaysTotal: 0,
    },
  );

/**
 * Average won deal. Null rather than 0 when nothing closed: "we sold nothing"
 * and "the average of nothing" are different statements, and only one is true.
 */
export const averageDealSize = (totals: DealPeriodTotals): number | null =>
  totals.nbWon === 0 ? null : totals.wonAmount / totals.nbWon;

/**
 * How long a deal is EXPECTED to take, in days.
 *
 * A total divided by a count, never an average of monthly averages — the latter
 * weights a month with three deals like a month with three hundred. It is a
 * statement about what people typed into `expected_closing_date`, not about
 * how long deals actually take; the real figure needs `deal_stage_changes` and
 * arrives in phase 2, so the label must say "expected".
 */
export const forecastCycleDays = (totals: DealPeriodTotals): number | null =>
  totals.nbForecast === 0 ? null : totals.forecastDaysTotal / totals.nbForecast;

export interface OwnerPoint {
  salesId: number;
  name: string;
  wonAmount: number;
  pipelineAmount: number;
  lostAmount: number;
}

/**
 * Owners ranked by what they closed, longest bar first.
 *
 * Truncated, because a company with sixty reps produces a chart no one can
 * read. The caller renders the count it dropped rather than letting the chart
 * quietly become a top-N — a silently truncated ranking is read as the whole
 * team.
 */
export const ownerSeries = (
  stats: DealOwnerStat[] | undefined,
  limit = 10,
): { points: OwnerPoint[]; hidden: number } => {
  const ranked = (stats ?? [])
    .map((row) => ({
      salesId: row.sales_id,
      name: row.owner_name ?? String(row.sales_id),
      wonAmount: row.won_amount,
      pipelineAmount: row.pipeline_amount,
      lostAmount: row.lost_amount,
    }))
    .sort(
      (a, b) =>
        b.wonAmount + b.pipelineAmount - (a.wonAmount + a.pipelineAmount),
    );

  return {
    points: ranked.slice(0, limit),
    hidden: Math.max(0, ranked.length - limit),
  };
};

/**
 * Pipeline weighted by each stage's configured probability.
 *
 * Only stages the configuration gives a probability are counted, and the caller
 * is told how much money was left out: an unconfigured stage contributes
 * nothing, so without that figure the weighted number silently under-reports
 * whenever somebody adds a stage and forgets its weighting.
 *
 * `deal_stage_stats` returns open stages only, so `won` and `lost` never reach
 * here -- a decided deal is not a forecast.
 */
export const weightedPipeline = (
  stats: DealStageStat[] | undefined,
  dealStages: DealStage[],
): { amount: number; unweightedAmount: number } =>
  (stats ?? []).reduce(
    (total, row) => {
      const probability = findDealProbability(dealStages, row.stage);
      return probability == null
        ? {
            ...total,
            unweightedAmount: total.unweightedAmount + row.amount,
          }
        : { ...total, amount: total.amount + row.amount * probability };
    },
    { amount: 0, unweightedAmount: 0 },
  );
