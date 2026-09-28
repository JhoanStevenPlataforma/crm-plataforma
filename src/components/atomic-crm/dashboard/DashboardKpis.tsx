import { AlertTriangle, ListChecks, Target, Trophy } from "lucide-react";
import { useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { flowSeries, weightedPipeline } from "../analytics/dealAnalytics";
import { useChartPalette } from "../misc/chartTheme";
import { KpiCard } from "../misc/KpiCard";
import { Sparkline } from "../misc/Sparkline";
import { formatAttainment, formatMoney, winRate } from "../misc/reporting";
import { decidedCounts } from "../misc/decidedCounts";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DashboardPeriod } from "./dashboardPeriod";
import { compareAmounts, compareRates } from "./kpiDelta";
import type { DashboardStats } from "./useDashboardStats";

/**
 * The four figures the screen opens with.
 *
 * Money in flight, money landed, how often it lands, and what is owed today —
 * ordered so reading ends where acting starts. Four rather than the six a
 * denser grid would allow: each card carries a footer that qualifies its
 * number, and a sixth column leaves no room for the qualification, which is the
 * part that stops a headline figure being misread.
 *
 * Leads and conversion are deliberately not here. They belong to the top of the
 * funnel and they have their own tab in Analytics, where they sit beside the
 * source and cohort breakdowns that make them actionable.
 *
 * The labels reuse the `crm.analytics.kpi.*` vocabulary. The dashboard and the
 * analytics overview report the same measures; naming them differently would
 * make a reader wonder whether they are the same measure.
 */
export const DashboardKpis = ({
  stats,
  period,
}: {
  stats: DashboardStats;
  period: DashboardPeriod;
}) => {
  const translate = useTranslate();
  const { currency, dealStages } = useConfigurationContext();
  const palette = useChartPalette();

  if (stats.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-31 rounded-lg" />
        ))}
      </div>
    );
  }

  const weighted = weightedPipeline(stats.stages, dealStages);
  const rate = winRate(stats.totals.nbWon, stats.totals.nbLost);
  const decided = stats.totals.nbWon + stats.totals.nbLost;

  // Deltas compare with the same stretch of the previous period, and only
  // once that figure has arrived — never against a zero that means "loading".
  const basis = translate(`crm.dashboard.delta.${period}`);
  const basisHint = translate("crm.dashboard.delta.basis_hint");
  const previous = stats.previousTotals;
  const wonDelta = previous
    ? compareAmounts(stats.totals.wonAmount, previous.wonAmount)
    : null;
  const rateDelta = previous
    ? compareRates(rate, winRate(previous.nbWon, previous.nbLost))
    : null;

  // The six-month trend the revenue chart below already loads: one line per
  // card, no extra request.
  const months = flowSeries(stats.trend);
  const wonTrend = months.map((month) => month.wonAmount);
  const rateTrend = months.map((month) => winRate(month.nbWon, month.nbLost));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label={translate("crm.analytics.kpi.weighted_pipeline")}
        value={formatMoney(weighted.amount, currency)}
        icon={Target}
        spotlight
        footerPrimary={translate("crm.analytics.kpi.open_deals", {
          count: stats.pipeline.nbDeals,
        })}
        // Stages with no configured probability contribute nothing to the
        // weighted figure, so the amount they hold is reported rather than
        // silently dropped — otherwise the total under-reports without saying so.
        footerSecondary={
          weighted.unweightedAmount > 0
            ? translate("crm.dashboard.kpi.unweighted_short", {
                amount: formatMoney(weighted.unweightedAmount, currency),
              })
            : formatMoney(stats.pipeline.amount, currency)
        }
      />

      <KpiCard
        label={translate("crm.analytics.kpi.won")}
        value={formatMoney(stats.totals.wonAmount, currency)}
        icon={Trophy}
        delta={
          wonDelta
            ? {
                text:
                  wonDelta.direction === "flat"
                    ? translate("crm.dashboard.delta.no_change")
                    : wonDelta.kind === "percent"
                      ? signed(
                          `${Math.round(Math.abs(wonDelta.ratio) * 100)}%`,
                          wonDelta.ratio,
                        )
                      : signed(
                          formatMoney(Math.abs(wonDelta.amount), currency),
                          wonDelta.amount,
                        ),
                direction: wonDelta.direction,
                tone: toneOf(wonDelta.direction),
                basis,
                basisHint,
              }
            : undefined
        }
        trend={
          <Sparkline
            values={wonTrend}
            color={palette.good}
            label={translate("crm.dashboard.trend_won")}
            className="size-full overflow-visible"
          />
        }
        footerPrimary={translate("crm.common.won_n", {
          smart_count: stats.totals.nbWon,
        })}
        footerSecondary={translate("crm.analytics.basis.expected_close")}
      />

      <KpiCard
        label={translate("crm.analytics.kpi.win_rate")}
        value={formatAttainment(rate)}
        icon={ListChecks}
        delta={
          rateDelta
            ? {
                text:
                  rateDelta.direction === "flat"
                    ? translate("crm.dashboard.delta.no_change")
                    : translate("crm.dashboard.delta.points", {
                        value: signed(
                          String(Math.abs(rateDelta.points)),
                          rateDelta.points,
                        ),
                      }),
                direction: rateDelta.direction,
                tone: toneOf(rateDelta.direction),
                basis,
                basisHint,
              }
            : undefined
        }
        trend={
          <Sparkline
            values={rateTrend}
            color={palette.good}
            label={translate("crm.dashboard.trend_win_rate")}
            className="size-full overflow-visible"
          />
        }
        footerPrimary={translate(
          "crm.analytics.kpi.decided",
          decidedCounts(translate, stats.totals.nbWon, stats.totals.nbLost),
        )}
        // The denominator, stated. A rate over four closed deals is not the
        // same claim as a rate over four hundred.
        footerSecondary={translate("crm.dashboard.kpi.sample", {
          count: decided,
        })}
      />

      <KpiCard
        // The big figure is the open tasks, so the card says so. It was titled
        // "Priority actions" with an "urgent" badge that actually counted
        // overdue tasks (not the "Urgent" priority) and repeated it below.
        label={translate("crm.dashboard.kpi.open_tasks")}
        value={String(stats.workload.open)}
        icon={AlertTriangle}
        badge={
          stats.workload.overdue > 0 ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-[0.625rem]">
              {translate("crm.analytics.kpi.overdue_of_open", {
                count: stats.workload.overdue,
              })}
            </Badge>
          ) : undefined
        }
        // Overdue is a SUBSET of open, never a sibling: it rides as the badge
        // on the open figure, so the two are never read as a sum.
        footerPrimary={translate("crm.analytics.kpi.due_soon", {
          count: stats.workload.dueNext7d,
        })}
        tone={stats.workload.overdue > 0 ? "alert" : "default"}
      />
    </div>
  );
};

/** "+12%" / "-12%" (a true minus sign): the magnitude is formatted by the caller, the sign here. */
const signed = (magnitude: string, value: number) =>
  `${value < 0 ? "−" : "+"}${magnitude}`;

/** More won, and a higher win rate, are both good news; less is not. */
const toneOf = (direction: "up" | "down" | "flat") =>
  direction === "up" ? "good" : direction === "down" ? "bad" : "neutral";
