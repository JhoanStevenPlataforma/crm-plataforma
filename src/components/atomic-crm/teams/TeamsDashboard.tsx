import { BarChart3 } from "lucide-react";
import { useCanAccess, useGetList, useTranslate } from "ra-core";
import { Navigate } from "react-router";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamWorkload } from "../types";
import {
  allocationOf,
  formatAttainment,
  formatMoney,
  sumTeamTotals,
} from "./teamBudget";
import { paceOf, winRate } from "./teamPace";
import { StatTile } from "./TeamStatTile";
import { sumWorkload, workloadByTeam, workloadByTeamId } from "./taskWorkload";
import { TeamsOverviewCharts } from "./TeamsOverviewCharts";
import { TeamsTable } from "./TeamsTable";
import { TEAMS_DASHBOARD_PATH } from "./teamsDashboardPath";

/** Teams fetched in one page. Beyond this the dashboard says so rather than lying. */
const TEAMS_PER_PAGE = 200;

/**
 * Budget against reality, per team, drilling into the roster — the sales
 * manager view.
 *
 * Still ONE request for everything above the table: `teams_summary` carries the
 * money, the member count and the workload counters, so neither the new charts
 * nor the new tiles cost a round trip. A team's roster is still fetched only
 * when that team is expanded.
 *
 * The check below is a usability gate. The real boundary is the RLS on
 * `team_budgets`, which is admin/manager and enforced by Postgres: a rep who
 * types this URL gets a page with no budgets, never figures they were not
 * allowed to read.
 */
export const TeamsDashboard = () => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();

  const { canAccess, isPending: isPendingAccess } = useCanAccess({
    resource: "teams",
    action: "edit",
  });

  const {
    data: teams,
    total,
    isPending,
    error,
  } = useGetList<Team>("teams", {
    sort: { field: "name", order: "ASC" },
    pagination: { page: 1, perPage: TEAMS_PER_PAGE },
  });

  // The second request, and the reason there is one: these counters used to
  // live on `teams_summary`, where they cost that query 330 ms against 35 ms
  // without them (200k tasks) and every other reader of the view paid it too.
  // Fetched in parallel, so the page still waits on one round trip.
  const { data: workloads } = useGetList<TeamWorkload>(
    "team_workload_summary",
    {
      sort: { field: "team_id", order: "ASC" },
      pagination: { page: 1, perPage: TEAMS_PER_PAGE },
    },
  );

  if (isPendingAccess || isPending) return null;
  if (!canAccess) return <Navigate to="/" replace />;

  // Rendering an error as zeroes would report a company with no pipeline and no
  // overdue work, which is a far more alarming screen than an error message.
  if (error) {
    return (
      <p className="text-sm text-destructive mt-4">
        {translate("crm.teams_dashboard.load_error")}
      </p>
    );
  }

  const rows = teams ?? [];
  const totals = sumTeamTotals(rows);
  const workload = sumWorkload(workloadByTeam(rows, workloads));
  // Counted, not inferred from the totals: a company can be comfortably on
  // target overall while two of its teams are behind, and the average hides
  // exactly the teams this screen exists to find.
  const atRisk = rows.filter((team) => paceOf(team).status === "behind").length;
  const isTruncated = total != null && total > rows.length;

  return (
    <div className="flex flex-col gap-6 mt-1">
      <div className="flex items-center gap-3">
        <BarChart3 className="text-muted-foreground w-6 h-6" />
        <h1 className="text-xl font-semibold text-muted-foreground">
          {translate("crm.teams_dashboard.title")}
        </h1>
      </div>

      {/* Silent truncation is the failure mode this replaces: past the page
          size the totals below would quietly stop being totals. */}
      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.teams_dashboard.truncated", {
            shown: rows.length,
            total,
          })}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.teams_dashboard.no_teams")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatTile
          label={translate("crm.teams_dashboard.total_teams")}
          value={String(rows.length)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.total_budget")}
          value={formatMoney(totals.budget, currency)}
        />
        {/* How much of every target is already carved up between members.
            The percentage is the point: a total budget nobody is on the hook
            for individually is the failure this screen exists to surface. */}
        <StatTile
          label={translate("crm.teams_dashboard.total_allocated")}
          value={formatMoney(totals.allocated, currency)}
          hint={formatAttainment(
            allocationOf(totals.budget, totals.allocated).coverage,
          )}
        />
        <StatTile
          label={translate("crm.teams_dashboard.total_pipeline")}
          value={formatMoney(totals.pipeline, currency)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.total_won")}
          value={formatMoney(totals.won, currency)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.attainment")}
          value={formatAttainment(totals.attainment)}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile
          label={translate("crm.teams_dashboard.at_risk")}
          value={String(atRisk)}
          hint={translate("crm.teams_dashboard.at_risk_hint")}
          tone={atRisk > 0 ? "alert" : "default"}
        />
        <StatTile
          label={translate("crm.teams_dashboard.win_rate")}
          value={formatAttainment(winRate(totals.nbWon, totals.nbLost))}
          hint={translate("crm.teams_dashboard.decided_deals", {
            won: totals.nbWon,
            lost: totals.nbLost,
          })}
        />
        <StatTile
          label={translate("crm.teams_dashboard.lost")}
          value={formatMoney(totals.lost, currency)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.tasks_overdue")}
          value={String(workload.overdue)}
          hint={translate("crm.teams_dashboard.tasks_due_soon_hint", {
            count: workload.dueSoon,
          })}
          tone={workload.overdue > 0 ? "alert" : "default"}
        />
        <StatTile
          label={translate("crm.teams_dashboard.tasks_pending")}
          value={String(workload.pending)}
        />
      </div>

      {rows.length > 0 ? (
        <TeamsOverviewCharts teams={rows} workloads={workloads} />
      ) : null}

      <TeamsTable teams={rows} workloadByTeam={workloadByTeamId(workloads)} />
    </div>
  );
};

TeamsDashboard.path = TEAMS_DASHBOARD_PATH;
