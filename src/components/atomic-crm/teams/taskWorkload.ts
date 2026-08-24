import type { Team, TeamMember, TeamWorkload } from "../types";

/**
 * The workload side of the dashboards: what each member is carrying, and how
 * much of it is already late.
 *
 * The one rule this module exists to enforce: **overdue is a subset of open,
 * not a sibling of it**. `nb_open_tasks` counts every task that is still open,
 * late ones included — it has to, because it is a link and the list it opens
 * counts them too. A stacked chart that puts the two side by side therefore
 * draws every late task twice, and the total it displays is not a total of
 * anything. The subtraction happens here, once, where a test can see it.
 */

/** What a stacked workload bar is made of. The three add up to real work. */
export type Workload = {
  /** Open, on time. `nb_open_tasks` minus the overdue ones. */
  pending: number;
  overdue: number;
  completed: number;
  /** Open, due inside the next seven days. A subset of `pending`. */
  dueSoon: number;
};

/**
 * Clamped at zero: the counters are four independent subqueries, so a task
 * completed between two of them can make overdue exceed open by one. Rendering
 * a negative bar out of a race that small would be worse than absorbing it.
 */
const nonNegative = (value: number) => Math.max(0, value);

/**
 * Everything that carries tasks: a team row and a roster row expose the same
 * four counters, so the fold is written once against the shape rather than
 * twice against the two record types.
 */
export type WorkloadSource = {
  nb_open_tasks?: number;
  nb_tasks_overdue?: number;
  nb_tasks_completed?: number;
  nb_tasks_due_next_7d?: number;
};

export const workloadOf = (source: WorkloadSource): Workload => {
  const open = source.nb_open_tasks ?? 0;
  const overdue = Math.min(open, source.nb_tasks_overdue ?? 0);

  return {
    pending: nonNegative(open - overdue),
    overdue,
    completed: source.nb_tasks_completed ?? 0,
    dueSoon: nonNegative(source.nb_tasks_due_next_7d ?? 0),
  };
};

/**
 * Share of completed work that met its due date, 0..1.
 *
 * The denominator is `nb_tasks_completed` and the numerator is the subset of it
 * that was on time — the same window, so the ratio cannot exceed 1. A task with
 * no due date counts as on time in the view, for the same reason: excluding it
 * from one counter but not the other is how a percentage ends up above 100.
 *
 * Null when nothing closed. Zero would read as "everything was late".
 */
export const onTimeRate = (
  completed: number | null | undefined,
  completedOnTime: number | null | undefined,
): number | null => {
  const total = completed ?? 0;
  if (total <= 0) return null;
  return Math.min(1, (completedOnTime ?? 0) / total);
};

/** One bar of the per-member workload chart. */
export type WorkloadPoint = Workload & {
  memberId: TeamMember["id"];
  name: string;
};

/**
 * Members ordered by what is on fire, then by what is merely pending.
 *
 * Not alphabetical: the chart exists to be read from the top, and the person
 * with fourteen late tasks is the reason a manager opened it.
 */
export const workloadByMember = (
  members: TeamMember[] | undefined,
  nameOf: (member: TeamMember) => string,
): WorkloadPoint[] =>
  (members ?? [])
    .map((member) => ({
      memberId: member.id,
      name: nameOf(member),
      ...workloadOf(member),
    }))
    .sort((a, b) => b.overdue - a.overdue || b.pending - a.pending);

/** Team-level workload, for the overview chart. Same shape, same subtraction. */
export type TeamWorkloadPoint = Workload & {
  teamId: Team["id"];
  name: string;
};

/**
 * Workload rows keyed by team, so a table row can look its own up in constant
 * time instead of scanning the list once per team.
 */
export const workloadByTeamId = (
  workloads: TeamWorkload[] | undefined,
): Map<Team["id"], TeamWorkload> =>
  new Map((workloads ?? []).map((workload) => [workload.team_id, workload]));

/**
 * The teams that have a workload row, worst first.
 *
 * Joined here rather than in the query because they are two requests now: the
 * money comes from `teams_summary` and the workload from
 * `team_workload_summary`, which is a separate view precisely so that every
 * other reader of `teams_summary` stops paying for these counters.
 *
 * A team whose workload row has not arrived is left OUT rather than charted at
 * zero — an empty bar would claim the team has nothing to do.
 */
export const workloadByTeam = (
  teams: Team[] | undefined,
  workloads: TeamWorkload[] | undefined,
): TeamWorkloadPoint[] => {
  const byTeam = workloadByTeamId(workloads);

  return (teams ?? [])
    .filter((team) => byTeam.has(team.id))
    .map((team) => ({
      teamId: team.id,
      name: team.name,
      ...workloadOf(byTeam.get(team.id)!),
    }))
    .sort((a, b) => b.overdue - a.overdue || b.pending - a.pending);
};

/** Totals for the summary tiles. Sums the folded values, never the raw ones. */
export const sumWorkload = (points: Workload[]): Workload =>
  points.reduce(
    (acc, point) => ({
      pending: acc.pending + point.pending,
      overdue: acc.overdue + point.overdue,
      completed: acc.completed + point.completed,
      dueSoon: acc.dueSoon + point.dueSoon,
    }),
    { pending: 0, overdue: 0, completed: 0, dueSoon: 0 },
  );
