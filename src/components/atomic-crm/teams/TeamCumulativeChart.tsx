import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatMoney } from "./teamBudget";
import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, useChartPalette } from "./teamChartTheme";
import { formatMonthLabel, type CumulativePoint } from "./teamStats";

/**
 * Won so far against the target — the "are we going to make it" chart.
 *
 * The monthly bars next to it cannot answer that: a run of good months still
 * misses the number if there were not enough of them left. This one accumulates,
 * so the gap to the target is a distance you can see rather than a subtraction
 * you have to do.
 *
 * The target is a MARKER, not a fourth bar. It is the same value on every month
 * (the schema does not phase a budget by month), and drawn as a bar it would
 * dwarf every real column early in the period and imply a monthly quota nobody
 * set. As a horizontal reference line in the recessive gray it stays quiet and
 * still answers the question at a glance.
 *
 * One series, so no legend: the title names it, and the marker carries its own
 * label.
 */
export const TeamCumulativeChart = ({
  points,
  title,
}: {
  points: CumulativePoint[];
  title: string;
}) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const palette = useChartPalette();

  const target = points[0]?.target ?? null;
  const data = points.map((point) => ({
    month: formatMonthLabel(point.month),
    wonToDate: point.wonToDate,
  }));

  return (
    <TeamChartCard title={title} isEmpty={points.length === 0}>
      <ResponsiveBar
        data={data}
        indexBy="month"
        keys={["wonToDate"]}
        colors={[palette.good]}
        margin={{ top: 20, right: 20, bottom: 40, left: 70 }}
        {...barDefaults}
        label={(datum) => formatMoney(datum.value ?? 0, currency)}
        axisLeft={{ format: (value: number) => formatMoney(value, currency) }}
        markers={
          target == null
            ? []
            : [
                {
                  axis: "y" as const,
                  value: target,
                  lineStyle: {
                    stroke: palette.reference,
                    strokeWidth: 2,
                    strokeDasharray: "4 4",
                  },
                  legend: translate("crm.teams_dashboard.target_marker", {
                    amount: formatMoney(target, currency),
                  }),
                  legendPosition: "top-left" as const,
                  textStyle: {
                    fill: "var(--color-muted-foreground)",
                    fontSize: 11,
                  },
                },
              ]
        }
      />
    </TeamChartCard>
  );
};
