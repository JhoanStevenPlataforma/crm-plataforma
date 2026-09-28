import { useTranslate } from "ra-core";

import { StatTile } from "../misc/StatTile";
import { decidedCounts } from "../misc/decidedCounts";
import {
  formatAttainment,
  formatMonthLabel,
  formatMoney,
  winRate,
} from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DealFlowStat, DealOwnerStat, DealStageStat } from "../types";
import { AnalyticsLayout } from "./AnalyticsLayout";
import { rangeParams } from "./analyticsFilters";
import { ANALYTICS_PIPELINE_PATH } from "./analyticsPath";
import {
  averageDealSize,
  flowSeries,
  forecastCycleDays,
  ownerSeries,
  periodTotals,
  pipelineTotal,
  stageSeries,
  weightedPipeline,
} from "./dealAnalytics";
import { labelOf } from "./labels";
import { OpenPastDueDealsTable } from "./OpenPastDueDealsTable";
import { SeriesBarChart } from "./SeriesBarChart";
import { useAnalyticsFilters } from "./useAnalyticsFilters";
import { useAnalyticsQuery } from "./useAnalyticsQuery";

/**
 * Where is the money, how fast does it move, and who moves it?
 *
 * The stage chart is NOT a conversion funnel and prints no rate: a deal sits in
 * exactly one stage, so dividing one stage's count by the previous one's would
 * invent a conversion from two numbers that were never a cohort. A real funnel
 * needs `deal_stage_changes`, which has only been recording since 2026-08-18 —
 * phase 2, and a different chart.
 */
export const AnalyticsPipeline = () => {
  const translate = useTranslate();
  const { currency, dealStages } = useConfigurationContext();
  const filters = useAnalyticsFilters();
  const range = rangeParams(filters);

  const stages = useAnalyticsQuery<DealStageStat>("deal_stage_stats", {
    p_sales_id: filters.salesId,
    p_team_id: filters.teamId,
  });
  const flow = useAnalyticsQuery<DealFlowStat>("deal_flow_stats", {
    ...range,
    p_sales_id: filters.salesId,
    p_team_id: filters.teamId,
  });
  const owners = useAnalyticsQuery<DealOwnerStat>("deal_owner_stats", {
    ...range,
    p_team_id: filters.teamId,
  });

  const failed = stages.error || flow.error || owners.error ? true : false;

  const pipeline = pipelineTotal(stages.data);
  const totals = periodTotals(flow.data);
  // `deal_owner_stats` groups BY owner, so it takes no owner parameter — the
  // breakdown is the point of the query. Narrowing it to the selected owner
  // happens here instead: it is a filter over at most one row per salesperson,
  // never a re-aggregation, and without it the owner filter would be the one
  // control on this tab that changes nothing.
  const ranking = ownerSeries(
    filters.salesId == null
      ? owners.data
      : owners.data?.filter((row) => row.sales_id === filters.salesId),
  );
  const cycle = forecastCycleDays(totals);
  const asp = averageDealSize(totals);
  const weighted = weightedPipeline(stages.data, dealStages);

  const wonLabel = translate("crm.analytics.series.won");
  const createdLabel = translate("crm.analytics.series.created");
  const lostLabel = translate("crm.analytics.series.lost");
  const pipelineLabel = translate("crm.analytics.series.pipeline");
  const dealsLabel = translate("crm.analytics.series.deals");

  return (
    <AnalyticsLayout tab="pipeline">
      {failed ? (
        <p className="text-sm text-destructive">
          {translate("crm.analytics.load_error")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatTile
          label={translate("crm.analytics.kpi.open_pipeline")}
          value={formatMoney(pipeline.amount, currency)}
          hint={translate("crm.analytics.kpi.open_deals", {
            count: pipeline.nbDeals,
          })}
        />
        <StatTile
          label={translate("crm.analytics.kpi.won")}
          value={formatMoney(totals.wonAmount, currency)}
          hint={translate("crm.analytics.basis.expected_close")}
        />
        {/* Unblocked by moving the stage probabilities out of `DealsChart.tsx`
            and into the application configuration. Stages with no probability
            configured are excluded and reported, never counted at zero. */}
        <StatTile
          label={translate("crm.analytics.kpi.weighted_pipeline")}
          value={formatMoney(weighted.amount, currency)}
          hint={
            weighted.unweightedAmount > 0
              ? translate("crm.analytics.kpi.unweighted", {
                  amount: formatMoney(weighted.unweightedAmount, currency),
                })
              : undefined
          }
        />
        <StatTile
          label={translate("crm.analytics.kpi.average_deal")}
          value={asp == null ? "—" : formatMoney(asp, currency)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.win_rate")}
          value={formatAttainment(winRate(totals.nbWon, totals.nbLost))}
          hint={translate(
            "crm.analytics.kpi.decided",
            decidedCounts(translate, totals.nbWon, totals.nbLost),
          )}
        />
        {/* "Expected", never "actual": this measures what people typed into
            `expected_closing_date`, not how long deals really take. The real
            figure needs `deal_stage_changes` and arrives in phase 2. */}
        <StatTile
          label={translate("crm.analytics.kpi.forecast_cycle")}
          value={
            cycle == null
              ? "—"
              : translate("crm.analytics.kpi.days", {
                  count: Math.round(cycle),
                })
          }
          hint={translate("crm.analytics.basis.forecast")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SeriesBarChart
          title={translate("crm.analytics.chart.deals_by_stage")}
          subtitle={translate("crm.analytics.basis.now")}
          rows={stageSeries(
            stages.data,
            dealStages.map((stage) => stage.value),
          ).map((point) => ({
            label: labelOf(dealStages, point.stage),
            values: { deals: point.nbDeals },
          }))}
          series={[{ key: "deals", label: dealsLabel, role: "inFlight" }]}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.won_vs_lost")}
          subtitle={translate("crm.analytics.basis.expected_close")}
          rows={flowSeries(flow.data).map((point) => ({
            label: formatMonthLabel(point.month),
            values: { won: point.wonAmount, lost: point.lostAmount },
          }))}
          series={[
            { key: "won", label: wonLabel, role: "good" },
            { key: "lost", label: lostLabel, role: "bad" },
          ]}
          formatValue={(value) => formatMoney(value, currency)}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.deals_created")}
          subtitle={translate("crm.analytics.basis.deal_created")}
          rows={flowSeries(flow.data).map((point) => ({
            label: formatMonthLabel(point.month),
            values: { created: point.createdAmount },
          }))}
          series={[{ key: "created", label: createdLabel, role: "inFlight" }]}
          formatValue={(value) => formatMoney(value, currency)}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.by_owner")}
          subtitle={
            ranking.hidden > 0
              ? translate("crm.analytics.chart.owners_hidden", {
                  count: ranking.hidden,
                })
              : translate("crm.analytics.basis.mixed")
          }
          rows={ranking.points.map((point) => ({
            label: point.name,
            values: {
              won: point.wonAmount,
              pipeline: point.pipelineAmount,
              lost: point.lostAmount,
            },
          }))}
          series={[
            { key: "won", label: wonLabel, role: "good" },
            { key: "pipeline", label: pipelineLabel, role: "inFlight" },
            { key: "lost", label: lostLabel, role: "bad" },
          ]}
          groupMode="stacked"
          layout="horizontal"
          formatValue={(value) => formatMoney(value, currency)}
          height={320}
        />
      </div>

      <OpenPastDueDealsTable
        salesId={filters.salesId}
        teamId={filters.teamId}
      />
    </AnalyticsLayout>
  );
};

AnalyticsPipeline.path = ANALYTICS_PIPELINE_PATH;
