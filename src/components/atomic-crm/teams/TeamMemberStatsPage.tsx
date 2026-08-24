import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  useCanAccess,
  useGetList,
  useGetOne,
  useTranslate,
  type Identifier,
} from "ra-core";
import { Link, Navigate, useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamDealStat, TeamMember, TeamTaskStat } from "../types";
import { attainmentRatio, formatAttainment, formatMoney } from "./teamBudget";
import { memberNameOf } from "./teamMemberName";
import { StatTile } from "./TeamStatTile";
import { TeamWorkloadTiles } from "./TeamHealthTiles";
import { formatCycleTime, taskFlowByMonth, taskFlowTotals } from "./taskStats";
import {
  cumulativeAgainstTarget,
  monthlySeries,
  pipelineByStage,
} from "./teamStats";
import {
  MonthlyPerformanceChart,
  StageBreakdownChart,
} from "./TeamStatsCharts";
import { TeamCumulativeChart } from "./TeamCumulativeChart";
import { TaskFlowChart } from "./TaskFlowChart";
import { contactsLinkFor, dealsLinkFor } from "./teamsDashboardLinks";
import {
  TEAM_MEMBER_STATS_PATH,
  TEAMS_DASHBOARD_PATH,
  teamStatsLinkFor,
} from "./teamsDashboardPath";

/**
 * One member of one team, in detail.
 *
 * Keyed on the membership rather than on the person, because every figure here
 * is team-scoped: the same rep rostered in two teams has two quotas, two won
 * amounts and two attainments, and a page keyed on the person could only show
 * one of them without saying which.
 *
 * `attainment` is against the member's OWN quota now that there is one, which
 * is the number a rep is actually held to. Their share of the team target is
 * kept as a hint on the same tile — it answers a different question ("how much
 * of the team rides on this person") and losing it would make a team of one
 * indistinguishable from a team of ten.
 */
export const TeamMemberStatsPage = () => {
  const { memberId } = useParams();
  const translate = useTranslate();
  const { currency, dealPipelineStatuses } = useConfigurationContext();

  const { canAccess, isPending: isPendingAccess } = useCanAccess({
    resource: "teams",
    action: "edit",
  });

  const { data: member, isPending } = useGetOne<TeamMember>(
    "team_members",
    { id: memberId! },
    { enabled: memberId != null },
  );

  const { data: team } = useGetOne<Team>(
    "teams",
    { id: member?.team_id as Identifier },
    { enabled: member?.team_id != null },
  );

  const { data: stats } = useGetList<TeamDealStat>(
    "team_deal_stats",
    {
      filter: { team_id: member?.team_id, sales_id: member?.sales_id },
      sort: { field: "month", order: "ASC" },
      pagination: { page: 1, perPage: 1000 },
    },
    { enabled: member != null },
  );

  // The task cube, scoped exactly like the deal cube above so the two charts
  // cover the same months and can be read against each other.
  const { data: taskStats } = useGetList<TeamTaskStat>(
    "team_task_stats",
    {
      filter: { team_id: member?.team_id, sales_id: member?.sales_id },
      sort: { field: "month", order: "ASC" },
      pagination: { page: 1, perPage: 1000 },
    },
    { enabled: member != null },
  );

  if (isPendingAccess || isPending) return null;
  if (!canAccess) return <Navigate to="/" replace />;
  if (!member) return <Navigate to={TEAMS_DASHBOARD_PATH} replace />;

  const attainment = attainmentRatio(member.won_amount, member.budget_amount);
  const share = attainmentRatio(member.budget_amount, team?.budget_amount);
  const outsideTeam = (member.nb_deals_all ?? 0) - (member.nb_deals ?? 0);
  const months = monthlySeries(stats, dealPipelineStatuses);
  const taskFlow = taskFlowByMonth(taskStats);
  const taskTotals = taskFlowTotals(taskFlow);

  return (
    <div className="flex flex-col gap-6 mt-1">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link
            to={teamStatsLinkFor(member.team_id)}
            aria-label={translate("crm.teams_dashboard.back")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{memberNameOf(member)}</h1>
            {member.role && member.role !== "rep" ? (
              <Badge variant="secondary">{member.role}</Badge>
            ) : null}
            {member.disabled ? (
              <Badge variant="outline">
                {translate("crm.teams_dashboard.disabled")}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {team?.name}
            {team?.budget_period_start
              ? ` · ${team.budget_period_start} - ${team.budget_period_end}`
              : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link
            to={dealsLinkFor({
              teamId: member.team_id,
              salesId: member.sales_id,
            })}
          >
            <ExternalLink className="h-4 w-4" />
            {translate("crm.teams_dashboard.deals")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label={translate("crm.teams_dashboard.quota")}
          value={
            member.budget_amount == null
              ? "—"
              : formatMoney(member.budget_amount, currency)
          }
          hint={
            share == null
              ? undefined
              : translate("crm.teams_dashboard.share_of_team", {
                  share: formatAttainment(share),
                })
          }
        />
        <StatTile
          label={translate("resources.teams.fields.won_amount")}
          value={formatMoney(member.won_amount, currency)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.attainment")}
          value={formatAttainment(attainment)}
        />
        <StatTile
          label={translate("resources.teams.fields.pipeline_amount")}
          value={formatMoney(member.pipeline_amount, currency)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.deals")}
          value={String(member.nb_deals ?? 0)}
          hint={
            outsideTeam > 0
              ? translate("crm.teams_dashboard.outside_team", {
                  count: outsideTeam,
                })
              : undefined
          }
        />
        <StatTile
          label={translate("crm.teams_dashboard.contacts")}
          value={String(member.nb_contacts ?? 0)}
        />
        <StatTile
          label={translate("crm.teams_dashboard.companies")}
          value={String(member.nb_companies ?? 0)}
        />
      </div>

      {/* The workload row. Separate from the money row above because it answers
          a different question and is scoped differently: tasks follow the
          person, not the team's budget period. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <TeamWorkloadTiles source={member} />
        <StatTile
          label={translate("crm.teams_dashboard.cycle_time")}
          value={formatCycleTime(taskTotals.avgCycleHours)}
          hint={translate("crm.teams_dashboard.cycle_time_hint")}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MonthlyPerformanceChart
          points={months}
          title={translate("crm.teams_dashboard.monthly")}
        />
        <TeamCumulativeChart
          points={cumulativeAgainstTarget(months, member.budget_amount)}
          title={translate("crm.teams_dashboard.cumulative")}
        />
        <StageBreakdownChart
          points={pipelineByStage(stats, dealPipelineStatuses)}
          title={translate("crm.teams_dashboard.by_stage")}
        />
        <TaskFlowChart
          points={taskFlow}
          title={translate("crm.teams_dashboard.task_flow")}
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to={contactsLinkFor(member.sales_id)}>
            {translate("crm.teams_dashboard.see_contacts")}
          </Link>
        </Button>
      </div>
    </div>
  );
};

TeamMemberStatsPage.path = TEAM_MEMBER_STATS_PATH;
