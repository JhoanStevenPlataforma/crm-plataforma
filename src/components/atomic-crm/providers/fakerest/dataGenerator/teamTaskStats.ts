import type { TeamTaskStat } from "../../../types";
import type { Db } from "./types";

/**
 * Demo-mode stand-in for the `team_task_stats` view: one row per team, member
 * and month.
 *
 * Mirrors the view's two-date-base union: a task contributes to the month it
 * was CREATED in and, if it closed inside the window, to the month it was
 * COMPLETED in. Those are usually different months, which is the whole reason
 * the chart is worth drawing — a month where more was created than completed is
 * a month the backlog grew.
 *
 * Scoped to the team's budget period with the calendar year as the fallback,
 * exactly like `generateTeamDealStats`, so the two charts on a drill-down page
 * cover the same months.
 *
 * Cycle time is `completed_at - created_at`, the same subtraction the view
 * makes rather than a read of `total_open_seconds`: that counter is
 * trigger-maintained in the real backend and there are no triggers here.
 */
const HOUR_MS = 60 * 60 * 1000;

const calendarYearBounds = () => {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
};

type Accumulator = TeamTaskStat & { cycleHoursTotal: number };

export const generateTeamTaskStats = (db: Db): TeamTaskStat[] => {
  const byKey = new Map<string, Accumulator>();
  const fallback = calendarYearBounds();

  const rowFor = (teamId: number, salesId: number, month: string) => {
    const id = `${teamId}-${salesId}-${month.slice(0, 7)}`;
    return (
      byKey.get(id) ?? {
        id,
        team_id: teamId,
        sales_id: salesId,
        month,
        nb_created: 0,
        nb_completed: 0,
        nb_completed_on_time: 0,
        avg_cycle_hours: null,
        cycleHoursTotal: 0,
      }
    );
  };

  db.team_members.forEach((member) => {
    const budget = db.team_budgets.find((b) => b.team_id === member.team_id);
    const start = budget?.period_start ?? fallback.start;
    const end = budget?.period_end ?? fallback.end;
    const inPeriod = (iso: string) => {
      const day = iso.slice(0, 10);
      return day >= start && day <= end;
    };

    db.tasks
      .filter(
        (task) =>
          task.owner_sales_id === member.sales_id && task.deleted_at == null,
      )
      .forEach((task) => {
        const createdAt = task.created_at;
        if (createdAt && inPeriod(createdAt)) {
          const month = `${createdAt.slice(0, 7)}-01`;
          const row = rowFor(
            member.team_id as number,
            member.sales_id as number,
            month,
          );
          byKey.set(row.id as string, {
            ...row,
            nb_created: row.nb_created + 1,
          });
        }

        const completedAt = task.completed_at;
        if (!completedAt || !inPeriod(completedAt)) return;

        const month = `${completedAt.slice(0, 7)}-01`;
        const row = rowFor(
          member.team_id as number,
          member.sales_id as number,
          month,
        );
        // A task with no due date cannot be late, matching the view.
        const onTime =
          !task.due_date ||
          new Date(completedAt).getTime() <= new Date(task.due_date).getTime();
        const cycleHours = createdAt
          ? (new Date(completedAt).getTime() - new Date(createdAt).getTime()) /
            HOUR_MS
          : 0;

        byKey.set(row.id as string, {
          ...row,
          nb_completed: row.nb_completed + 1,
          nb_completed_on_time: row.nb_completed_on_time + (onTime ? 1 : 0),
          cycleHoursTotal: row.cycleHoursTotal + cycleHours,
        });
      });
  });

  return [...byKey.values()]
    .map(({ cycleHoursTotal, ...row }) => ({
      ...row,
      // Null, not zero, for a month nothing closed in — the same distinction
      // the view draws, and the charts render the two differently.
      avg_cycle_hours:
        row.nb_completed > 0
          ? Math.round((cycleHoursTotal / row.nb_completed) * 10) / 10
          : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};
