import { useTranslate } from "ra-core";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { StatTile } from "../misc/StatTile";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type {
  ReportDataset,
  ReportField,
  ReportResult,
  ReportRow,
  ReportSpec,
} from "../types";
import { ReportBarChart } from "./ReportBarChart";
import { ReportDonut } from "./ReportDonut";
import { ReportTable } from "./ReportTable";
import {
  formatDimension,
  formatMetric,
  type LabelSources,
} from "./reportFormat";
import { useReportLabels } from "./reportLabels";
import { useLeadStatusChoices } from "../leads/useLeadStatusChoices";

/**
 * Turns one result into the visualisation the spec asked for.
 *
 * Every branch reads the SAME formatted values, produced once above the switch.
 * Formatting inside each renderer is how a table and its chart end up
 * disagreeing about a rounded figure — the reader sees "42%" beside a bar
 * labelled "41%" and stops trusting both.
 */

const rowLabel = (
  row: ReportRow,
  dimensions: ReportField[],
  sources: LabelSources,
  unassigned: string,
) =>
  dimensions
    .map((field) =>
      formatDimension(
        field,
        row.dimensions[field.key] ?? null,
        sources,
        unassigned,
      ),
    )
    .join(" · ");

export const ReportResultView = ({
  spec,
  dataset,
  result,
  isPending,
  error,
  onSort,
}: {
  spec: ReportSpec;
  dataset: ReportDataset;
  result: ReportResult | undefined;
  isPending: boolean;
  error: unknown;
  onSort?: (field: string) => void;
}) => {
  const translate = useTranslate();
  const config = useConfigurationContext();
  const leadStatuses = useLeadStatusChoices();
  const labels = useReportLabels();

  const sources: LabelSources = useMemo(
    () => ({
      dealStages: config.dealStages,
      dealCategories: config.dealCategories,
      leadSources: config.leadSources,
      leadStatuses,
    }),
    [config, leadStatuses],
  );

  const byKey = useMemo(
    () => new Map(dataset.fields.map((field) => [field.key, field])),
    [dataset],
  );

  const metrics = spec.metrics
    .map((key) => byKey.get(key))
    .filter((field): field is ReportField => Boolean(field));
  const dimensions = spec.dimensions
    .map((key) => byKey.get(key))
    .filter((field): field is ReportField => Boolean(field));

  const unassigned = translate("crm.reports.unassigned");

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (error) {
    // Rendering an error as zeroes would report a company with no pipeline and
    // no overdue work — a far more alarming screen than an error message, and
    // one nobody would think to doubt.
    return (
      <p className="text-sm text-destructive py-8">
        {error instanceof Error &&
        error.message === "crm.reports.demo_unavailable"
          ? translate("crm.reports.demo_unavailable")
          : translate("crm.reports.run_error")}
      </p>
    );
  }

  const rows = result?.rows ?? [];

  const formatCell = (
    kind: "dimension" | "metric",
    field: ReportField,
    row: ReportRow,
  ) =>
    kind === "metric"
      ? formatMetric(
          field.key,
          row.metrics[field.key],
          field.data_type,
          config.currency,
        )
      : formatDimension(
          field,
          row.dimensions[field.key] ?? null,
          sources,
          unassigned,
        );

  const title = translate("crm.reports.result_title", {
    dataset: labels.dataset(dataset),
  });
  const periodField = spec.period ? byKey.get(spec.period.field) : undefined;
  const subtitle = spec.period
    ? translate("crm.reports.basis", {
        field: periodField
          ? labels.field(dataset.key, periodField)
          : spec.period.field,
      })
    : translate("crm.analytics.basis.now");

  // ---- KPI ---------------------------------------------------------------
  //
  // The one visualisation that ignores dimensions: a KPI is the total, and a
  // grouped total is a chart. When the spec does carry dimensions the executor
  // still groups, so the first row is shown and the tile says it is a subset
  // rather than pretending to be the whole.
  if (spec.visualisation === "kpi") {
    const row = rows[0];
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((field) => (
          <StatTile
            key={field.key}
            label={labels.field(dataset.key, field)}
            value={
              row
                ? formatMetric(
                    field.key,
                    row.metrics[field.key],
                    field.data_type,
                    config.currency,
                  )
                : "—"
            }
            hint={
              dimensions.length > 0 && row
                ? rowLabel(row, dimensions, sources, unassigned)
                : subtitle
            }
          />
        ))}
      </div>
    );
  }

  // ---- table -------------------------------------------------------------
  if (spec.visualisation === "table") {
    return (
      <ReportTable
        dimensions={dimensions}
        metrics={metrics}
        rows={rows}
        formatCell={formatCell}
        labelOf={(field) => labels.field(dataset.key, field)}
        sort={spec.sort}
        onSort={onSort}
      />
    );
  }

  // ---- donut -------------------------------------------------------------
  if (spec.visualisation === "donut") {
    const metric = metrics[0];
    return (
      <ReportDonut
        title={title}
        subtitle={subtitle}
        slices={rows.map((row) => ({
          label: rowLabel(row, dimensions, sources, unassigned),
          value: row.metrics[metric?.key ?? ""] ?? 0,
          formatted: metric
            ? formatMetric(
                metric.key,
                row.metrics[metric.key],
                metric.data_type,
                config.currency,
              )
            : "—",
        }))}
      />
    );
  }

  // ---- bars --------------------------------------------------------------
  //
  // A stacked report has two dimensions and one metric: the series are the
  // SECOND dimension's values, not the metrics. Every other bar shape has one
  // dimension on the axis and the metrics as series.
  const isStacked = spec.visualisation === "stacked";
  const isHorizontal =
    spec.visualisation === "ranking" || spec.visualisation === "funnel";

  let chartRows: Record<string, string | number>[];
  let seriesLabels: string[];

  if (isStacked && dimensions.length === 2) {
    const [outer, inner] = dimensions;
    const metric = metrics[0];
    const buckets = new Map<string, Record<string, string | number>>();
    const series = new Set<string>();

    for (const row of rows) {
      const outerLabel = formatDimension(
        outer,
        row.dimensions[outer.key] ?? null,
        sources,
        unassigned,
      );
      const innerLabel = formatDimension(
        inner,
        row.dimensions[inner.key] ?? null,
        sources,
        unassigned,
      );
      series.add(innerLabel);

      const bucket = buckets.get(outerLabel) ?? { label: outerLabel };
      bucket[innerLabel] = row.metrics[metric?.key ?? ""] ?? 0;
      buckets.set(outerLabel, bucket);
    }

    chartRows = [...buckets.values()];
    seriesLabels = [...series];
  } else {
    seriesLabels = metrics.map((field) => labels.field(dataset.key, field));
    chartRows = rows.map((row) => {
      const point: Record<string, string | number> = {
        label: rowLabel(row, dimensions, sources, unassigned),
      };
      for (const field of metrics) {
        point[labels.field(dataset.key, field)] = row.metrics[field.key] ?? 0;
      }
      return point;
    });
  }

  // A single money metric formats as money; a mix of money and counts on one
  // axis cannot be formatted as either, so the raw number is printed and the
  // legend names the series.
  const onlyMoney =
    metrics.length > 0 && metrics.every((field) => field.data_type === "money");
  const singleMetricKey = metrics.length === 1 ? metrics[0].key : "";

  return (
    <ReportBarChart
      title={title}
      subtitle={subtitle}
      rows={chartRows}
      seriesLabels={seriesLabels}
      layout={isHorizontal ? "horizontal" : "vertical"}
      groupMode={isStacked ? "stacked" : "grouped"}
      height={isHorizontal ? Math.max(280, chartRows.length * 34 + 90) : 340}
      formatValue={(value) =>
        formatMetric(
          singleMetricKey,
          value,
          onlyMoney ? "money" : "number",
          config.currency,
        )
      }
    />
  );
};
