import type { TeamTaskStat } from "../types";

/**
 * Folding the `team_task_stats` cube into what the drill-down pages chart.
 *
 * The cube is per team, member and month; a team page reads it filtered by team
 * and a member page by team and member, and both fold it here. Kept out of the
 * components for the same reason as `teamStats.ts`: the cases worth testing are
 * the ones a chart hides — a month nobody closed anything in, a member who
 * only appears in half the months, and the difference between "no tasks" and
 * "no data".
 */

/** One month of task flow. */
export type TaskFlowPoint = {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  created: number;
  completed: number;
  completedOnTime: number;
  /** Mean hours from creation to completion, null when nothing closed. */
  avgCycleHours: number | null;
};

/**
 * Created against completed, month by month, oldest first.
 *
 * The comparison is the point. Completed alone says a team is busy; completed
 * next to created says whether the backlog is growing while they are busy,
 * which is the only one of the two a manager can act on.
 *
 * Rows for the same month arrive once per member, so the team page sums them.
 * `avgCycleHours` is re-derived as a weighted mean rather than an average of
 * averages: a member who closed one task in a month would otherwise swing the
 * month as hard as one who closed forty.
 */
export const taskFlowByMonth = (
  stats: TeamTaskStat[] | undefined,
): TaskFlowPoint[] => {
  const byMonth = new Map<
    string,
    TaskFlowPoint & { cycleHoursTotal: number; cycleSampleSize: number }
  >();

  for (const stat of stats ?? []) {
    const point = byMonth.get(stat.month) ?? {
      month: stat.month,
      created: 0,
      completed: 0,
      completedOnTime: 0,
      avgCycleHours: null,
      cycleHoursTotal: 0,
      cycleSampleSize: 0,
    };

    // A month a member closed nothing in carries no cycle time to weight, and
    // must not contribute a zero to the mean.
    const hasCycle = stat.avg_cycle_hours != null && stat.nb_completed > 0;

    byMonth.set(stat.month, {
      ...point,
      created: point.created + stat.nb_created,
      completed: point.completed + stat.nb_completed,
      completedOnTime: point.completedOnTime + stat.nb_completed_on_time,
      cycleHoursTotal:
        point.cycleHoursTotal +
        (hasCycle ? (stat.avg_cycle_hours as number) * stat.nb_completed : 0),
      cycleSampleSize:
        point.cycleSampleSize + (hasCycle ? stat.nb_completed : 0),
    });
  }

  return [...byMonth.values()]
    .map(({ cycleHoursTotal, cycleSampleSize, ...point }) => ({
      ...point,
      avgCycleHours:
        cycleSampleSize > 0
          ? Math.round((cycleHoursTotal / cycleSampleSize) * 10) / 10
          : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

/** Period totals, for the tiles above the chart. */
export type TaskFlowTotals = {
  created: number;
  completed: number;
  completedOnTime: number;
  /** 0..1, null when nothing closed. */
  onTimeRate: number | null;
  /** Weighted mean across the whole period, null when nothing closed. */
  avgCycleHours: number | null;
};

export const taskFlowTotals = (points: TaskFlowPoint[]): TaskFlowTotals => {
  const totals = points.reduce(
    (acc, point) => ({
      created: acc.created + point.created,
      completed: acc.completed + point.completed,
      completedOnTime: acc.completedOnTime + point.completedOnTime,
      cycleHoursTotal:
        acc.cycleHoursTotal +
        (point.avgCycleHours == null
          ? 0
          : point.avgCycleHours * point.completed),
      cycleSampleSize:
        acc.cycleSampleSize +
        (point.avgCycleHours == null ? 0 : point.completed),
    }),
    {
      created: 0,
      completed: 0,
      completedOnTime: 0,
      cycleHoursTotal: 0,
      cycleSampleSize: 0,
    },
  );

  return {
    created: totals.created,
    completed: totals.completed,
    completedOnTime: totals.completedOnTime,
    onTimeRate:
      totals.completed > 0
        ? Math.min(1, totals.completedOnTime / totals.completed)
        : null,
    avgCycleHours:
      totals.cycleSampleSize > 0
        ? Math.round((totals.cycleHoursTotal / totals.cycleSampleSize) * 10) /
          10
        : null,
  };
};

/** `31.4` -> `"31h"`, `56` -> `"2.3d"`, `null` -> an em dash. */
export const formatCycleTime = (hours: number | null) => {
  if (hours == null) return "—";
  return hours < 48 ? `${Math.round(hours)}h` : `${(hours / 24).toFixed(1)}d`;
};
