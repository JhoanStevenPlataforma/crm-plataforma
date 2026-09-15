import { useGetList, useTranslate } from "ra-core";
import { useSearchParams } from "react-router";

import { ActivityLog } from "../activity/ActivityLog";
import { flowSeries } from "../analytics/dealAnalytics";
import { SeriesBarChart } from "../analytics/SeriesBarChart";
import { formatMoney, formatMonthLabel } from "../misc/reporting";
import { SectionCard } from "../misc/SectionCard";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, ContactNote } from "../types";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardKpis } from "./DashboardKpis";
import { DashboardStepper } from "./DashboardStepper";
import {
  DASHBOARD_PERIOD_PARAM,
  parseDashboardPeriod,
  type DashboardPeriod,
} from "./dashboardPeriod";
import { HotContacts } from "./HotContacts";
import { TasksList } from "./TasksList";
import { useDashboardStats } from "./useDashboardStats";
import { Welcome } from "./Welcome";

/**
 * The commercial state of the business, at a glance.
 *
 * Reads top to bottom the way the question is asked: who am I and over what
 * period, then the four figures, then how they got there, then what to do next.
 * The KPI row is what the period control drives. The revenue chart, the
 * activity feed, the hot contacts and the task list do not follow it — each for
 * its own reason, and each says so in its own caption. A panel that quietly
 * ignores the filter above it is how a dashboard loses its reader's trust.
 *
 * The period lives in the query string so the screen is shareable and survives
 * a reload. See `dashboardPeriod.ts` for why the NAME is stored rather than the
 * resolved dates.
 */
export const Dashboard = () => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const period = parseDashboardPeriod(searchParams.get(DASHBOARD_PERIOD_PARAM));

  const setPeriod = (next: DashboardPeriod) => {
    const params = new URLSearchParams(searchParams);
    params.set(DASHBOARD_PERIOD_PARAM, next);
    // `replace` so flicking between periods does not fill the back button with
    // states the reader has to click through to leave the dashboard.
    setSearchParams(params, { replace: true });
  };

  // The onboarding gate. Two counts, not three: the deals total used to exist
  // only to decide whether to render the revenue chart, and that chart now
  // shows its own empty state.
  const {
    data: contactData,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", { pagination: { page: 1, perPage: 1 } });
  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });

  const stats = useDashboardStats(period);

  if (isPendingContact || isPendingContactNotes) return null;
  if (!totalContact) return <DashboardStepper step={1} />;
  if (!totalContactNotes)
    return <DashboardStepper step={2} contactId={contactData?.[0]?.id} />;

  const summary = stats.isPending
    ? undefined
    : translate(
        stats.workload.overdue > 0
          ? "crm.dashboard.summary_with_overdue"
          : "crm.dashboard.summary",
        {
          pipeline: formatMoney(stats.pipeline.amount, currency),
          deals: stats.pipeline.nbDeals,
          overdue: stats.workload.overdue,
        },
      );

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        period={period}
        onPeriodChange={setPeriod}
        summary={summary}
      />

      {/* An error rendered as zeroes reports a business with no pipeline and
          nothing overdue, which is far more alarming than an error message. */}
      {stats.failed ? (
        <p className="text-sm text-destructive">
          {translate("crm.analytics.load_error")}
        </p>
      ) : null}

      <DashboardKpis stats={stats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left: how the money moved, then how it moved. Right: who to call
            and what is owed. The split is the reading order of the screen —
            evidence on the left, the next action on the right. */}
        <div className="flex flex-col gap-4 xl:col-span-2">
          <SeriesBarChart
            title={translate("crm.dashboard.deals_chart")}
            // Two things the caption has to admit: the chart covers a
            // fixed trailing window rather than the selected period, and
            // its three series are measured on two different dates.
            subtitle={translate("crm.dashboard.trend_basis")}
            rows={flowSeries(stats.trend).map((point) => ({
              label: formatMonthLabel(point.month),
              values: {
                won: point.wonAmount,
                created: point.createdAmount,
                lost: point.lostAmount,
              },
            }))}
            series={[
              {
                key: "won",
                label: translate("crm.analytics.series.won"),
                role: "good",
              },
              {
                key: "created",
                label: translate("crm.analytics.series.created"),
                role: "inFlight",
              },
              {
                key: "lost",
                label: translate("crm.analytics.series.lost"),
                role: "bad",
              },
            ]}
            formatValue={(value) => formatMoney(value, currency)}
          />

          <SectionCard
            title={translate("crm.dashboard.latest_activity")}
            // This feed reads `activity_log`, which takes no period filter, so
            // it is NOT scoped by the control above. Saying so is the
            // difference between a caption and a misleading screen.
            subtitle={translate("crm.analytics.basis.unfiltered")}
          >
            <ActivityLog pageSize={10} />
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <HotContacts />
          <TasksList />
        </div>
      </div>

      {import.meta.env.VITE_IS_DEMO === "true" ? <Welcome /> : null}
    </div>
  );
};
