import fakeRestDataProvider from "ra-data-fakerest";

import { latestQuoteByDeal } from "../../deals/DealBoardSignals";
import type { QuoteSummary } from "../../types";
import { DEMO_QUOTE_STATUSES } from "./dataGenerator/quoteStatuses";
import {
  DEMO_DEAL_QUOTE_STAGE_RULES,
  syncDealFromQuote,
} from "./dealQuoteSync";

/**
 * The demo's mirror of `sync_deal_from_quote()` must apply the rules
 * `deal_quote_sync.test.sql` pins on the real function.
 */
const setup = () =>
  fakeRestDataProvider(
    {
      deal_quote_stage_rules: DEMO_DEAL_QUOTE_STAGE_RULES,
      quote_statuses: DEMO_QUOTE_STATUSES,
      deals: [
        { id: 1, stage: "opportunity", amount: 1, index: 0, archived_at: null },
        { id: 2, stage: "lost", amount: 1, index: 0, archived_at: null },
        {
          id: 3,
          stage: "proposal-sent",
          amount: 1,
          index: 0,
          archived_at: null,
        },
      ],
      quotes: [
        { id: 10, deal_id: 1, status_key: "sent" },
        { id: 20, deal_id: 2, status_key: "sent" },
        { id: 30, deal_id: 3, status_key: "rejected" },
        { id: 31, deal_id: 3, status_key: "sent" },
      ],
      quote_versions: [
        {
          id: 100,
          quote_id: 10,
          version_number: 1,
          issued_at: "2026-09-01",
          superseded_at: null,
          total: 3703.8,
        },
        {
          id: 200,
          quote_id: 20,
          version_number: 1,
          issued_at: "2026-09-01",
          superseded_at: null,
          total: 999,
        },
      ],
      deal_stage_changes: [],
    },
    false,
  );

const dealOf = async (dataProvider: ReturnType<typeof setup>, id: number) =>
  (await dataProvider.getOne("deals", { id })).data;

describe("syncDealFromQuote (demo mirror)", () => {
  it("moves the deal to the proposal stage with the amount sent, and records the quotation as the cause", async () => {
    const dataProvider = setup();

    await syncDealFromQuote(dataProvider, 10, "sent", 5);

    expect(await dealOf(dataProvider, 1)).toMatchObject({
      stage: "proposal-sent",
      amount: 3704,
      amount_source_quote_id: 10,
    });
    const { data: changes } = await dataProvider.getList("deal_stage_changes", {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    });
    expect(changes).toEqual([
      expect.objectContaining({
        deal_id: 1,
        from_stage: "opportunity",
        to_stage: "proposal-sent",
        source: "quote",
        quote_id: 10,
        reason: "quote:sent",
        sales_id: 5,
      }),
    ]);
  });

  it("never reopens a closed deal, nor rewrites its amount", async () => {
    const dataProvider = setup();

    await syncDealFromQuote(dataProvider, 20, "sent", 5);

    expect(await dealOf(dataProvider, 2)).toMatchObject({
      stage: "lost",
      amount: 1,
    });
  });

  it("reopens a deal when the renegotiated quotation that lost it is sent again", async () => {
    const dataProvider = setup();
    await dataProvider.create("deal_stage_changes", {
      data: {
        deal_id: 2,
        from_stage: "proposal-sent",
        to_stage: "lost",
        changed_at: "2026-09-02T00:00:00.000Z",
        source: "quote",
        quote_id: 20,
        reason: "quote:rejected",
      },
    });

    await syncDealFromQuote(dataProvider, 20, "sent", 5);

    expect(await dealOf(dataProvider, 2)).toMatchObject({
      stage: "proposal-sent",
      amount: 999,
    });
  });

  it("keeps a deal closed when something moved it after the quotation's refusal", async () => {
    const dataProvider = setup();
    for (const [source, quoteId, changedAt] of [
      ["quote", 20, "2026-09-02T00:00:00.000Z"],
      ["manual", null, "2026-09-03T00:00:00.000Z"],
    ] as const) {
      await dataProvider.create("deal_stage_changes", {
        data: {
          deal_id: 2,
          to_stage: "lost",
          changed_at: changedAt,
          source,
          quote_id: quoteId,
        },
      });
    }

    await syncDealFromQuote(dataProvider, 20, "sent", 5);

    expect((await dealOf(dataProvider, 2)).stage).toBe("lost");
  });

  it("does not lose a deal on one refusal while another quotation is open", async () => {
    const dataProvider = setup();

    await syncDealFromQuote(dataProvider, 30, "rejected", null);

    expect((await dealOf(dataProvider, 3)).stage).toBe("proposal-sent");
  });
});

describe("latestQuoteByDeal", () => {
  it("keeps the first quotation met per deal, from a list sorted newest first", () => {
    const latest = latestQuoteByDeal([
      { id: 9, deal_id: 1, quote_number: "Q-9" },
      { id: 8, deal_id: 1, quote_number: "Q-8" },
      { id: 7, deal_id: 2, quote_number: "Q-7" },
      { id: 6, deal_id: null, quote_number: "Q-6" },
    ] as QuoteSummary[]);

    expect(latest.get(1)?.quote_number).toBe("Q-9");
    expect(latest.get(2)?.quote_number).toBe("Q-7");
    expect(latest.size).toBe(2);
  });
});
