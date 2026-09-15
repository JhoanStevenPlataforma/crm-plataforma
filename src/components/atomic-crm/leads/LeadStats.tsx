import { Flame, Sparkles, PhoneCall, TrendingUp } from "lucide-react";
import { useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { rangeForPreset } from "../analytics/analyticsFilters";
import {
  averageConversionDays,
  bucketsOf,
  conversionRate,
  leadTotals,
} from "../analytics/leadAnalytics";
import { useAnalyticsQuery } from "../analytics/useAnalyticsQuery";
import { KpiCard } from "../misc/KpiCard";
import { formatAttainment } from "../misc/reporting";
import type { LeadBreakdownStat, LeadFlowStat } from "../types";

/**
 * How the funnel is filling, above the list that works it.
 *
 * Three counts and a rate. The counts are the top three stages, each with the
 * share of the cohort it holds, because "3 new leads" means something different
 * in a cohort of 10 than in one of 300 — the bar is that denominator, drawn.
 *
 * The cohort is the last twelve months of arrivals, stated in the caption
 * below the row. It is NOT the list underneath: the list is filtered, sorted
 * and paginated by whoever is working it, and a header that moved with every
 * filter would stop being a baseline to compare against. Two aggregates, in
 * parallel, cached by `useAnalyticsQuery` alongside the Analytics tab's copies.
 *
 * Statuses beyond the four defaults are counted in the total but get no card:
 * an installation can add stages, and inventing a tile per stage would push the
 * rate off the row, which is the figure the other three exist to explain.
 */
const COHORT_PRESET = "last_12_months" as const;

export const LeadStats = () => {
  const translate = useTranslate();
  const range = rangeForPreset(COHORT_PRESET);
  const params = { p_from: range.from, p_to: range.to, p_sales_id: null };

  const breakdown = useAnalyticsQuery<LeadBreakdownStat>(
    "lead_breakdown_stats",
    params,
  );
  const flow = useAnalyticsQuery<LeadFlowStat>("lead_flow_stats", params);

  if (breakdown.isPending || flow.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-33 rounded-lg" />
        ))}
      </div>
    );
  }

  // Rendering an error as zeroes would report a funnel with no leads in it,
  // which is a far more alarming screen than an error message.
  if (breakdown.error || flow.error) {
    return (
      <p className="text-sm text-destructive">
        {translate("crm.analytics.load_error")}
      </p>
    );
  }

  const byStatus = bucketsOf(breakdown.data, "status");
  const total = byStatus.reduce((sum, row) => sum + row.nbLeads, 0);
  const countOf = (status: string) =>
    byStatus.find((row) => row.bucket === status)?.nbLeads ?? 0;
  // Null, not zero: with no leads at all there is no share to draw, and a bar
  // pinned at 0% claims the stage is empty rather than the cohort.
  const shareOf = (count: number) => (total === 0 ? null : count / total);

  const totals = leadTotals(flow.data);
  const rate = conversionRate(totals.nbCreated, totals.nbConverted);
  const cycleDays = averageConversionDays(totals);

  const card = (
    status: string,
    labelKey: string,
    icon: typeof Sparkles,
    hintKey: string,
  ) => {
    const count = countOf(status);
    const share = shareOf(count);
    return (
      <KpiCard
        key={status}
        label={translate(labelKey)}
        value={String(count)}
        icon={icon}
        // What the stage MEANS sits beside its name, where it qualifies the
        // label; the footer is for the arithmetic behind the number.
        badge={
          <Badge variant="secondary" className="font-normal">
            {translate(hintKey)}
          </Badge>
        }
        progress={share}
        footerPrimary={
          share == null
            ? undefined
            : translate("crm.leads.stats.share", {
                share: formatAttainment(share),
              })
        }
        footerSecondary={translate("crm.leads.stats.of_cohort", {
          total,
        })}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {card(
          "new",
          "crm.leads.stats.new",
          Sparkles,
          "crm.leads.stats.new_hint",
        )}
        {card(
          "contacted",
          "crm.leads.stats.contacted",
          PhoneCall,
          "crm.leads.stats.contacted_hint",
        )}
        {card(
          "qualified",
          "crm.leads.stats.qualified",
          Flame,
          "crm.leads.stats.qualified_hint",
        )}

        <KpiCard
          label={translate("crm.analytics.kpi.lead_conversion")}
          value={formatAttainment(rate)}
          icon={TrendingUp}
          progress={rate}
          footerPrimary={translate("crm.leads.stats.converted_of", {
            converted: totals.nbConverted,
            created: totals.nbCreated,
          })}
          footerSecondary={
            cycleDays == null
              ? undefined
              : translate("crm.leads.stats.cycle", {
                  count: Math.round(cycleDays),
                })
          }
        />
      </div>

      {/* The basis, once for the row. Without it these four numbers look like
          they describe the list below, which is filtered and paginated. */}
      <p className="text-xs text-muted-foreground">
        {translate("crm.leads.stats.basis")}
      </p>
    </div>
  );
};
