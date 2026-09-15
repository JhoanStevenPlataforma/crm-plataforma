import { ResponsiveBar } from "@nivo/bar";

import { ChartCard } from "../misc/ChartCard";
import {
  barDefaults,
  bottomLegend,
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

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      isEmpty={rows.length === 0}
      emptyLabel={emptyLabel}
      height={height}
    >
      <ResponsiveBar
        data={data}
        indexBy="label"
        keys={ordered.map((item) => item.label)}
        colors={ordered.map((item) => palette[item.role])}
        layout={layout}
        groupMode={groupMode}
        margin={
          layout === "horizontal"
            ? { top: 10, right: 20, bottom: 50, left: 110 }
            : { top: 10, right: 20, bottom: 60, left: 60 }
        }
        {...barDefaults}
        // The value is printed on any segment big enough to hold it: two of
        // these hues sit under 3:1 against the light surface, so identity is
        // never carried by colour alone.
        label={
          formatValue
            ? (datum) => formatValue(Number(datum.value ?? 0))
            : undefined
        }
        valueFormat={formatValue}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          tickRotation: layout === "vertical" && rows.length > 6 ? -35 : 0,
        }}
        // A single series needs no legend: the title names it and the axis
        // names every bar.
        legends={ordered.length > 1 ? bottomLegend : undefined}
      />
    </ChartCard>
  );
};
