import { useTranslate } from "ra-core";

import { StatTile } from "../misc/StatTile";
import {
  formatAttainment,
  formatMonthLabel,
  formatMoney,
} from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { LeadBreakdownStat, LeadFlowStat } from "../types";
import { AnalyticsLayout } from "./AnalyticsLayout";
import { rangeParams } from "./analyticsFilters";
import { ANALYTICS_LEADS_PATH } from "./analyticsPath";
import { labelOf } from "./labels";
import {
  attributableShare,
  averageConversionDays,
  bucketsOf,
  conversionRate,
  leadFlowSeries,
  leadTotals,
  revenueBySource,
} from "./leadAnalytics";
import { SeriesBarChart } from "./SeriesBarChart";
import { UntouchedLeadsTable } from "./UntouchedLeadsTable";
import { useAnalyticsFilters } from "./useAnalyticsFilters";
import { useAnalyticsQuery } from "./useAnalyticsQuery";

/**
 * Where do prospects come from, how many become customers, and how long does
 * that take?
 *
 * Two calls: the monthly cohort and the three breakdowns. The breakdowns travel
 * together on purpose — source, status and owner all describe the SAME cohort,
 * so computing them in one query is what makes them reconcile instead of
 * disagreeing because a lead arrived between two requests.
 *
 * Every rate here is cohort-based: the denominator is the leads that ARRIVED in
 * the period. The most recent months therefore look worse than they will, since
 * their leads have not had time to convert — a cohort still filling in is not a
 * decline, and the subtitle says so.
 */
export const AnalyticsLeads = () => {
  const translate = useTranslate();
  const { currency, leadSources, leadStatuses } = useConfigurationContext();
  const filters = useAnalyticsFilters();
  const range = rangeParams(filters);

  const flow = useAnalyticsQuery<LeadFlowStat>("lead_flow_stats", {
    ...range,
    p_sales_id: filters.salesId,
  });
  const breakdown = useAnalyticsQuery<LeadBreakdownStat>(
    "lead_breakdown_stats",
    { ...range, p_sales_id: filters.salesId },
  );

  const failed = flow.error || breakdown.error ? true : false;

  const totals = leadTotals(flow.data);
  const days = averageConversionDays(totals);
  const attributable = attributableShare(breakdown.data);

  const createdLabel = translate("crm.analytics.series.created");
  const convertedLabel = translate("crm.analytics.series.converted");
  const leadsLabel = translate("crm.analytics.series.leads");
  const rateLabel = translate("crm.analytics.series.rate");
  const wonLabel = translate("crm.analytics.series.won");

  return (
    <AnalyticsLayout tab="leads" showTeamFilter={false}>
      {failed ? (
        <p className="text-sm text-destructive">
          {translate("crm.analytics.load_error")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label={translate("crm.analytics.kpi.new_leads")}
          value={String(totals.nbCreated)}
          hint={translate("crm.analytics.basis.lead_created")}
        />
        <StatTile
          label={translate("crm.analytics.kpi.converted")}
          value={String(totals.nbConverted)}
        />
        <StatTile
          label={translate("crm.analytics.kpi.lead_conversion")}
          value={formatAttainment(
            conversionRate(totals.nbCreated, totals.nbConverted),
          )}
          hint={translate("crm.analytics.basis.cohort")}
        />
        <StatTile
          label={translate("crm.analytics.kpi.time_to_convert")}
          value={
            days == null
              ? "—"
              : translate("crm.analytics.kpi.days", {
                  count: Math.round(days),
                })
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SeriesBarChart
          title={translate("crm.analytics.chart.lead_flow")}
          subtitle={translate("crm.analytics.basis.cohort_month")}
          rows={leadFlowSeries(flow.data).map((point) => ({
            label: formatMonthLabel(point.month),
            values: { converted: point.converted, created: point.created },
          }))}
          series={[
            { key: "converted", label: convertedLabel, role: "good" },
            { key: "created", label: createdLabel, role: "inFlight" },
          ]}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.leads_by_status")}
          subtitle={translate("crm.analytics.basis.lead_created")}
          layout="horizontal"
          rows={bucketsOf(breakdown.data, "status").map((point) => ({
            // `converted` is written by `convert_lead()` and is absent from the
            // configured list, so `labelOf` falls back to the key rather than
            // dropping the biggest bucket on the chart.
            label: labelOf(leadStatuses, point.bucket),
            values: { leads: point.nbLeads },
          }))}
          series={[{ key: "leads", label: leadsLabel, role: "inFlight" }]}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.leads_by_source")}
          subtitle={translate("crm.analytics.basis.lead_created")}
          rows={bucketsOf(breakdown.data, "source").map((point) => ({
            label: labelOf(leadSources, point.bucket),
            values: { leads: point.nbLeads, converted: point.nbConverted },
          }))}
          series={[
            { key: "converted", label: convertedLabel, role: "good" },
            { key: "leads", label: leadsLabel, role: "inFlight" },
          ]}
        />
        <SeriesBarChart
          title={translate("crm.analytics.chart.conversion_by_source")}
          subtitle={translate("crm.analytics.basis.cohort")}
          rows={bucketsOf(breakdown.data, "source").map((point) => ({
            label: labelOf(leadSources, point.bucket),
            values: { rate: Math.round((point.conversionRate ?? 0) * 100) },
          }))}
          series={[{ key: "rate", label: rateLabel, role: "good" }]}
          formatValue={(value) => `${value}%`}
        />
        <div className="lg:col-span-2">
          <SeriesBarChart
            title={translate("crm.analytics.chart.revenue_by_source")}
            // The share is not a footnote. `deals` has no source column, so
            // attribution runs only through `leads.converted_deal_id`: a deal
            // typed straight into the kanban has no origin at all. Without this
            // line the chart reads as the whole business.
            subtitle={
              attributable == null
                ? translate("crm.analytics.basis.attribution_none")
                : translate("crm.analytics.basis.attribution", {
                    share: formatAttainment(attributable),
                  })
            }
            rows={revenueBySource(breakdown.data).map((point) => ({
              label: labelOf(leadSources, point.bucket),
              values: { won: point.wonAmount },
            }))}
            series={[{ key: "won", label: wonLabel, role: "good" }]}
            formatValue={(value) => formatMoney(value, currency)}
          />
        </div>
      </div>

      <SeriesBarChart
        title={translate("crm.analytics.chart.leads_by_owner")}
        subtitle={translate("crm.analytics.basis.cohort")}
        layout="horizontal"
        rows={bucketsOf(breakdown.data, "owner").map((point) => ({
          label: point.bucket,
          values: { converted: point.nbConverted, leads: point.nbLeads },
        }))}
        series={[
          { key: "converted", label: convertedLabel, role: "good" },
          { key: "leads", label: leadsLabel, role: "inFlight" },
        ]}
        height={320}
      />

      <UntouchedLeadsTable salesId={filters.salesId} />
    </AnalyticsLayout>
  );
};

AnalyticsLeads.path = ANALYTICS_LEADS_PATH;
