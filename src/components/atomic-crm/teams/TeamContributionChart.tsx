import { ResponsiveBar } from "@nivo/bar";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatAttainment, formatMoney } from "./teamBudget";
import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, useChartPalette } from "./teamChartTheme";
import type { ContributionPoint } from "./memberContribution";

/**
 * Won amount per member, largest first.
 *
 * One series, so no legend — the axis names every bar. Green, because this is
 * won money and green means the same thing on every chart here.
 *
 * The label carries the share as well as the amount: the amount says who sold
 * most, the share says whether the team's number depends on one person, and
 * only the second is a risk.
 */
export const TeamContributionChart = ({
  points,
  title,
}: {
  points: ContributionPoint[];
  title: string;
}) => {
  const { currency } = useConfigurationContext();
  const palette = useChartPalette();

  const data = points
    // Nivo draws the first row lowest, so the biggest contributor ends up on top.
    .slice()
    .reverse()
    .map((point) => ({
      name: point.name,
      won: point.won,
      share: point.share,
    }));

  return (
    <TeamChartCard
      title={title}
      isEmpty={points.length === 0}
      height={Math.max(220, points.length * 38 + 60)}
    >
      <ResponsiveBar
        data={data}
        indexBy="name"
        keys={["won"]}
        layout="horizontal"
        colors={[palette.good]}
        margin={{ top: 10, right: 30, bottom: 40, left: 150 }}
        {...barDefaults}
        labelSkipWidth={56}
        label={(datum) =>
          `${formatMoney(datum.value ?? 0, currency)} · ${formatAttainment(
            datum.data.share as number,
          )}`
        }
        axisBottom={{ format: (value: number) => formatMoney(value, currency) }}
      />
    </TeamChartCard>
  );
};
