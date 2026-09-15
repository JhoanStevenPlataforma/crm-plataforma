import { useTranslate } from "ra-core";

import { StatTile } from "../misc/StatTile";
import { formatAttainment, formatMonthLabel } from "../misc/reporting";
import type { TaskFlowStat, TaskStockStat, TaskTypeStat } from "../types";
import { AnalyticsLayout } from "./AnalyticsLayout";
import { rangeParams } from "./analyticsFilters";
import { ANALYTICS_PRODUCTIVITY_PATH } from "./analyticsPath";
import { SeriesBarChart } from "./SeriesBarChart";
import {
  averageCycleHours,
  onTimeRate,
  ownerWorkloadSeries,
  stockTotals,
  taskFlowSeries,
  taskTotals,
  typeSeries,
} from "./taskAnalytics";
import { useAnalyticsFilters } from "./useAnalyticsFilters";
import { useAnalyticsQuery } from "./useAnalyticsQuery";

/**
 * Is the team doing the work, on time?
 *
 * Stock and flow are kept apart because they answer different questions and one
 * of them has no month at all. The three tiles are a snapshot of right now; the
 * charts are what happened inside the period.
 *
 * No team filter: tasks have no team column, and resolving one through
 * `team_members` would count a rep rostered in two teams twice. The layout
 * hides the control rather than offering one that quietly double-counts.
 */
export const AnalyticsProductivity = () => {
  const translate = useTranslate();
  const filters = useAnalyticsFilters();
  const range = rangeParams(filters);

  const stock = useAnalyticsQuery<TaskStockStat>("task_stock_stats", {
    p_sales_id: filters.salesId,
  });
  const flow = useAnalyticsQuery<TaskFlowStat>("task_flow_stats", {
    ...range,
    p_sales_id: filters.salesId,
  });
  const types = useAnalyticsQuery<TaskTypeStat>("task_type_stats", {
    ...range,
    p_sales_id: filters.salesId,
  });

  const failed = stock.error || flow.error || types.error ? true : false;

  const workload = stockTotals(stock.data);
  const totals = taskTotals(flow.data);
  const cycle = averageCycleHours(totals);
  const ranking = ownerWorkloadSeries(stock.data);

  const completedLabel = translate("crm.analytics.series.completed");
  const createdLabel = translate("crm.analytics.series.created");
  const openLabel = translate("crm.analytics.series.open");
  const overdueLabel = translate("crm.analytics.series.overdue");

  return (
    <AnalyticsLayout tab="productivity" showTeamFilter={false}>
      {failed ? (
        <p className="text-sm text-destructive">
          {translate("crm.analytics.load_error")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile
          label={translate("crm.analytics.kpi.open_tasks")}
          value={String(workload.open)}
          hint={translate("crm.analytics.basis.now")}
        />
        <StatTile
          label={translate("crm.analytics.kpi.overdue_tasks")}
          value={String(workload.overdue)}
          // Overdue is a subset of open, so the hint says so rather than
          // leaving a reader to add the two into a total that does not exist.
          hint={translate("crm.analytics.kpi.subset_of_open")}
          tone={workload.overdue > 0 ? "alert" : "default"}
        />
        <StatTile
          label={translate("crm.analytics.kpi.due_next_7d")}
          value={String(workload.dueNext7d)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.on_time")}
          value={formatAttainment(onTimeRate(totals))}
          hint={translate("crm.analytics.kpi.completed_count", {
            count: totals.nbCompleted,
          })}
        />
        <StatTile
          label={translate("crm.analytics.kpi.cycle_time")}
          value={
            cycle == null
              ? "—"
              : translate("crm.analytics.kpi.hours", {
                  count: Math.round(cycle),
                })
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SeriesBarChart
          title={translate("crm.analytics.chart.task_flow")}
          // The gap between the two bars IS the backlog forming, which is the
          // only shape that shows a team falling behind while staying busy.
          subtitle={translate("crm.analytics.basis.task_flow")}
          rows={taskFlowSeries(flow.data).map((point) => ({
            label: formatMonthLabel(point.month),
            values: { completed: point.completed, created: point.created },
          }))}
          series={[
            { key: "completed", label: completedLabel, role: "good" },
            { key: "created", label: createdLabel, role: "inFlight" },
          ]}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.activity_mix")}
          subtitle={translate("crm.analytics.basis.completed")}
          layout="horizontal"
          rows={typeSeries(types.data).map((point) => ({
            label: point.label,
            values: { completed: point.completed },
          }))}
          series={[{ key: "completed", label: completedLabel, role: "good" }]}
        />
      </div>

      <SeriesBarChart
        title={translate("crm.analytics.chart.workload_by_owner")}
        subtitle={
          ranking.hidden > 0
            ? translate("crm.analytics.chart.owners_hidden", {
                count: ranking.hidden,
              })
            : translate("crm.analytics.basis.now")
        }
        layout="horizontal"
        groupMode="stacked"
        // `open` here already excludes the overdue ones: stacked without that
        // subtraction, every late task would be drawn twice and the bar would
        // be taller than the person's real workload.
        rows={ranking.points.map((point) => ({
          label: point.name,
          values: { open: point.open, overdue: point.overdue },
        }))}
        series={[
          { key: "open", label: openLabel, role: "inFlight" },
          { key: "overdue", label: overdueLabel, role: "bad" },
        ]}
        height={320}
      />
    </AnalyticsLayout>
  );
};

AnalyticsProductivity.path = ANALYTICS_PRODUCTIVITY_PATH;
