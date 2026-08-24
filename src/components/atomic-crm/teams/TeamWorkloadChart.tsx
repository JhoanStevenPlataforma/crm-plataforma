import { ResponsiveBar } from "@nivo/bar";
import { useTranslate } from "ra-core";

import { TeamChartCard } from "./TeamChartCard";
import { barDefaults, bottomLegend, useChartPalette } from "./teamChartTheme";
import type { Workload } from "./taskWorkload";

/**
 * What each row is carrying, and how much of it is already late.
 *
 * Stacked rather than grouped: the three segments are parts of one person's
 * workload, and the height of the whole bar is the thing being compared between
 * people. Grouped bars would answer "who completed most", which is a different
 * and much less useful question than "who is drowning".
 *
 * The stack order is green, blue, red and is NOT arbitrary — see
 * `teamChartTheme.ts`. Blue sits between the other two because green against
 * red is the deuteranopia collision.
 *
 * Horizontal, because these are names: a vertical bar chart with fifteen
 * rotated member names is unreadable, and the sort already puts the answer at
 * the top.
 */
export const TeamWorkloadChart = ({
  points,
  title,
}: {
  points: Array<Workload & { name: string }>;
  title: string;
}) => {
  const translate = useTranslate();
  const palette = useChartPalette();

  const data = points
    // Nivo draws the first row at the BOTTOM of a horizontal chart, so the sort
    // is reversed here to keep the worst case at the top where it was sorted to.
    .slice()
    .reverse()
    .map((point) => ({
      name: point.name,
      [translate("crm.teams_dashboard.tasks_completed")]: point.completed,
      [translate("crm.teams_dashboard.tasks_pending")]: point.pending,
      [translate("crm.teams_dashboard.tasks_overdue")]: point.overdue,
    }));

  const keys = [
    translate("crm.teams_dashboard.tasks_completed"),
    translate("crm.teams_dashboard.tasks_pending"),
    translate("crm.teams_dashboard.tasks_overdue"),
  ];

  return (
    <TeamChartCard
      title={title}
      isEmpty={points.length === 0}
      emptyLabel={translate("crm.teams_dashboard.no_tasks")}
      height={Math.max(220, points.length * 38 + 70)}
    >
      <ResponsiveBar
        data={data}
        indexBy="name"
        keys={keys}
        layout="horizontal"
        colors={[palette.good, palette.inFlight, palette.bad]}
        margin={{ top: 10, right: 20, bottom: 50, left: 150 }}
        {...barDefaults}
        legends={bottomLegend}
      />
    </TeamChartCard>
  );
};
