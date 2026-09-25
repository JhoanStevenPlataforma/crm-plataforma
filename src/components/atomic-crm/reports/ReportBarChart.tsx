import { ResponsiveBar } from "@nivo/bar";

import { ChartCard } from "../misc/ChartCard";
import {
  barDefaults,
  horizontalBarProps,
  useCategoricalPalette,
} from "../misc/chartTheme";

/**
 * Every bar-shaped report: bar, stacked, ranking and funnel.
 *
 * One component rather than four, because they differ only in three props.
 * `SeriesBarChart` in `analytics/` is deliberately NOT reused here: it takes a
 * semantic `role` per series and sorts them into the palette's mandated order,
 * which is exactly right for a chart whose series are known at build time and
 * exactly wrong for one whose series are whatever the user grouped by. The two
 * share the palette module, which is the part that must not diverge.
 *
 * FUNNEL is horizontal bars in descending order, not a tapered polygon. A
 * tapered funnel encodes value as an area the eye cannot compare, and it lies
 * outright when a later stage holds more money than an earlier one — which
 * happens constantly in a real pipeline. Sorted bars stay readable in that case
 * and carry a value label besides.
 */
export const ReportBarChart = ({
  title,
  subtitle,
  rows,
  seriesLabels,
  formatValue,
  layout = "vertical",
  groupMode = "grouped",
  height = 320,
  emptyLabel,
}: {
  title: string;
  /** The date basis. Never decorative — see `ChartCard`. */
  subtitle?: string;
  /** Already formatted: `{ label, [seriesLabel]: number }`. */
  rows: Record<string, string | number>[];
  seriesLabels: string[];
  formatValue?: (value: number) => string;
  layout?: "vertical" | "horizontal";
  groupMode?: "grouped" | "stacked";
  height?: number;
  emptyLabel?: string;
}) => {
  const palette = useCategoricalPalette();

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      isEmpty={rows.length === 0}
      emptyLabel={emptyLabel}
      height={height}
      // In the header, beside the title. A single series needs no legend:
      // the title names it and the axis names every bar.
      legend={seriesLabels.map((label, i) => ({
        label,
        color: palette[i % palette.length],
      }))}
    >
      <ResponsiveBar
        data={rows}
        indexBy="label"
        keys={seriesLabels}
        // Cycled rather than truncated: the executor caps a report at six
        // metrics, but a stacked chart's series are a dimension's values and
        // there can be more of those than there are colours.
        colors={seriesLabels.map((_, i) => palette[i % palette.length])}
        layout={layout}
        groupMode={groupMode}
        margin={
          layout === "horizontal"
            ? { top: 4, right: 24, bottom: 28, left: 140 }
            : {
                top: 8,
                right: 8,
                bottom: rows.length > 6 ? 56 : 28,
                left: 68,
              }
        }
        {...barDefaults}
        {...(layout === "horizontal" ? horizontalBarProps : {})}
        label={
          formatValue
            ? (datum) => formatValue(Number(datum.value ?? 0))
            : undefined
        }
        valueFormat={formatValue}
        gridYValues={layout === "horizontal" ? undefined : 4}
        gridXValues={layout === "horizontal" ? 4 : undefined}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickValues: layout === "horizontal" ? 4 : undefined,
          // Long category names on a vertical axis overlap past six bars. The
          // rotation is the cheapest fix that keeps every label readable.
          tickRotation: layout === "vertical" && rows.length > 6 ? -35 : 0,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 10,
          tickValues: layout === "horizontal" ? undefined : 4,
        }}
      />
    </ChartCard>
  );
};
