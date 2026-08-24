import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team, TeamWorkload } from "../types";
import { formatMoney } from "./teamBudget";
import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, bottomLegend, useChartPalette } from "./teamChartTheme";
import { workloadByTeam } from "./taskWorkload";
import { TeamWorkloadChart } from "./TeamWorkloadChart";

/**
 * The two charts above the teams table.
 *
 * Extracted from `TeamsDashboard` because that file was already at 319 lines
 * against the repo's ~400 ceiling, and the rule here is to grow the file COUNT,
 * not the file.
 */

/**
 * Target, pipeline and won, per team.
 *
 * Key order is budget, pipeline, won — gray, blue, green. The gray is a
 * reference mark rather than a category (see `teamChartTheme.ts`), and it is
 * placed first so it never sits next to the green: gray against green is the
 * pair that collapses under deuteranopia, and the palette this replaced had all
 * three bars within one teal step of each other.
 */
const TeamsMoneyChart = ({ teams }: { teams: Team[] }) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const palette = useChartPalette();

  const budgetLabel = translate("resources.teams.fields.budget_amount");
  const pipelineLabel = translate("resources.teams.fields.pipeline_amount");
  const wonLabel = translate("resources.teams.fields.won_amount");

  const data = teams.map((team) => ({
    team: team.name,
    [budgetLabel]: team.budget_amount ?? 0,
    [pipelineLabel]: team.pipeline_amount ?? 0,
    [wonLabel]: team.won_amount ?? 0,
  }));

  return (
    <TeamChartCard
      title={translate("crm.teams_dashboard.money_chart")}
      isEmpty={teams.length === 0}
      height={320}
    >
      <ResponsiveBar
        data={data}
        indexBy="team"
        keys={[budgetLabel, pipelineLabel, wonLabel]}
        groupMode="grouped"
        colors={[palette.reference, palette.inFlight, palette.good]}
        margin={{ top: 20, right: 20, bottom: 50, left: 70 }}
        {...barDefaults}
        enableLabel={false}
        axisLeft={{ format: (value: number) => formatMoney(value, currency) }}
        legends={bottomLegend}
      />
    </TeamChartCard>
  );
};

export const TeamsOverviewCharts = ({
  teams,
  workloads,
}: {
  teams: Team[];
  workloads: TeamWorkload[] | undefined;
}) => {
  const translate = useTranslate();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <TeamsMoneyChart teams={teams} />
      <TeamWorkloadChart
        points={workloadByTeam(teams, workloads)}
        title={translate("crm.teams_dashboard.workload_by_team")}
      />
    </div>
  );
};
