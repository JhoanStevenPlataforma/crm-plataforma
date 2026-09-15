import type { DataProvider } from "ra-core";

import type {
  AnalyticsFn,
  Deal,
  DealFlowStat,
  DealOwnerStat,
  DealStageStat,
  Lead,
  LeadBreakdownStat,
  LeadDimension,
  LeadFlowStat,
  Sale,
  Task,
  TaskFlowStat,
  TaskStockStat,
  TaskTypeStat,
} from "../../types";

/**
 * Demo-mode equivalents of the eight analytics functions.
 *
 * FakeRest has no views and no functions, so every aggregate the real backend
 * computes in Postgres is recomputed here over the in-browser dataset. Without
 * this file `make start-demo` renders four tabs of empty charts, which reads as
 * "the feature is broken" rather than "there is no server".
 *
 * The semantics are mirrored deliberately, line for line with the SQL — the
 * same date bases, the same exclusions, the same definition of open — because
 * the demo exists to show the real product. Where the two could drift, the
 * comment names the rule rather than restating the code.
 *
 * What is NOT mirrored is row level security: FakeRest has no policies, so the
 * demo aggregates everything regardless of the signed-in user. That gap is
 * inherent to demo mode and is why the RLS scoping is proven in pgTAP instead.
 */

/** Terminal stages, matching the literals in the SQL and `defaultDealStages`. */
const TERMINAL_STAGES = ["won", "lost"];

const ALL_ROWS = { page: 1, perPage: 100000 } as const;

const fetchAll = async <T>(
  dataProvider: DataProvider,
  resource: string,
): Promise<T[]> => {
  const { data } = await dataProvider.getList(resource, {
    pagination: ALL_ROWS,
    sort: { field: "id", order: "ASC" },
    filter: {},
  });
  return data as T[];
};

/** ISO timestamp or bare day -> `YYYY-MM-DD`. */
const dayOf = (value?: string | null): string | null =>
  value ? value.slice(0, 10) : null;

/** ISO timestamp or bare day -> first of its month, `YYYY-MM-01`. */
const monthOf = (value?: string | null): string | null =>
  value ? `${value.slice(0, 7)}-01` : null;

const inRange = (day: string | null, from: string, to: string): day is string =>
  day != null && day >= from && day <= to;

const numParam = (
  params: Record<string, unknown>,
  key: string,
): number | null => {
  const value = params[key];
  return typeof value === "number" ? value : null;
};

const strParam = (params: Record<string, unknown>, key: string): string => {
  const value = params[key];
  return typeof value === "string" ? value : "";
};

const nameOf = (sale: Sale | undefined): string | null =>
  sale ? `${sale.first_name} ${sale.last_name}`.trim() || null : null;

/** Rounded to one decimal, or null — never 0, which would claim "instant". */
const average = (values: number[]): number | null =>
  values.length === 0
    ? null
    : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

/** Accumulate into a map keyed by anything, creating the seed on first touch. */
const bucketBy = <K, V>(
  rows: K[],
  keyOf: (row: K) => string,
  seed: () => V,
  fold: (acc: V, row: K) => void,
): Map<string, V> => {
  const out = new Map<string, V>();
  for (const row of rows) {
    const key = keyOf(row);
    let acc = out.get(key);
    if (!acc) {
      acc = seed();
      out.set(key, acc);
    }
    fold(acc, row);
  }
  return out;
};

const liveDeals = (
  deals: Deal[],
  salesId: number | null,
  teamId: number | null,
): Deal[] =>
  deals.filter(
    (deal) =>
      !deal.archived_at &&
      (salesId == null || Number(deal.sales_id) === salesId) &&
      (teamId == null || Number(deal.team_id) === teamId),
  );

const dealStageStats = (
  deals: Deal[],
  params: Record<string, unknown>,
): DealStageStat[] => {
  // Stock, and open stages only: the SQL takes no date parameters here, because
  // "where is the pipeline right now" has no month.
  const rows = liveDeals(
    deals,
    numParam(params, "p_sales_id"),
    numParam(params, "p_team_id"),
  ).filter((deal) => !TERMINAL_STAGES.includes(deal.stage));

  return [
    ...bucketBy(
      rows,
      (deal) => deal.stage,
      () => ({ nb_deals: 0, amount: 0 }),
      (acc, deal) => {
        acc.nb_deals += 1;
        acc.amount += deal.amount ?? 0;
      },
    ),
  ].map(([stage, acc]) => ({ stage, ...acc }));
};

const dealFlowStats = (
  deals: Deal[],
  params: Record<string, unknown>,
): DealFlowStat[] => {
  const from = strParam(params, "p_from");
  const to = strParam(params, "p_to");
  const rows = liveDeals(
    deals,
    numParam(params, "p_sales_id"),
    numParam(params, "p_team_id"),
  );

  const months = new Map<string, DealFlowStat>();
  const seed = (month: string): DealFlowStat => {
    const existing = months.get(month);
    if (existing) return existing;
    const fresh: DealFlowStat = {
      month,
      nb_created: 0,
      amount_created: 0,
      nb_won: 0,
      amount_won: 0,
      nb_lost: 0,
      amount_lost: 0,
      nb_forecast: 0,
      forecast_days_total: 0,
    };
    months.set(month, fresh);
    return fresh;
  };

  for (const deal of rows) {
    // Basis one: the month the opportunity was opened.
    const created = dayOf(deal.created_at);
    if (inRange(created, from, to)) {
      const bucket = seed(monthOf(created) as string);
      bucket.nb_created += 1;
      bucket.amount_created += deal.amount ?? 0;
      // Sum and count, never an average: see the note on `DealFlowStat`.
      if (deal.expected_closing_date) {
        bucket.nb_forecast += 1;
        bucket.forecast_days_total +=
          (new Date(deal.expected_closing_date).getTime() -
            new Date(created).getTime()) /
          (24 * 60 * 60 * 1000);
      }
    }

    // Basis two: the month it was decided. `expected_closing_date` is the MVP
    // stand-in for a real close date, which only `deal_stage_changes` knows and
    // only since 2026-08-18. A won deal with no expected date lands in no month
    // at all rather than a guessed one.
    if (!TERMINAL_STAGES.includes(deal.stage)) continue;
    const decided = dayOf(deal.expected_closing_date);
    if (!inRange(decided, from, to)) continue;

    const bucket = seed(monthOf(decided) as string);
    if (deal.stage === "won") {
      bucket.nb_won += 1;
      bucket.amount_won += deal.amount ?? 0;
    } else {
      bucket.nb_lost += 1;
      bucket.amount_lost += deal.amount ?? 0;
    }
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
};

const dealOwnerStats = (
  deals: Deal[],
  sales: Sale[],
  params: Record<string, unknown>,
): DealOwnerStat[] => {
  const from = strParam(params, "p_from");
  const to = strParam(params, "p_to");
  const rows = liveDeals(deals, null, numParam(params, "p_team_id")).filter(
    (deal) => deal.sales_id != null,
  );

  const byOwner = bucketBy(
    rows,
    (deal) => String(deal.sales_id),
    () => ({
      nb_open: 0,
      pipeline_amount: 0,
      nb_won: 0,
      won_amount: 0,
      nb_lost: 0,
      lost_amount: 0,
    }),
    (acc, deal) => {
      const amount = deal.amount ?? 0;
      // Pipeline is STOCK: it ignores the period, exactly as the SQL does.
      if (!TERMINAL_STAGES.includes(deal.stage)) {
        acc.nb_open += 1;
        acc.pipeline_amount += amount;
        return;
      }
      // The decided figures ARE period-scoped. Mixed bases in one row, on
      // purpose, and labelled in the chart.
      if (!inRange(dayOf(deal.expected_closing_date), from, to)) return;
      if (deal.stage === "won") {
        acc.nb_won += 1;
        acc.won_amount += amount;
      } else {
        acc.nb_lost += 1;
        acc.lost_amount += amount;
      }
    },
  );

  return [...byOwner].map(([salesId, acc]) => ({
    sales_id: Number(salesId),
    owner_name: nameOf(sales.find((sale) => String(sale.id) === salesId)),
    ...acc,
  }));
};

const leadCohort = (leads: Lead[], params: Record<string, unknown>): Lead[] => {
  const from = strParam(params, "p_from");
  const to = strParam(params, "p_to");
  const salesId = numParam(params, "p_sales_id");

  return leads.filter(
    (lead) =>
      inRange(dayOf(lead.created_at), from, to) &&
      (salesId == null || Number(lead.sales_id) === salesId),
  );
};

/** Days between arrival and conversion, for the leads that converted. */
const conversionDays = (lead: Lead): number =>
  (new Date(lead.converted_at as string).getTime() -
    new Date(lead.created_at).getTime()) /
  (24 * 60 * 60 * 1000);

const leadFlowStats = (
  leads: Lead[],
  params: Record<string, unknown>,
): LeadFlowStat[] => {
  const byMonth = bucketBy(
    leadCohort(leads, params),
    (lead) => monthOf(lead.created_at) as string,
    () => ({ nb_created: 0, nb_converted: 0, days: [] as number[] }),
    (acc, lead) => {
      acc.nb_created += 1;
      // Cohort-scoped: of the leads that ARRIVED this month, how many have
      // converted since. Dividing conversions that happened in March by leads
      // created in March would compare two different populations.
      if (lead.converted_at) {
        acc.nb_converted += 1;
        acc.days.push(conversionDays(lead));
      }
    },
  );

  return [...byMonth]
    .map(([month, acc]) => ({
      month,
      nb_created: acc.nb_created,
      nb_converted: acc.nb_converted,
      avg_conversion_days: average(acc.days),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const leadBreakdownStats = (
  leads: Lead[],
  deals: Deal[],
  sales: Sale[],
  params: Record<string, unknown>,
): LeadBreakdownStat[] => {
  const cohort = leadCohort(leads, params);
  const dealById = new Map(deals.map((deal) => [String(deal.id), deal]));

  const foldInto = (
    dimension: LeadDimension,
    bucketOf: (lead: Lead) => string,
  ) =>
    [
      ...bucketBy(
        cohort,
        bucketOf,
        () => ({
          nb_leads: 0,
          nb_converted: 0,
          nb_won_deals: 0,
          won_amount: 0,
          pipeline_amount: 0,
          days: [] as number[],
        }),
        (acc, lead) => {
          acc.nb_leads += 1;
          if (lead.converted_at) {
            acc.nb_converted += 1;
            acc.days.push(conversionDays(lead));
          }
          // Attribution runs through `converted_deal_id` and nowhere else:
          // `deals` has no source column, so a deal typed straight into the
          // kanban is unattributable by construction.
          const deal =
            lead.converted_deal_id != null
              ? dealById.get(String(lead.converted_deal_id))
              : undefined;
          if (!deal || deal.archived_at) return;
          if (deal.stage === "won") {
            acc.nb_won_deals += 1;
            acc.won_amount += deal.amount ?? 0;
          } else if (deal.stage !== "lost") {
            acc.pipeline_amount += deal.amount ?? 0;
          }
        },
      ),
    ].map(([bucket, acc]) => ({
      dimension,
      bucket,
      nb_leads: acc.nb_leads,
      nb_converted: acc.nb_converted,
      nb_won_deals: acc.nb_won_deals,
      won_amount: acc.won_amount,
      pipeline_amount: acc.pipeline_amount,
      avg_conversion_days: average(acc.days),
    }));

  return [
    ...foldInto("source", (lead) => lead.source?.trim() || "unknown"),
    ...foldInto("status", (lead) => lead.status?.trim() || "unknown"),
    // The owner bucket carries a NAME, not an id: the client cannot turn a
    // `sales_id` into a person without a second query.
    ...foldInto(
      "owner",
      (lead) =>
        nameOf(
          sales.find((sale) => String(sale.id) === String(lead.sales_id)),
        ) ?? "unassigned",
    ),
  ];
};

/** Open on the COLUMNS, never on `status_is_open` — the two disagree on an
 * archived task and on one completed without its status following. */
const isOpen = (task: Task): boolean =>
  !task.archived_at && !task.completed_at && !task.canceled_at;

const taskFlowStats = (
  tasks: Task[],
  params: Record<string, unknown>,
): TaskFlowStat[] => {
  const from = strParam(params, "p_from");
  const to = strParam(params, "p_to");
  const salesId = numParam(params, "p_sales_id");
  const rows = tasks.filter(
    (task) =>
      !task.deleted_at &&
      (salesId == null || Number(task.owner_sales_id) === salesId),
  );

  const months = new Map<
    string,
    {
      nb_created: number;
      nb_completed: number;
      nb_completed_on_time: number;
      hours: number[];
    }
  >();
  const seed = (month: string) => {
    const existing = months.get(month);
    if (existing) return existing;
    const fresh = {
      nb_created: 0,
      nb_completed: 0,
      nb_completed_on_time: 0,
      hours: [] as number[],
    };
    months.set(month, fresh);
    return fresh;
  };

  for (const task of rows) {
    const created = dayOf(task.created_at);
    if (inRange(created, from, to)) {
      seed(monthOf(created) as string).nb_created += 1;
    }

    const completed = dayOf(task.completed_at);
    if (!inRange(completed, from, to)) continue;

    const bucket = seed(monthOf(completed) as string);
    bucket.nb_completed += 1;
    // A task with no due date counts as on time, so the denominator stays
    // equal to nb_completed and the rate cannot exceed 100%.
    const completedAt = task.completed_at;
    if (!completedAt) continue;

    if (!task.due_date || new Date(completedAt) <= new Date(task.due_date)) {
      bucket.nb_completed_on_time += 1;
    }
    // Measured, never read from `total_open_seconds`: that counter reads 0 on
    // every task predating its trigger, and a chart cannot tell "instant" from
    // "never recorded". A task with no creation timestamp contributes to no
    // cycle at all rather than to a fabricated one.
    if (task.created_at) {
      bucket.hours.push(
        (new Date(completedAt).getTime() -
          new Date(task.created_at).getTime()) /
          (60 * 60 * 1000),
      );
    }
  }

  return [...months]
    .map(([month, acc]) => ({
      month,
      nb_created: acc.nb_created,
      nb_completed: acc.nb_completed,
      nb_completed_on_time: acc.nb_completed_on_time,
      avg_cycle_hours: average(acc.hours),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

const taskStockStats = (
  tasks: Task[],
  sales: Sale[],
  params: Record<string, unknown>,
): TaskStockStat[] => {
  const salesId = numParam(params, "p_sales_id");
  const now = Date.now();
  const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;

  const rows = tasks.filter(
    (task) =>
      !task.deleted_at &&
      task.owner_sales_id != null &&
      (salesId == null || Number(task.owner_sales_id) === salesId),
  );

  const byOwner = bucketBy(
    rows,
    (task) => String(task.owner_sales_id),
    () => ({ nb_open: 0, nb_overdue: 0, nb_due_next_7d: 0 }),
    (acc, task) => {
      if (!isOpen(task)) return;
      acc.nb_open += 1;
      if (!task.due_date) return;
      const due = new Date(task.due_date).getTime();
      // Overdue is a SUBSET of open, never a sibling.
      if (due < now) acc.nb_overdue += 1;
      else if (due < inSevenDays) acc.nb_due_next_7d += 1;
    },
  );

  return [...byOwner].map(([ownerId, acc]) => ({
    sales_id: Number(ownerId),
    owner_name: nameOf(sales.find((sale) => String(sale.id) === ownerId)),
    ...acc,
  }));
};

const taskTypeStats = (
  tasks: Task[],
  params: Record<string, unknown>,
): TaskTypeStat[] => {
  const from = strParam(params, "p_from");
  const to = strParam(params, "p_to");
  const salesId = numParam(params, "p_sales_id");

  // Completed work only: a planned call that never happened is not activity.
  const rows = tasks.filter(
    (task) =>
      !task.deleted_at &&
      task.completed_at &&
      inRange(dayOf(task.completed_at), from, to) &&
      (salesId == null || Number(task.owner_sales_id) === salesId),
  );

  return [
    ...bucketBy(
      rows,
      (task) => task.type_key ?? "none",
      () => ({ type_label: "", nb_completed: 0 }),
      (acc, task) => {
        acc.type_label = task.type_label ?? task.type_key ?? "none";
        acc.nb_completed += 1;
      },
    ),
  ].map(([type_key, acc]) => ({ type_key, ...acc }));
};

/**
 * The demo-mode counterpart of `dataProvider.getAnalytics`.
 *
 * Each branch fetches only the resources it needs, so opening the Leads tab
 * does not read four hundred tasks out of the in-memory store.
 */
export const getAnalytics = async <T>(
  dataProvider: DataProvider,
  fn: AnalyticsFn,
  params: Record<string, unknown>,
): Promise<T[]> => {
  switch (fn) {
    case "deal_stage_stats":
      return dealStageStats(
        await fetchAll<Deal>(dataProvider, "deals"),
        params,
      ) as T[];

    case "deal_flow_stats":
      return dealFlowStats(
        await fetchAll<Deal>(dataProvider, "deals"),
        params,
      ) as T[];

    case "deal_owner_stats":
      return dealOwnerStats(
        await fetchAll<Deal>(dataProvider, "deals"),
        await fetchAll<Sale>(dataProvider, "sales"),
        params,
      ) as T[];

    case "lead_flow_stats":
      return leadFlowStats(
        await fetchAll<Lead>(dataProvider, "leads"),
        params,
      ) as T[];

    case "lead_breakdown_stats":
      return leadBreakdownStats(
        await fetchAll<Lead>(dataProvider, "leads"),
        await fetchAll<Deal>(dataProvider, "deals"),
        await fetchAll<Sale>(dataProvider, "sales"),
        params,
      ) as T[];

    case "task_flow_stats":
      return taskFlowStats(
        await fetchAll<Task>(dataProvider, "tasks"),
        params,
      ) as T[];

    case "task_stock_stats":
      return taskStockStats(
        await fetchAll<Task>(dataProvider, "tasks"),
        await fetchAll<Sale>(dataProvider, "sales"),
        params,
      ) as T[];

    case "task_type_stats":
      return taskTypeStats(
        await fetchAll<Task>(dataProvider, "tasks"),
        params,
      ) as T[];
  }
};
