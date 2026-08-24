import type { TeamDealStat } from "../types";

/**
 * Folding the `team_deal_stats` cube into the two shapes the drill-down pages
 * chart.
 *
 * The view returns one row per team, member, month and stage; both pages read
 * it once and fold it here, rather than asking the database the same question
 * twice. Kept out of the components because the edge cases worth testing are
 * exactly the ones a chart hides: a month with no deals, a stage that only
 * appears for one member, and the difference between "nothing won" and "no
 * data".
 */

/**
 * The stage a lost deal sits in.
 *
 * A literal here for the same reason `won` is a literal in the views: it is the
 * value `defaultDealStages` ships, and renaming it in the app configuration
 * means revisiting both. Kept out of `wonStages` because losing is not a
 * pipeline status, it is the other terminal state.
 */
export const LOST_STAGE = "lost";

/** One month of a team's or a member's period. */
export type MonthlyPoint = {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  won: number;
  /** Still open. Excludes lost, exactly as `teams_summary.pipeline_amount` does. */
  pipeline: number;
  lost: number;
  nbDeals: number;
};

/** One stage of the pipeline, across the whole period. */
export type StagePoint = {
  stage: string;
  amount: number;
  nbDeals: number;
};

const isWon = (stat: TeamDealStat, wonStages: string[]) =>
  wonStages.includes(stat.stage);

const isLost = (stat: TeamDealStat) => stat.stage === LOST_STAGE;

/**
 * Won, still-open and lost amounts per month, oldest first.
 *
 * Lost used to fall into `pipeline` (anything that was not won did), which both
 * inflated the forecast and hid the losses completely. It gets its own series
 * now, matching the `stage not in ('won', 'lost')` the views use, so the chart
 * and the tiles above it report the same pipeline.
 *
 * Only months the period actually produced deals in appear. Padding the gaps
 * with zeroes would draw a flat line through months nobody has closed yet,
 * which reads as a run of failures rather than as a period still in progress.
 */
export const monthlySeries = (
  stats: TeamDealStat[] | undefined,
  wonStages: string[],
): MonthlyPoint[] => {
  const byMonth = new Map<string, MonthlyPoint>();

  for (const stat of stats ?? []) {
    const point = byMonth.get(stat.month) ?? {
      month: stat.month,
      won: 0,
      pipeline: 0,
      lost: 0,
      nbDeals: 0,
    };
    const won = isWon(stat, wonStages);
    const lost = !won && isLost(stat);
    byMonth.set(stat.month, {
      ...point,
      won: point.won + (won ? stat.amount : 0),
      pipeline: point.pipeline + (won || lost ? 0 : stat.amount),
      lost: point.lost + (lost ? stat.amount : 0),
      nbDeals: point.nbDeals + stat.nb_deals,
    });
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
};

/**
 * Won so far, accumulated month by month, against the target.
 *
 * The question the monthly bars cannot answer: a run of good months still
 * misses the number if there were not enough of them.
 *
 * `target` is the same flat value on every point because the budget is not
 * phased by month anywhere in the schema. That is exactly why it belongs beside
 * a CUMULATIVE series and not beside the monthly one, where a flat line would
 * imply a monthly quota nobody ever set. Null when there is no budget, so the
 * chart drops the reference instead of drawing it at zero.
 */
export type CumulativePoint = {
  month: string;
  wonToDate: number;
  target: number | null;
};

export const cumulativeAgainstTarget = (
  points: MonthlyPoint[],
  budgetAmount: number | null | undefined,
): CumulativePoint[] => {
  const target =
    budgetAmount == null || budgetAmount <= 0 ? null : budgetAmount;
  let running = 0;

  return points.map((point) => {
    running += point.won;
    return { month: point.month, wonToDate: running, target };
  });
};

/**
 * Amount and count per stage, largest first, every stage included.
 *
 * This is the raw distribution the funnel reads. The pipeline chart uses
 * `pipelineByStage` below, which drops the terminal stages so it reconciles
 * with the pipeline figure printed above it.
 */
export const stageBreakdown = (
  stats: TeamDealStat[] | undefined,
): StagePoint[] => {
  const byStage = new Map<string, StagePoint>();

  for (const stat of stats ?? []) {
    const point = byStage.get(stat.stage) ?? {
      stage: stat.stage,
      amount: 0,
      nbDeals: 0,
    };
    byStage.set(stat.stage, {
      ...point,
      amount: point.amount + stat.amount,
      nbDeals: point.nbDeals + stat.nb_deals,
    });
  }

  return [...byStage.values()].sort((a, b) => b.amount - a.amount);
};

/**
 * The stages still in play, largest first.
 *
 * A chart headed "pipeline by stage" that includes `won` and `lost`
 * contradicts the pipeline figure printed directly above it, and the bar read
 * first is the largest one, which late in a good period is `won`.
 */
export const pipelineByStage = (
  stats: TeamDealStat[] | undefined,
  wonStages: string[],
): StagePoint[] =>
  stageBreakdown(
    (stats ?? []).filter(
      (stat) => !wonStages.includes(stat.stage) && stat.stage !== LOST_STAGE,
    ),
  );

/** One step of the funnel, in the order the pipeline is configured. */
export type FunnelPoint = {
  stage: string;
  nbDeals: number;
  amount: number;
  /** This stage's share of every deal in the period, 0..1. */
  share: number;
};

/**
 * The period's deals laid out in configured stage order, with counts.
 *
 * Deliberately NOT a conversion funnel. A deal sits in exactly one stage, so
 * this is a snapshot of where the deals are now: dividing one stage's count by
 * the previous one's would produce a "conversion rate" from two numbers that
 * were never a cohort, and it would lurch every time somebody advances a single
 * deal. A real conversion rate needs `deal_stage_changes` - a different query
 * and a different screen. What IS honest from this data is the win rate over
 * deals that reached a decision, which lives in `teamPace.ts`.
 *
 * Ordered by `dealStages` rather than by size, because here the order is the
 * meaning: a funnel sorted by amount is just a bar chart.
 */
export const dealFunnel = (
  stats: TeamDealStat[] | undefined,
  stageOrder: string[],
): FunnelPoint[] => {
  const breakdown = stageBreakdown(stats);
  const totalDeals = breakdown.reduce(
    (total, point) => total + point.nbDeals,
    0,
  );

  return stageOrder
    .map((stage) => breakdown.find((point) => point.stage === stage))
    .filter((point): point is StagePoint => point != null)
    .map((point) => ({
      stage: point.stage,
      nbDeals: point.nbDeals,
      amount: point.amount,
      share: totalDeals === 0 ? 0 : point.nbDeals / totalDeals,
    }));
};

/**
 * The month a chart axis shows: `"2026-03-01"` -> `"Mar 2026"`.
 *
 * Built from the parts rather than from `new Date(month)`, which parses a bare
 * `YYYY-MM-DD` as UTC midnight and renders it as the previous month for anyone
 * west of Greenwich.
 */
export const formatMonthLabel = (month: string, locale = "en-US") => {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Number(year), Number(monthNumber) - 1, 1);
  return date.toLocaleDateString(locale, { month: "short", year: "numeric" });
};
