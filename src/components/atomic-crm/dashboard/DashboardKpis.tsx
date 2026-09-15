import { AlertTriangle, ListChecks, Target, Trophy } from "lucide-react";
import { useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { weightedPipeline } from "../analytics/dealAnalytics";
import { KpiCard } from "../misc/KpiCard";
import { formatAttainment, formatMoney, winRate } from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
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
export const DashboardKpis = ({ stats }: { stats: DashboardStats }) => {
  const translate = useTranslate();
  const { currency, dealStages } = useConfigurationContext();

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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label={translate("crm.analytics.kpi.weighted_pipeline")}
        value={formatMoney(weighted.amount, currency)}
        icon={Target}
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
        footerPrimary={translate("crm.dashboard.kpi.won_count", {
          count: stats.totals.nbWon,
        })}
        footerSecondary={translate("crm.analytics.basis.expected_close")}
      />

      <KpiCard
        label={translate("crm.analytics.kpi.win_rate")}
        value={formatAttainment(rate)}
        icon={ListChecks}
        footerPrimary={translate("crm.analytics.kpi.decided", {
          won: stats.totals.nbWon,
          lost: stats.totals.nbLost,
        })}
        // The denominator, stated. A rate over four closed deals is not the
        // same claim as a rate over four hundred.
        footerSecondary={translate("crm.dashboard.kpi.sample", {
          count: decided,
        })}
      />

      <KpiCard
        label={translate("crm.dashboard.kpi.priority_actions")}
        value={String(stats.workload.open)}
        icon={AlertTriangle}
        badge={
          stats.workload.overdue > 0 ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-[0.625rem]">
              {translate("crm.dashboard.kpi.urgent", {
                count: stats.workload.overdue,
              })}
            </Badge>
          ) : undefined
        }
        // Overdue is a SUBSET of open, never a sibling: the footer says "of
        // which", so the two figures are never added together.
        footerPrimary={translate("crm.analytics.kpi.overdue_of_open", {
          count: stats.workload.overdue,
        })}
        footerSecondary={translate("crm.analytics.kpi.due_soon", {
          count: stats.workload.dueNext7d,
        })}
        tone={stats.workload.overdue > 0 ? "alert" : "default"}
      />
    </div>
  );
};
