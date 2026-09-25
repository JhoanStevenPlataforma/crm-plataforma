import { CanAccess, useTranslate } from "ra-core";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { cn } from "@/lib/utils";

import { TEAMS_DASHBOARD_PATH } from "../teams/teamsDashboardPath";
import { AnalyticsFilterBar } from "./AnalyticsFilterBar";
import { ANALYTICS_TABS, type AnalyticsTab } from "./analyticsPath";
import { useAnalyticsFilters } from "./useAnalyticsFilters";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";

/**
 * Chrome shared by the four tabs: title, tab bar, filter bar.
 *
 * No access gate. The numbers scope themselves — every aggregate function is
 * SECURITY INVOKER, so a rep sees their own figures and a manager sees the
 * company's, with no branching here. Gating the route would teach reps that the
 * CRM has reporting they are not allowed to open, which is both false and worse
 * than showing them their own.
 */
export const AnalyticsLayout = ({
  tab,
  showTeamFilter = true,
  children,
}: {
  tab: AnalyticsTab;
  showTeamFilter?: boolean;
  children: ReactNode;
}) => {
  const translate = useTranslate();
  const filters = useAnalyticsFilters();
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();

  return (
    <div className="flex flex-col gap-6 mt-1">
      <PageHeader
        className="mb-0"
        title={translate("crm.analytics.title")}
        actions={
          <>
            {/* The team dashboard answers budget-against-reality and is scoped to a
            budget period; this module is company-wide and scoped to the range
            above. They will disagree, legitimately, so the link says which is
            which rather than pretending they are the same screen. */}
            <CanAccess resource="teams" action="edit">
              <Button asChild variant="outline" size="sm">
                <Link to={TEAMS_DASHBOARD_PATH}>
                  {translate("crm.analytics.see_teams_dashboard")}
                </Link>
              </Button>
            </CanAccess>
          </>
        }
      />

      <nav className="flex gap-1 border-b">
        {ANALYTICS_TABS.map((item) => (
          <Link
            key={item.tab}
            // The filters travel with the tab: switching from Pipeline to Leads
            // must not silently reset the period a manager just chose.
            to={query ? `${item.path}?${query}` : item.path}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px",
              item.tab === tab
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {translate(`crm.analytics.tabs.${item.tab}`)}
          </Link>
        ))}
      </nav>

      <AnalyticsFilterBar filters={filters} showTeam={showTeamFilter} />

      {children}
    </div>
  );
};
