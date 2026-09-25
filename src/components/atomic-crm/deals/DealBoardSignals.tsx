/* eslint-disable react-refresh/only-export-components */
import { type Identifier, useGetList, useGetMany } from "ra-core";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { nextTaskByEntity } from "../tasks/nextOpenTask";
import { OPEN_TASK_FILTER } from "../tasks/taskBuckets";
import type { Deal, QuoteSummary, Sale, Task } from "../types";

/**
 * What a card on the board says beyond its own columns: who owns the deal and
 * what happens next on it — the "is anybody working this?" signal every
 * pipeline board worth copying puts on the card (Pipedrive's activity dot).
 *
 * Loaded once for the whole board, never per card: one `getMany` for the
 * owners and one query for the open tasks linked to the board's deals.
 */
interface DealBoardSignals {
  owners: Map<Identifier, Sale>;
  nextTasks: Map<Identifier, Task>;
  /** False until the tasks arrive, so a card does not flash "no activity". */
  hasTasks: boolean;
  /**
   * The newest quotation of each deal: the one whose status the pipeline
   * follows (`sync_deal_from_quote()`), shown on the card.
   */
  latestQuotes: Map<Identifier, QuoteSummary>;
  now: Date;
}

const DealBoardSignalsContext = createContext<DealBoardSignals | null>(null);

/** Far more than 100 deals carry; the board itself stops at 100. */
const TASKS_PER_PAGE = 500;

export const DealBoardSignalsProvider = ({
  deals,
  children,
}: {
  deals: readonly Deal[];
  children: ReactNode;
}) => {
  // Pinned per mount: the relative dates on every card are read against one
  // "now", and the query keys below stay stable.
  const now = useMemo(() => new Date(), []);

  const dealIds = useMemo(() => deals.map((deal) => deal.id).sort(), [deals]);
  const ownerIds = useMemo(
    () => [...new Set(deals.map((deal) => deal.sales_id).filter(Boolean))],
    [deals],
  );

  const { data: owners } = useGetMany<Sale>(
    "sales",
    { ids: ownerIds },
    { enabled: ownerIds.length > 0 },
  );
  const { data: tasks, isSuccess } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: TASKS_PER_PAGE },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        ...OPEN_TASK_FILTER,
        primary_entity_type: "deal",
        "primary_entity_id@in": `(${dealIds.join(",")})`,
      },
    },
    { enabled: dealIds.length > 0 },
  );

  // One query for the whole board, newest first: the first row met per deal
  // is its latest quotation.
  const { data: quotes } = useGetList<QuoteSummary>(
    "quotes",
    {
      pagination: { page: 1, perPage: TASKS_PER_PAGE },
      sort: { field: "created_at", order: "DESC" },
      filter: { "deal_id@in": `(${dealIds.join(",")})` },
    },
    { enabled: dealIds.length > 0 },
  );

  const value = useMemo<DealBoardSignals>(
    () => ({
      owners: new Map((owners ?? []).map((sale) => [sale.id, sale])),
      nextTasks: nextTaskByEntity(tasks ?? []),
      hasTasks: isSuccess,
      latestQuotes: latestQuoteByDeal(quotes ?? []),
      now,
    }),
    [owners, tasks, isSuccess, quotes, now],
  );

  return (
    <DealBoardSignalsContext.Provider value={value}>
      {children}
    </DealBoardSignalsContext.Provider>
  );
};

/** The first quotation met per deal, from a list sorted newest first. */
export const latestQuoteByDeal = (
  quotes: readonly QuoteSummary[],
): Map<Identifier, QuoteSummary> => {
  const latest = new Map<Identifier, QuoteSummary>();
  for (const quote of quotes) {
    if (quote.deal_id != null && !latest.has(quote.deal_id)) {
      latest.set(quote.deal_id, quote);
    }
  }
  return latest;
};

/** Null outside the board (e.g. the archived-deals dialog): cards then omit the signals. */
export const useDealBoardSignals = () => useContext(DealBoardSignalsContext);
