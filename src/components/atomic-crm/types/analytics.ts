/**
 * Row shapes returned by the eight analytics aggregation functions.
 *
 * One type per function, named after it. They are read-only projections: the
 * module never writes through them, and nothing else in the app should read
 * them either — a component that wants a record reads the resource, a component
 * that wants a figure reads one of these.
 *
 * Every `amount` is already summed in Postgres. Aggregating in the browser is
 * what these exist to replace: PostgREST caps a response at 1000 rows, so a
 * chart that fetches a list and sums it is silently wrong above that volume.
 */

/** Names of the RPCs this module may call. The union IS the allowlist. */
export type AnalyticsFn =
  | "deal_stage_stats"
  | "deal_flow_stats"
  | "deal_owner_stats"
  | "lead_flow_stats"
  | "lead_breakdown_stats"
  | "task_flow_stats"
  | "task_stock_stats"
  | "task_type_stats";

/**
 * Live pipeline by stage, right now.
 *
 * Stock, so it carries no month and ignores the period filter: "where is the
 * pipeline" has no date. Terminal stages are absent by construction — the
 * function returns open deals only.
 */
export type DealStageStat = {
  stage: string;
  nb_deals: number;
  amount: number;
};

/**
 * Deals per month, on two date bases at once.
 *
 * `nb_created` / `amount_created` are filed under the month the deal was
 * OPENED; the won and lost figures under the month it was DECIDED. The UI
 * labels each series with its own basis — they are not interchangeable.
 */
export type DealFlowStat = {
  /** First day of the month, `YYYY-MM-DD`. */
  month: string;
  nb_created: number;
  amount_created: number;
  nb_won: number;
  amount_won: number;
  nb_lost: number;
  amount_lost: number;
  /** Deals created this month that carry an expected closing date. */
  nb_forecast: number;
  /** Their total forecast cycle in days. A sum and a count rather than an
   * average, so any grouping the UI chooses divides exactly — averaging
   * monthly averages weights a three-deal month like a three-hundred-deal one. */
  forecast_days_total: number;
};

/**
 * Per owner. `nb_open` / `pipeline_amount` are stock; the won and lost figures
 * are flow inside the period. Mixed on purpose, and labelled in the chart.
 */
export type DealOwnerStat = {
  sales_id: number;
  owner_name: string | null;
  nb_open: number;
  pipeline_amount: number;
  nb_won: number;
  won_amount: number;
  nb_lost: number;
  lost_amount: number;
};

/**
 * Leads per month. `nb_converted` is COHORT-scoped: of the leads created in
 * this month, how many converted since. The most recent months therefore look
 * worse than they will — a cohort still filling in is not a decline.
 */
export type LeadFlowStat = {
  month: string;
  nb_created: number;
  nb_converted: number;
  avg_conversion_days: number | null;
};

export type LeadDimension = "source" | "status" | "owner";

/**
 * The Leads tab's five breakdowns, in one call so every rate is computed over
 * the same cohort and they reconcile with each other by construction.
 *
 * `bucket` is a raw key for `source` and `status` (the UI resolves the label
 * from the application configuration) and a resolved person's name for `owner`.
 */
export type LeadBreakdownStat = {
  dimension: LeadDimension;
  bucket: string;
  nb_leads: number;
  nb_converted: number;
  nb_won_deals: number;
  won_amount: number;
  pipeline_amount: number;
  avg_conversion_days: number | null;
};

/**
 * Tasks per month, again on two date bases: created and completed. The gap
 * between the two series is a backlog forming.
 */
export type TaskFlowStat = {
  month: string;
  nb_created: number;
  nb_completed: number;
  nb_completed_on_time: number;
  /** Null for a month where nothing was completed — never 0, which would draw
   * a bar claiming tasks closed instantly. */
  avg_cycle_hours: number | null;
};

/**
 * Open work per owner, right now.
 *
 * `nb_overdue` is a SUBSET of `nb_open`, never a sibling: anything stacking the
 * two must subtract first or every late task is drawn twice.
 */
export type TaskStockStat = {
  sales_id: number;
  owner_name: string | null;
  nb_open: number;
  nb_overdue: number;
  nb_due_next_7d: number;
};

/** Completed tasks by type — the only activity-type vocabulary in the schema. */
export type TaskTypeStat = {
  type_key: string;
  type_label: string;
  nb_completed: number;
};
