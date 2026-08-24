import { ArrowLeft, ExternalLink } from "lucide-react";
import { useCanAccess, useGetList, useGetOne, useTranslate } from "ra-core";
import { Link, Navigate, useParams } from "react-router";

import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamDealStat, TeamTaskStat, TeamWorkload } from "../types";
import {
  allocationOf,
  attainmentRatio,
  formatAttainment,
  formatMoney,
} from "./teamBudget";
import { TeamRoster } from "./TeamRoster";
import { StatTile } from "./TeamStatTile";
import { TeamHealthTiles, TeamWorkloadTiles } from "./TeamHealthTiles";
import { memberContribution } from "./memberContribution";
import { memberNameOf } from "./teamMemberName";
import { taskFlowByMonth } from "./taskStats";
import { workloadByMember } from "./taskWorkload";
import {
  cumulativeAgainstTarget,
  dealFunnel,
  monthlySeries,
  pipelineByStage,
} from "./teamStats";
import {
  MonthlyPerformanceChart,
  StageBreakdownChart,
} from "./TeamStatsCharts";
import { TeamContributionChart } from "./TeamContributionChart";
import { TeamCumulativeChart } from "./TeamCumulativeChart";
import { TeamFunnelChart } from "./TeamFunnelChart";
import { TeamWorkloadChart } from "./TeamWorkloadChart";
import { TaskFlowChart } from "./TaskFlowChart";
import { dealsLinkFor } from "./teamsDashboardLinks";
import { TEAM_STATS_PATH, TEAMS_DASHBOARD_PATH } from "./teamsDashboardPath";
import { useTeamRoster } from "./useTeamRoster";

/**
 * One team, in detail: how the target is split, how the period is going, who is
 * carrying what, and how much of it is late.
 *
 * Four requests. The header comes from `teams_summary` (the same row the
 * dashboard already showed, so the figures cannot disagree between the two
 * screens), the money charts from one read of `team_deal_stats`, the task
 * charts from one read of `team_task_stats`, and the roster from
 * `team_members_summary`. The roster goes through `useTeamRoster`, which the
 * table below shares, so the workload chart costs no extra round trip.
 *
 * The access check mirrors the dashboard's: a usability gate, not the boundary.
 * The boundary is the RLS on `team_budgets` and `team_member_budgets`, which is
 * admin/manager and enforced by Postgres.
 */
export const TeamStatsPage = () => {
  const { teamId } = useParams();
  const translate = useTranslate();
  const { currency, dealPipelineStatuses, dealStages } =
    useConfigurationContext();

  const { canAccess, isPending: isPendingAccess } = useCanAccess({
    resource: "teams",
    action: "edit",
  });

  const {
    data: team,
    isPending,
    error,
  } = useGetOne<Team>("teams", { id: teamId! }, { enabled: teamId != null });

  const { data: stats } = useGetList<TeamDealStat>(
    "team_deal_stats",
    {
      filter: { team_id: teamId },
      sort: { field: "month", order: "ASC" },
      pagination: { page: 1, perPage: 1000 },
    },
    { enabled: teamId != null },
  );

  const { data: taskStats } = useGetList<TeamTaskStat>(
    "team_task_stats",
    {
      filter: { team_id: teamId },
      sort: { field: "month", order: "ASC" },
      pagination: { page: 1, perPage: 1000 },
    },
    { enabled: teamId != null },
  );

  // Keyed on the team id, so the workload report is a `getOne`. It is a
  // separate view on purpose — see `team_workload_summary` — so this is one
  // more parallel request rather than four more columns every reader pays for.
  const { data: workload } = useGetOne<TeamWorkload>(
    "team_workload_summary",
    { id: teamId! },
    { enabled: teamId != null },
  );

  const { data: members } = useTeamRoster(teamId);

  if (isPendingAccess || isPending) return null;
  if (!canAccess) return <Navigate to="/" replace />;
  // A failed load is not a missing team: redirecting on an error would send the
  // manager back to the dashboard with no explanation and nothing to retry.
  if (error) {
    return (
      <p className="text-sm text-destructive mt-4">
        {translate("crm.teams_dashboard.load_error")}
      </p>
    );
  }
  if (!team) return <Navigate to={TEAMS_DASHBOARD_PATH} replace />;

  const allocation = allocationOf(team.budget_amount, team.allocated_amount);
  const attainment = attainmentRatio(team.won_amount, team.budget_amount);
  const months = monthlySeries(stats, dealPipelineStatuses);
  const stageOrder = dealStages.map((stage) => stage.value);

  return (
    <div className="flex flex-col gap-6 mt-1">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link
            to={TEAMS_DASHBOARD_PATH}
            aria-label={translate("crm.teams_dashboard.back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{team.name}</h1>
          <p className="text-xs text-muted-foreground">
            {team.budget_period_start
              ? `${team.budget_period_start} - ${team.budget_period_end}`
              : translate("crm.teams_dashboard.no_budget")}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={dealsLinkFor({ teamId: team.id })}>
            <ExternalLink className="h-4 w-4" />
            {translate("crm.teams_dashboard.deals")}
          </Link>
        </Button>
      </div>

      {/* Three rows rather than one long one: the money, whether the money is
          on track, and the work behind it. Thirteen tiles in a single grid is a
          wall of numbers nobody reads to the end. */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatTile
          label={translate("resources.teams.fields.budget_amount")}
          value={
            team.budget_amount == null
              ? "—"
              : formatMoney(team.budget_amount, currency)
          }
        />
        <StatTile
          label={translate("crm.teams_dashboard.allocated")}
          value={formatMoney(allocation.allocated, currency)}
          hint={formatAttainment(allocation.coverage)}
        />
        <StatTile
          label={
            allocation.isOverAllocated
              ? translate("crm.teams_dashboard.over_allocated")
              : translate("crm.teams_dashboard.unallocated")
          }
          value={
            allocation.remaining == null
              ? "—"
              : formatMoney(Math.abs(allocation.remaining), currency)
          }
          tone={allocation.isOverAllocated ? "alert" : "default"}
        />
        <StatTile
          label={translate("resources.teams.fields.won_amount")}
          value={formatMoney(team.won_amount, currency)}
        />
        <StatTile
          label={translate("resources.teams.fields.pipeline_amount")}
          value={formatMoney(team.pipeline_amount, currency)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.attainment")}
          value={formatAttainment(attainment)}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <TeamHealthTiles team={team} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <TeamWorkloadTiles source={workload ?? {}} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MonthlyPerformanceChart
          points={months}
          title={translate("crm.teams_dashboard.monthly")}
        />
        <TeamCumulativeChart
          points={cumulativeAgainstTarget(months, team.budget_amount)}
          title={translate("crm.teams_dashboard.cumulative")}
        />
        <StageBreakdownChart
          points={pipelineByStage(stats, dealPipelineStatuses)}
          title={translate("crm.teams_dashboard.by_stage")}
        />
        <TeamFunnelChart
          points={dealFunnel(stats, stageOrder)}
          title={translate("crm.teams_dashboard.funnel")}
        />
        <TeamContributionChart
          points={memberContribution(members, memberNameOf)}
          title={translate("crm.teams_dashboard.contribution_chart")}
        />
        <TeamWorkloadChart
          points={workloadByMember(members, memberNameOf)}
          title={translate("crm.teams_dashboard.workload")}
        />
        <TaskFlowChart
          points={taskFlowByMonth(taskStats)}
          title={translate("crm.teams_dashboard.task_flow")}
        />
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">
          {translate("resources.teams.members.title")}
        </h2>
        <TeamRoster team={team} />
      </div>
    </div>
  );
};

TeamStatsPage.path = TEAM_STATS_PATH;
