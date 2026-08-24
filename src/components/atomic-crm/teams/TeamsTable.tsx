import { ChevronRight, ExternalLink, LineChart } from "lucide-react";
import { useTranslate } from "ra-core";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamWorkload } from "../types";
import {
  allocationOf,
  attainmentRatio,
  formatAttainment,
  formatMoney,
} from "./teamBudget";
import { formatGap, paceOf } from "./teamPace";
import { TeamRoster } from "./TeamRoster";
import { workloadOf } from "./taskWorkload";
import { dealsLinkFor } from "./teamsDashboardLinks";
import { teamStatsLinkFor } from "./teamsDashboardPath";

/**
 * The teams table, with the roster it expands into.
 *
 * Split out of `TeamsDashboard` so that file could take the new charts and
 * tiles without passing the repo's ~400-line ceiling.
 *
 * Two columns here are new, and both answer something the money columns cannot:
 * the pace under the attainment bar (45% of target is excellent in March and
 * alarming in November, and the bar alone renders both identically), and the
 * overdue task count, the only figure on the row about the team's capacity
 * rather than its revenue.
 */
export const TeamsTable = ({
  teams,
  workloadByTeam,
}: {
  teams: Team[];
  /** Keyed by team id — the workload comes from its own view, see the dashboard. */
  workloadByTeam: Map<Team["id"], TeamWorkload>;
}) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const [expanded, setExpanded] = useState<Team["id"] | null>(null);

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left font-medium p-3 w-8" />
              <th className="text-left font-medium p-3">
                {translate("resources.teams.fields.name")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("resources.teams.fields.nb_members")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("resources.teams.fields.budget_amount")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("crm.teams_dashboard.allocated")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("resources.teams.fields.pipeline_amount")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("resources.teams.fields.won_amount")}
              </th>
              <th className="text-left font-medium p-3 w-40">
                {translate("crm.teams_dashboard.attainment")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("crm.teams_dashboard.deals")}
              </th>
              <th className="text-right font-medium p-3">
                {translate("crm.teams_dashboard.tasks_overdue")}
              </th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const ratio = attainmentRatio(
                team.won_amount,
                team.budget_amount,
              );
              const allocation = allocationOf(
                team.budget_amount,
                team.allocated_amount,
              );
              const pace = paceOf(team);
              const workload = workloadOf(workloadByTeam.get(team.id) ?? {});
              const isExpanded = expanded === team.id;
              return [
                <tr key={team.id} className="border-b">
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      aria-expanded={isExpanded}
                      aria-label={translate(
                        "crm.teams_dashboard.toggle_roster",
                        { name: team.name },
                      )}
                      onClick={() => setExpanded(isExpanded ? null : team.id)}
                    >
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </Button>
                  </td>
                  <td className="p-3">
                    <Link
                      to={`/teams/${team.id}`}
                      className="font-medium hover:underline"
                    >
                      {team.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {team.budget_period_start
                        ? `${team.budget_period_start} - ${team.budget_period_end}`
                        : translate("crm.teams_dashboard.no_budget")}
                    </p>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {team.nb_members ?? 0}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {team.budget_amount == null
                      ? "-"
                      : formatMoney(team.budget_amount, currency)}
                  </td>
                  {/* Over-allocation is called out here rather than left to the
                      drill-down: it means the team's individual targets already
                      promise more than the team was given, which is not visible
                      in any other figure on this row. */}
                  <td
                    className={`p-3 text-right tabular-nums ${
                      allocation.isOverAllocated ? "text-destructive" : ""
                    }`}
                    title={
                      allocation.isOverAllocated
                        ? translate("crm.teams_dashboard.over_allocated")
                        : undefined
                    }
                  >
                    {formatMoney(allocation.allocated, currency)}
                    <span className="text-xs text-muted-foreground ml-1">
                      {formatAttainment(allocation.coverage)}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatMoney(team.pipeline_amount, currency)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatMoney(team.won_amount, currency)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={Math.min(100, (ratio ?? 0) * 100)}
                        className="h-2"
                      />
                      <span className="text-xs tabular-nums w-10 text-right">
                        {formatAttainment(ratio)}
                      </span>
                    </div>
                    {/* The bar says how much; this says whether that is enough
                        by now. Coloured only when the team is genuinely behind
                        pace, so the colour keeps meaning something. */}
                    {pace.status === "unknown" ? null : (
                      <p
                        className={`text-xs tabular-nums mt-1 ${
                          pace.status === "behind"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                        title={translate("crm.teams_dashboard.period_elapsed", {
                          percent: formatAttainment(pace.elapsed),
                        })}
                      >
                        {formatGap(pace.gap)}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {team.nb_deals ?? 0}
                  </td>
                  <td
                    className={`p-3 text-right tabular-nums ${
                      workload.overdue > 0 ? "text-destructive font-medium" : ""
                    }`}
                  >
                    {workload.overdue}
                    <span className="text-xs text-muted-foreground ml-1">
                      /{workload.pending + workload.overdue}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={teamStatsLinkFor(team.id)}
                        className="text-muted-foreground hover:text-foreground inline-flex"
                        aria-label={translate("crm.teams_dashboard.see_stats", {
                          name: team.name,
                        })}
                      >
                        <LineChart className="h-4 w-4" />
                      </Link>
                      <Link
                        to={dealsLinkFor({ teamId: team.id })}
                        className="text-muted-foreground hover:text-foreground inline-flex"
                        aria-label={translate("crm.teams_dashboard.see_deals", {
                          name: team.name,
                        })}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>,
                isExpanded ? (
                  <tr
                    key={`${team.id}-roster`}
                    className="border-b bg-muted/30"
                  >
                    <td colSpan={11} className="p-3">
                      <TeamRoster team={team} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};
