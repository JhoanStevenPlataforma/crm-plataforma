import type { TaskFlowStat, TaskStockStat, TaskTypeStat } from "../types";

/**
 * Folds over the task aggregates.
 *
 * Two rules from the task module are load-bearing here and are enforced in this
 * file rather than in each chart:
 *
 *   * "Open" is counted on the columns, never on `task_statuses.is_open`. That
 *     happens in SQL; what happens here is the second half of it — the counter
 *     must equal the list a user lands on when they click the tile.
 *   * `nb_overdue` is a SUBSET of `nb_open`. Anything that stacks the two must
 *     subtract first, or every late task is drawn twice.
 */

export interface WorkloadTotals {
  open: number;
  overdue: number;
  dueNext7d: number;
}

export const stockTotals = (
  stats: TaskStockStat[] | undefined,
): WorkloadTotals =>
  (stats ?? []).reduce(
    (total, row) => ({
      open: total.open + row.nb_open,
      overdue: total.overdue + row.nb_overdue,
      dueNext7d: total.dueNext7d + row.nb_due_next_7d,
    }),
    { open: 0, overdue: 0, dueNext7d: 0 },
  );

/**
 * The part of "open" that is not already late.
 *
 * The only safe way to put open and overdue in the same stack. Exposed as its
 * own function so no chart has to remember the subtraction — the one place it
 * was forgotten, every late task appeared twice and the bar was taller than the
 * team's real workload.
 */
export const openNotOverdue = (totals: WorkloadTotals): number =>
  Math.max(0, totals.open - totals.overdue);

export interface TaskFlowPoint {
  month: string;
  created: number;
  completed: number;
}

/**
 * Created against completed, month by month.
 *
 * The comparison is the point. Completed on its own says a team is busy;
 * completed next to created says whether the backlog grew while they were busy,
 * and only the second is something a manager can act on.
 */
export const taskFlowSeries = (
  stats: TaskFlowStat[] | undefined,
): TaskFlowPoint[] =>
  (stats ?? []).map((row) => ({
    month: row.month,
    created: row.nb_created,
    completed: row.nb_completed,
  }));

export interface TaskPeriodTotals {
  nbCreated: number;
  nbCompleted: number;
  nbCompletedOnTime: number;
  /** Total hours across completed tasks, so the mean divides exactly. */
  cycleHoursTotal: number;
}

export const taskTotals = (
  stats: TaskFlowStat[] | undefined,
): TaskPeriodTotals =>
  (stats ?? []).reduce<TaskPeriodTotals>(
    (total, row) => ({
      nbCreated: total.nbCreated + row.nb_created,
      nbCompleted: total.nbCompleted + row.nb_completed,
      nbCompletedOnTime: total.nbCompletedOnTime + row.nb_completed_on_time,
      // Multiplied back by the month's completed count before summing, so the
      // period mean is a real mean and not an average of averages.
      cycleHoursTotal:
        total.cycleHoursTotal + (row.avg_cycle_hours ?? 0) * row.nb_completed,
    }),
    {
      nbCreated: 0,
      nbCompleted: 0,
      nbCompletedOnTime: 0,
      cycleHoursTotal: 0,
    },
  );

/**
 * Share of completed work that met its due date.
 *
 * The denominator is every completed task, including those with no due date —
 * which the SQL counts as on time for exactly this reason. Excluding them would
 * make numerator and denominator cover different populations, which is how a
 * rate ends up above 100%.
 */
export const onTimeRate = (totals: TaskPeriodTotals): number | null =>
  totals.nbCompleted === 0
    ? null
    : totals.nbCompletedOnTime / totals.nbCompleted;

export const averageCycleHours = (totals: TaskPeriodTotals): number | null =>
  totals.nbCompleted === 0 ? null : totals.cycleHoursTotal / totals.nbCompleted;

export interface TaskTypePoint {
  key: string;
  label: string;
  completed: number;
}

/** Activity mix, busiest type first. */
export const typeSeries = (
  stats: TaskTypeStat[] | undefined,
): TaskTypePoint[] =>
  (stats ?? [])
    .map((row) => ({
      key: row.type_key,
      label: row.type_label || row.type_key,
      completed: row.nb_completed,
    }))
    .sort((a, b) => b.completed - a.completed);

export interface OwnerWorkloadPoint {
  salesId: number;
  name: string;
  /** Already excludes the overdue ones, so the three stack honestly. */
  open: number;
  overdue: number;
  dueNext7d: number;
}

/**
 * Per-owner workload, heaviest first, with the overdue subtraction applied.
 *
 * Truncated like the deal ranking, and the caller reports what it dropped.
 */
export const ownerWorkloadSeries = (
  stats: TaskStockStat[] | undefined,
  limit = 10,
): { points: OwnerWorkloadPoint[]; hidden: number } => {
  const ranked = (stats ?? [])
    .map((row) => ({
      salesId: row.sales_id,
      name: row.owner_name ?? String(row.sales_id),
      open: Math.max(0, row.nb_open - row.nb_overdue),
      overdue: row.nb_overdue,
      dueNext7d: row.nb_due_next_7d,
    }))
    .filter((point) => point.open + point.overdue > 0)
    .sort((a, b) => b.open + b.overdue - (a.open + a.overdue));

  return {
    points: ranked.slice(0, limit),
    hidden: Math.max(0, ranked.length - limit),
  };
};
