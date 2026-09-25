import {
  periodTotals,
  pipelineTotal,
  type DealPeriodTotals,
} from "../analytics/dealAnalytics";
import { rangeForPreset } from "../analytics/analyticsFilters";
import { conversionRate, leadTotals } from "../analytics/leadAnalytics";
import { stockTotals } from "../analytics/taskAnalytics";
import { useAnalyticsQuery } from "../analytics/useAnalyticsQuery";
import type {
  DealFlowStat,
  DealStageStat,
  LeadFlowStat,
  TaskStockStat,
} from "../types";
import {
  previousRangeForDashboardPeriod,
  rangeForDashboardPeriod,
  type DashboardPeriod,
} from "./dashboardPeriod";

/**
 * Every figure the dashboard header, tiles and charts need.
 *
 * The same four aggregates the analytics overview runs, deliberately: two
 * screens that disagree about this month's won amount discredit each other, and
 * the cheapest way to guarantee they agree is to compute them in one place.
 * `useAnalyticsQuery` caches on function plus parameters, so opening Analytics
 * after the dashboard re-uses what is already in memory rather than asking
 * Postgres the same question again.
 *
 * Four calls, issued in parallel — one wall-clock round trip. They replace a
 * `useGetList("deals", { perPage: 100 })` that the old chart used, which
 * silently stopped counting at the hundredth deal.
 *
 * No owner filter is passed. Every aggregate behind these functions is
 * `SECURITY INVOKER`, so row level security already scopes a rep to their own
 * rows and shows a manager the company's. Passing `identity.id` here would
 * narrow a manager's dashboard to their personal selling, which is not what the
 * screen is for.
 */
export interface DashboardStats {
  /** Everything in flight right now, across stages. No period applies. */
  pipeline: { nbDeals: number; amount: number };
  /** Created / won / lost inside the selected period. */
  totals: DealPeriodTotals;
  /**
   * The same figures over the same stretch of the previous period (see
   * `previousRangeForDashboardPeriod`), for the KPI deltas. Undefined until
   * loaded: a delta against zeroes that are really "not yet" is a lie.
   */
  previousTotals: DealPeriodTotals | undefined;
  leads: { nbCreated: number; nbConverted: number; rate: number | null };
  /** Open task counts. `overdue` is a SUBSET of `open`, never a sibling. */
  workload: { open: number; overdue: number; dueNext7d: number };
  /** Per-stage rows, for the distribution chart. */
  stages: DealStageStat[] | undefined;
  /** Monthly rows over the period, folded into `totals`. */
  flow: DealFlowStat[] | undefined;
  /** Monthly rows over a fixed trailing window, for the trend chart. */
  trend: DealFlowStat[] | undefined;
  isPending: boolean;
  /** True if any aggregate failed. Never render an error as zeroes. */
  failed: boolean;
}

export const useDashboardStats = (period: DashboardPeriod): DashboardStats => {
  const { from, to } = rangeForDashboardPeriod(period);
  const range = { p_from: from, p_to: to };

  // "Where is the pipeline" and "how much is late" have no month, so these two
  // take no date parameters and stay cached across period changes.
  const stages = useAnalyticsQuery<DealStageStat>("deal_stage_stats", {
    p_sales_id: null,
    p_team_id: null,
  });
  const tasks = useAnalyticsQuery<TaskStockStat>("task_stock_stats", {
    p_sales_id: null,
  });
  const flow = useAnalyticsQuery<DealFlowStat>("deal_flow_stats", {
    ...range,
    p_sales_id: null,
    p_team_id: null,
  });
  // One more call for the comparison. It does not hold up the page: the KPI
  // cards render without their delta until it arrives.
  const previousRange = previousRangeForDashboardPeriod(period);
  const previousFlow = useAnalyticsQuery<DealFlowStat>("deal_flow_stats", {
    p_from: previousRange.from,
    p_to: previousRange.to,
    p_sales_id: null,
    p_team_id: null,
  });
  const leads = useAnalyticsQuery<LeadFlowStat>("lead_flow_stats", {
    ...range,
    p_sales_id: null,
  });
  // The revenue chart is a TREND, so it keeps its own fixed trailing window
  // instead of following the period control. Scoped to "this month" it would
  // draw a single bar, which is not a trend but a number rendered as a
  // rectangle; scoped to "today" it would draw nothing at all. Its caption says
  // which window it covers, because a chart that ignores the control above it
  // must admit to doing so.
  const trendRange = rangeForPreset("last_6_months");
  const trend = useAnalyticsQuery<DealFlowStat>("deal_flow_stats", {
    p_from: trendRange.from,
    p_to: trendRange.to,
    p_sales_id: null,
    p_team_id: null,
  });

  const leadFigures = leadTotals(leads.data);

  return {
    pipeline: pipelineTotal(stages.data),
    totals: periodTotals(flow.data),
    previousTotals: previousFlow.data
      ? periodTotals(previousFlow.data)
      : undefined,
    leads: {
      nbCreated: leadFigures.nbCreated,
      nbConverted: leadFigures.nbConverted,
      rate: conversionRate(leadFigures.nbCreated, leadFigures.nbConverted),
    },
    workload: stockTotals(tasks.data),
    stages: stages.data,
    flow: flow.data,
    trend: trend.data,
    isPending:
      stages.isPending || flow.isPending || leads.isPending || tasks.isPending,
    failed: Boolean(
      stages.error || flow.error || leads.error || tasks.error || trend.error,
    ),
  };
};
