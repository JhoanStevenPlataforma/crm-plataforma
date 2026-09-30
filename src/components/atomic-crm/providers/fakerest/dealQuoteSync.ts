import type { DataProvider, Identifier } from "ra-core";

import type { Deal, Quote, QuoteStatus, QuoteVersion } from "../../types";

/** A row of `deal_quote_stage_rules`, as the demo keeps it. */
export type DealQuoteStageRule = {
  id: Identifier;
  trigger_key: string;
  to_stage: string;
  closes: boolean;
  only_if_no_open_quote: boolean;
};

/** The mapping the migration seeds, for the default stages. */
export const DEMO_DEAL_QUOTE_STAGE_RULES: DealQuoteStageRule[] = [
  {
    id: 1,
    trigger_key: "sent",
    to_stage: "proposal-sent",
    closes: false,
    only_if_no_open_quote: false,
  },
  {
    id: 2,
    trigger_key: "viewed",
    to_stage: "proposal-sent",
    closes: false,
    only_if_no_open_quote: false,
  },
  {
    id: 3,
    trigger_key: "negotiating",
    to_stage: "in-negociation",
    closes: false,
    only_if_no_open_quote: false,
  },
  {
    id: 4,
    trigger_key: "commented",
    to_stage: "in-negociation",
    closes: false,
    only_if_no_open_quote: false,
  },
  {
    id: 5,
    trigger_key: "accepted",
    to_stage: "won",
    closes: true,
    only_if_no_open_quote: false,
  },
  {
    id: 6,
    trigger_key: "rejected",
    to_stage: "lost",
    closes: true,
    only_if_no_open_quote: true,
  },
  {
    id: 7,
    trigger_key: "expired",
    to_stage: "delayed",
    closes: false,
    only_if_no_open_quote: true,
  },
];

const ALL = { page: 1, perPage: 10_000 };

const list = async <T>(
  dataProvider: DataProvider,
  resource: string,
  filter: Record<string, unknown> = {},
) =>
  (
    await dataProvider.getList(resource, {
      pagination: ALL,
      sort: { field: "id", order: "ASC" },
      filter,
    })
  ).data as T[];

const sameId = (
  a: Identifier | null | undefined,
  b: Identifier | null | undefined,
) => a != null && b != null && String(a) === String(b);

/**
 * The rules, or none when this demo store was built without the collection (a
 * story or a test seeded with just the records it needs): no rule, no move,
 * exactly as the database behaves with an empty table. Any other failure is
 * raised.
 */
const rulesOf = async (
  dataProvider: DataProvider,
): Promise<DealQuoteStageRule[]> => {
  try {
    return await list<DealQuoteStageRule>(
      dataProvider,
      "deal_quote_stage_rules",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Undefined collection "deal_quote_stage_rules"')
    ) {
      return [];
    }
    throw error;
  }
};

/**
 * `sync_deal_from_quote()`, demo-side: the same rules, in the same order —
 * the amount of the version sent (fixed once accepted), never out of a closing
 * stage, bad news only when no other quotation is open, the history row with
 * the quotation as its cause. Demo mode has no triggers, so
 * `applyQuoteStatus()` calls this after every status change.
 */
export const syncDealFromQuote = async (
  dataProvider: DataProvider,
  quoteId: Identifier,
  trigger: string,
  salesId: Identifier | null,
) => {
  const { data: quote } = await dataProvider.getOne<Quote>("quotes", {
    id: quoteId,
  });
  if (quote?.deal_id == null) return;

  const rules = await rulesOf(dataProvider);
  const rule = rules.find((row) => row.trigger_key === trigger);
  if (!rule) return;

  const { data: deal } = await dataProvider.getOne<Deal>("deals", {
    id: quote.deal_id,
  });
  if (!deal || deal.archived_at) return;

  // A renegotiation reopens what its own refusal closed: only when the deal's
  // LAST move was this quotation closing it.
  const lastMove =
    trigger === "sent"
      ? (
          await list<{
            id: Identifier;
            changed_at: string;
            source?: string;
            quote_id?: Identifier | null;
          }>(dataProvider, "deal_stage_changes", { deal_id: deal.id })
        ).sort(
          (a, b) =>
            b.changed_at.localeCompare(a.changed_at) ||
            Number(b.id) - Number(a.id),
        )[0]
      : undefined;
  const isReopened =
    lastMove?.source === "quote" && sameId(lastMove.quote_id, quoteId);
  const isClosed =
    !isReopened &&
    rules.some((row) => row.closes && row.to_stage === deal.stage);
  const statuses = await list<QuoteStatus>(dataProvider, "quote_statuses");
  const quotes = await list<Quote>(dataProvider, "quotes", {
    deal_id: deal.id,
  });
  const statusOf = (key: string) => statuses.find((row) => row.key === key);

  let current = deal;
  if ((trigger === "sent" || trigger === "accepted") && !isClosed) {
    const source = quotes.find((row) =>
      sameId(row.id, deal.amount_source_quote_id),
    );
    const isFixed =
      source != null &&
      !sameId(source.id, quoteId) &&
      statusOf(source.status_key)?.counts_as_won === true;
    if (!isFixed) {
      const versions = await list<QuoteVersion>(
        dataProvider,
        "quote_versions",
        {
          quote_id: quoteId,
        },
      );
      const issued = versions
        .filter((row) => row.issued_at != null && row.superseded_at == null)
        .sort((a, b) => b.version_number - a.version_number)[0];
      if (issued) {
        const { data } = await dataProvider.update<Deal>("deals", {
          id: deal.id,
          data: {
            amount: Math.round(issued.total),
            amount_source_quote_id: quoteId,
            updated_at: new Date().toISOString(),
          },
          previousData: deal,
        });
        current = data;
      }
    }
  }

  if (isClosed || current.stage === rule.to_stage) return;
  if (
    rule.only_if_no_open_quote &&
    quotes.some(
      (row) =>
        !sameId(row.id, quoteId) && statusOf(row.status_key)?.is_open === true,
    )
  ) {
    return;
  }

  const column = await list<Deal>(dataProvider, "deals", {
    stage: rule.to_stage,
  });
  const top = column
    .filter((row) => !row.archived_at)
    .reduce((min, row) => Math.min(min, row.index ?? 0), 0);

  await dataProvider.create("deal_stage_changes", {
    data: {
      deal_id: current.id,
      from_stage: current.stage,
      to_stage: rule.to_stage,
      reason: `quote:${trigger}`,
      sales_id: salesId,
      changed_at: new Date().toISOString(),
      source: "quote",
      quote_id: quoteId,
    },
  });
  await dataProvider.update("deals", {
    id: current.id,
    data: {
      stage: rule.to_stage,
      index: top - 1,
      updated_at: new Date().toISOString(),
    },
    previousData: current,
  });
};
