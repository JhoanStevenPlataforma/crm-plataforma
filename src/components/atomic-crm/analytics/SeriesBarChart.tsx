import { ResponsiveBar } from "@nivo/bar";

import { ChartCard } from "../misc/ChartCard";
import {
  barDefaults,
  horizontalBarProps,
  useChartPalette,
  type ChartRole,
} from "../misc/chartTheme";

/**
 * Every chart in this module.
 *
 * One component rather than a dozen near-identical wrappers: all four tabs draw
 * the same two shapes — a category axis (stage, source, type, owner) or a month
 * axis — with one to three series. What differs is the data and the labels,
 * which are props.
 *
 * It also owns the palette rule so no caller can get it wrong. `teamChartTheme`
 * states that ORDERING IS PART OF THE PALETTE: green next to red is the
 * deuteranopia collision, so blue always sits between them. Callers declare a
 * ROLE per series and this component sorts them into that order — passing the
 * series in the wrong order is therefore not expressible.
 */

export interface ChartSeries {
  /** Key into each row's `values`. */
  key: string;
  /** Translated, and used as the nivo key so the legend reads in the UI's
   * language rather than in database vocabulary. */
  label: string;
  role: ChartRole;
}

export interface SeriesRow {
  label: string;
  values: Record<string, number>;
}

/** A request, not an exact count: d3 rounds it to clean steps (0/200K/400K). */
const VALUE_TICKS = 4;

/** "Apr 2026": a month label as `formatMonthLabel` writes it. */
const MONTH_LABEL = /^(\S+) (\d{4})$/;

/** Green, blue, red, then the recessive gray of a reference mark. */
const ROLE_ORDER: ChartRole[] = ["good", "inFlight", "bad", "reference"];

export const SeriesBarChart = ({
  title,
  subtitle,
  rows,
  series,
  formatValue,
  emptyLabel,
  layout = "vertical",
  groupMode = "grouped",
  height = 280,
}: {
  title: string;
  /** The date basis, e.g. "by expected closing date". Never decorative. */
  subtitle?: string;
  rows: SeriesRow[];
  series: ChartSeries[];
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  layout?: "vertical" | "horizontal";
  groupMode?: "grouped" | "stacked";
  height?: number;
}) => {
  const palette = useChartPalette();

  const ordered = [...series].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  const data = rows.map((row) => {
    const point: Record<string, string | number> = { label: row.label };
    for (const item of ordered) {
      point[item.label] = row.values[item.key] ?? 0;
    }
    return point;
  });

  const format = formatValue ?? ((value: number) => value.toLocaleString());
  // "Apr 2026" per tick overlaps on a narrow card. When every category is a
  // month, the axis shows the month alone; the year stays in the subtitle,
  // the tooltip and the table.
  const isMonthly =
    rows.length > 0 && rows.every((row) => MONTH_LABEL.test(row.label));
  const categoryTick = isMonthly
    ? (value: string | number) => String(value).replace(MONTH_LABEL, "$1")
    : undefined;
  const isHorizontal = layout === "horizontal";

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      isEmpty={rows.length === 0}
      emptyLabel={emptyLabel}
      height={height}
      // A single series needs no legend: the title names it and the axis
      // names every bar.
      legend={ordered.map((item) => ({
        label: item.label,
        color: palette[item.role],
      }))}
      table={{
        columns: ["", ...ordered.map((item) => item.label)],
        rows: rows.map((row) => ({
          key: row.label,
          cells: [
            row.label,
            ...ordered.map((item) => format(row.values[item.key] ?? 0)),
          ],
        })),
      }}
    >
      <ResponsiveBar
        data={data}
        indexBy="label"
        keys={ordered.map((item) => item.label)}
        colors={ordered.map((item) => palette[item.role])}
        layout={layout}
        groupMode={groupMode}
        margin={
          isHorizontal
            ? { top: 4, right: 24, bottom: 28, left: 116 }
            : {
                top: 8,
                right: 8,
                bottom: rows.length > 6 ? 48 : 28,
                left: 64,
              }
        }
        {...barDefaults}
        {...(isHorizontal ? horizontalBarProps : {})}
        // The value is printed on any segment big enough to hold it: two of
        // these hues sit under 3:1 against the light surface, so identity is
        // never carried by colour alone.
        label={
          formatValue
            ? (datum) => formatValue(Number(datum.value ?? 0))
            : undefined
        }
        valueFormat={formatValue}
        // The value axis speaks the same compact figures as the bars
        // ("$1.2M", not "1200000").
        // Five clean ticks on the value axis, never the eleven nivo picks by
        // default: the gridlines are a reference, not a ruler.
        gridYValues={isHorizontal ? undefined : VALUE_TICKS}
        gridXValues={isHorizontal ? VALUE_TICKS : undefined}
        axisLeft={{
          tickSize: 0,
          tickPadding: 10,
          tickValues: isHorizontal ? undefined : VALUE_TICKS,
          format: isHorizontal ? undefined : formatValue,
        }}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickValues: isHorizontal ? VALUE_TICKS : undefined,
          tickRotation: !isHorizontal && rows.length > 6 ? -35 : 0,
          format: isHorizontal ? formatValue : categoryTick,
        }}
      />
    </ChartCard>
  );
};
