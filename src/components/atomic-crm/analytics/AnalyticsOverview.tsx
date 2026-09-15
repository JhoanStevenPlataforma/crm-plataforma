import { useTranslate } from "ra-core";

import { Card, CardContent } from "@/components/ui/card";

import { ActivityLog } from "../activity/ActivityLog";

import { StatTile } from "../misc/StatTile";
import {
  formatAttainment,
  formatMonthLabel,
  formatMoney,
  winRate,
} from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type {
  DealFlowStat,
  DealStageStat,
  LeadFlowStat,
  TaskStockStat,
} from "../types";
import { AnalyticsLayout } from "./AnalyticsLayout";
import {
  conversionDrilldown,
  leadsDrilldown,
  overdueDrilldown,
  pipelineDrilldown,
  winRateDrilldown,
  wonDrilldown,
} from "./analyticsDrilldown";
import { ANALYTICS_PATH } from "./analyticsPath";
import { rangeParams } from "./analyticsFilters";
import {
  flowSeries,
  periodTotals,
  pipelineTotal,
  stageSeries,
} from "./dealAnalytics";
import { labelOf } from "./labels";
import { conversionRate, leadTotals } from "./leadAnalytics";
import { OpenPastDueDealsTable } from "./OpenPastDueDealsTable";
import { SeriesBarChart } from "./SeriesBarChart";
import { stockTotals } from "./taskAnalytics";
import { useAnalyticsFilters } from "./useAnalyticsFilters";
import { useAnalyticsQuery } from "./useAnalyticsQuery";

/**
 * Is the commercial machine healthy this period, and what needs attention now?
 *
 * Money first, then the funnel, then the alert — the alert sits at the end of
 * the tile row because that is where reading stops and acting starts. Only the
 * overdue tile is coloured: colouring every bad number makes the colour mean
 * nothing.
 *
 * Four aggregates in parallel, which is one wall-clock round trip. Two of them
 * (`deal_stage_stats`, `task_stock_stats`) take no date parameters at all,
 * because "where is the pipeline" and "how much is late" have no month.
 */
export const AnalyticsOverview = () => {
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
  const leads = useAnalyticsQuery<LeadFlowStat>("lead_flow_stats", {
    ...range,
    p_sales_id: filters.salesId,
  });
  const tasks = useAnalyticsQuery<TaskStockStat>("task_stock_stats", {
    p_sales_id: filters.salesId,
  });

  // Rendering an error as zeroes would report a company with no pipeline and
  // no overdue work, which is a far more alarming screen than an error message.
  const failed =
    stages.error || flow.error || leads.error || tasks.error ? true : false;

  const pipeline = pipelineTotal(stages.data);
  const totals = periodTotals(flow.data);
  const leadFigures = leadTotals(leads.data);
  const workload = stockTotals(tasks.data);

  const wonLabel = translate("crm.analytics.series.won");
  const createdLabel = translate("crm.analytics.series.created");
  const lostLabel = translate("crm.analytics.series.lost");
  const amountLabel = translate("crm.analytics.series.amount");

  return (
    <AnalyticsLayout tab="overview">
      {failed ? (
        <p className="text-sm text-destructive">
          {translate("crm.analytics.load_error")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatTile
          label={translate("crm.analytics.kpi.open_pipeline")}
          value={formatMoney(pipeline.amount, currency)}
          hint={translate("crm.analytics.basis.now")}
          to={pipelineDrilldown(filters)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.won")}
          value={formatMoney(totals.wonAmount, currency)}
          hint={translate("crm.analytics.basis.expected_close")}
          to={wonDrilldown(filters)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.win_rate")}
          value={formatAttainment(winRate(totals.nbWon, totals.nbLost))}
          hint={translate("crm.analytics.kpi.decided", {
            won: totals.nbWon,
            lost: totals.nbLost,
          })}
          to={winRateDrilldown(filters)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.new_leads")}
          value={String(leadFigures.nbCreated)}
          hint={translate("crm.analytics.basis.lead_created")}
          to={leadsDrilldown(filters)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.lead_conversion")}
          value={formatAttainment(
            conversionRate(leadFigures.nbCreated, leadFigures.nbConverted),
          )}
          hint={translate("crm.analytics.basis.cohort")}
          to={conversionDrilldown(filters)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.overdue_tasks")}
          value={String(workload.overdue)}
          hint={translate("crm.analytics.kpi.due_soon", {
            count: workload.dueNext7d,
          })}
          tone={workload.overdue > 0 ? "alert" : "default"}
          to={overdueDrilldown()}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SeriesBarChart
            title={translate("crm.analytics.chart.deal_flow")}
            // Two date bases in one chart, so each series names its own.
            subtitle={translate("crm.analytics.basis.deal_flow")}
            rows={flowSeries(flow.data).map((point) => ({
              label: formatMonthLabel(point.month),
              values: {
                won: point.wonAmount,
                created: point.createdAmount,
                lost: point.lostAmount,
              },
            }))}
            series={[
              { key: "won", label: wonLabel, role: "good" },
              { key: "created", label: createdLabel, role: "inFlight" },
              { key: "lost", label: lostLabel, role: "bad" },
            ]}
            formatValue={(value) => formatMoney(value, currency)}
          />
        </div>
        <SeriesBarChart
          title={translate("crm.analytics.chart.pipeline_by_stage")}
          subtitle={translate("crm.analytics.basis.now")}
          rows={stageSeries(
            stages.data,
            dealStages.map((s) => s.value),
          ).map((point) => ({
            label: labelOf(dealStages, point.stage),
            values: { amount: point.amount },
          }))}
          series={[{ key: "amount", label: amountLabel, role: "inFlight" }]}
          formatValue={(value) => formatMoney(value, currency)}
        />
      </div>

      <OpenPastDueDealsTable
        salesId={filters.salesId}
        teamId={filters.teamId}
      />

      {/* Informational, and the subtitle says the one thing that would
          otherwise mislead: this feed reads `activity_log`, which takes no
          period or owner filter, so it is NOT scoped by the bar above. Every
          other figure on this page is. */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium">
              {translate("crm.analytics.chart.recent_activity")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {translate("crm.analytics.basis.unfiltered")}
            </p>
          </div>
          <ActivityLog pageSize={10} />
        </CardContent>
      </Card>
    </AnalyticsLayout>
  );
};

AnalyticsOverview.path = ANALYTICS_PATH;
