import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";

import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, bottomLegend, useChartPalette } from "./teamChartTheme";
import type { TaskFlowPoint } from "./taskStats";
import { formatMonthLabel } from "./teamStats";

/**
 * Tasks created against tasks completed, month by month.
 *
 * The comparison is the entire point. Completed on its own says a team is busy;
 * completed next to created says whether the backlog grew while they were busy,
 * and only the second of those is something a manager can act on. A month where
 * the blue bar is taller than the green one is a month the team fell behind,
 * however many tasks they closed.
 *
 * Grouped, not stacked: these are two independent measures of the same month,
 * not two parts of one total, and stacking them would produce a combined height
 * that means nothing.
 */
export const TaskFlowChart = ({
  points,
  title,
}: {
  points: TaskFlowPoint[];
  title: string;
}) => {
  const translate = useTranslate();
  const palette = useChartPalette();

  const completedLabel = translate("crm.teams_dashboard.tasks_completed");
  const createdLabel = translate("crm.teams_dashboard.tasks_created");

  const data = points.map((point) => ({
    month: formatMonthLabel(point.month),
    [completedLabel]: point.completed,
    [createdLabel]: point.created,
  }));

  return (
    <TeamChartCard
      title={title}
      isEmpty={points.length === 0}
      emptyLabel={translate("crm.teams_dashboard.no_tasks")}
    >
      <ResponsiveBar
        data={data}
        indexBy="month"
        keys={[completedLabel, createdLabel]}
        groupMode="grouped"
        colors={[palette.good, palette.inFlight]}
        margin={{ top: 20, right: 20, bottom: 50, left: 50 }}
        {...barDefaults}
        legends={bottomLegend}
      />
    </TeamChartCard>
  );
};
