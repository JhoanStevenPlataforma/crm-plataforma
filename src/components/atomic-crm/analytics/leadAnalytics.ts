import type { LeadBreakdownStat, LeadDimension, LeadFlowStat } from "../types";

/**
 * Folds over the lead aggregates.
 *
 * Every rate here is COHORT-based: the denominator is the leads that arrived in
 * the period, and the numerator is how many of those converted since. Dividing
 * conversions that happened in the period by leads created in it compares two
 * different populations and produces a rate that can exceed 100%.
 */

export interface LeadPeriodTotals {
  nbCreated: number;
  nbConverted: number;
  /** Total days across converted leads, so the mean divides exactly. */
  conversionDaysTotal: number;
}

/**
 * Period totals from the monthly rows.
 *
 * `avg_conversion_days` arrives per month, so it is multiplied back by that
 * month's converted count before summing — the mean of a month IS its total
 * over its count, so this recovers the exact total and the period mean is not
 * an average of averages.
 */
export const leadTotals = (
  stats: LeadFlowStat[] | undefined,
): LeadPeriodTotals =>
  (stats ?? []).reduce<LeadPeriodTotals>(
    (total, row) => ({
      nbCreated: total.nbCreated + row.nb_created,
      nbConverted: total.nbConverted + row.nb_converted,
      conversionDaysTotal:
        total.conversionDaysTotal +
        (row.avg_conversion_days ?? 0) * row.nb_converted,
    }),
    { nbCreated: 0, nbConverted: 0, conversionDaysTotal: 0 },
  );

/** Null, not 0, when no lead arrived: a rate with no denominator has no value. */
export const conversionRate = (
  nbCreated: number,
  nbConverted: number,
): number | null => (nbCreated === 0 ? null : nbConverted / nbCreated);

export const averageConversionDays = (
  totals: LeadPeriodTotals,
): number | null =>
  totals.nbConverted === 0
    ? null
    : totals.conversionDaysTotal / totals.nbConverted;

export interface LeadFlowPoint {
  month: string;
  created: number;
  converted: number;
}

export const leadFlowSeries = (
  stats: LeadFlowStat[] | undefined,
): LeadFlowPoint[] =>
  (stats ?? []).map((row) => ({
    month: row.month,
    created: row.nb_created,
    converted: row.nb_converted,
  }));

export interface LeadBucketPoint {
  bucket: string;
  nbLeads: number;
  nbConverted: number;
  conversionRate: number | null;
  wonAmount: number;
  pipelineAmount: number;
  avgConversionDays: number | null;
}

/**
 * One dimension out of the combined breakdown, ranked by volume.
 *
 * The three dimensions travel together so every rate is computed over the same
 * cohort; splitting them here is presentation, not re-aggregation.
 */
export const bucketsOf = (
  stats: LeadBreakdownStat[] | undefined,
  dimension: LeadDimension,
): LeadBucketPoint[] =>
  (stats ?? [])
    .filter((row) => row.dimension === dimension)
    .map((row) => ({
      bucket: row.bucket,
      nbLeads: row.nb_leads,
      nbConverted: row.nb_converted,
      conversionRate: conversionRate(row.nb_leads, row.nb_converted),
      wonAmount: row.won_amount,
      pipelineAmount: row.pipeline_amount,
      avgConversionDays: row.avg_conversion_days,
    }))
    .sort((a, b) => b.nbLeads - a.nbLeads);

/**
 * Revenue by source, ranked by money rather than by volume.
 *
 * A separate sort from `bucketsOf` on purpose: the channel that brings the most
 * leads is frequently not the one that brings the most revenue, and that gap is
 * the entire reason this chart exists next to the volume one.
 */
export const revenueBySource = (
  stats: LeadBreakdownStat[] | undefined,
): LeadBucketPoint[] =>
  bucketsOf(stats, "source").sort((a, b) => b.wonAmount - a.wonAmount);

/**
 * What share of the period's converted leads produced a deal we can price.
 *
 * This number has to be on the revenue-by-source card. `deals` has no `source`
 * column, so attribution runs only through `leads.converted_deal_id` — a deal
 * typed straight into the kanban is unattributable. Without this share printed
 * beside it, "revenue by source" is read as the whole business rather than as
 * the sliver of it that carries an origin.
 */
export const attributableShare = (
  stats: LeadBreakdownStat[] | undefined,
): number | null => {
  const sources = (stats ?? []).filter((row) => row.dimension === "source");
  const converted = sources.reduce((sum, row) => sum + row.nb_converted, 0);
  if (converted === 0) return null;

  const withDeal = sources.reduce((sum, row) => sum + row.nb_won_deals, 0);
  return withDeal / converted;
};
