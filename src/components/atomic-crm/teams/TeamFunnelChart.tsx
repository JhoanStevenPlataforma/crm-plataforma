import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatMoney } from "./teamBudget";
import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, useChartPalette } from "./teamChartTheme";
import type { FunnelPoint } from "./teamStats";

/**
 * The period's deals, laid out in configured stage order.
 *
 * Counts, not amounts, on the bar: the amounts are already charted by
 * `StageBreakdownChart` next to it, and where the DEALS are is a different
 * question from where the money is — one large deal in negotiation and twenty
 * small ones look identical on an amount chart.
 *
 * It is not a conversion funnel and does not print conversion rates. A deal
 * sits in exactly one stage, so these counts were never a cohort; see
 * `dealFunnel` in `teamStats.ts` for why inventing a rate from them would be
 * wrong. The money per stage rides along in the tooltip label instead.
 *
 * One series, so no legend — the axis names every bar.
 */
export const TeamFunnelChart = ({
  points,
  title,
}: {
  points: FunnelPoint[];
  title: string;
}) => {
  const translate = useTranslate();
  const { currency, dealStages } = useConfigurationContext();
  const palette = useChartPalette();

  const labelOf = (stage: string) =>
    dealStages.find((candidate) => candidate.value === stage)?.label ?? stage;

  const data = points
    // Configured order runs top to bottom; nivo draws the first row lowest.
    .slice()
    .reverse()
    .map((point) => ({
      stage: labelOf(point.stage),
      nbDeals: point.nbDeals,
      amount: point.amount,
    }));

  return (
    <TeamChartCard
      title={title}
      isEmpty={points.length === 0}
      height={Math.max(220, points.length * 42 + 60)}
    >
      <ResponsiveBar
        data={data}
        indexBy="stage"
        keys={["nbDeals"]}
        layout="horizontal"
        colors={[palette.inFlight]}
        margin={{ top: 10, right: 30, bottom: 40, left: 130 }}
        {...barDefaults}
        labelSkipWidth={24}
        label={(datum) =>
          translate("crm.teams_dashboard.funnel_label", {
            count: datum.value ?? 0,
            amount: formatMoney(datum.data.amount as number, currency),
          })
        }
      />
    </TeamChartCard>
  );
};
