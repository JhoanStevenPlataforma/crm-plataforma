import { createCrmDb } from "@/test/StoryWrapper";

import {
  companies,
  deals,
  priceLists,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "../../quotes/quoteFixtures";
import { createDataProvider } from "./index";

const setup = () =>
  createDataProvider({
    db: createCrmDb({
      companies,
      deals,
      price_lists: priceLists,
      quote_statuses: quoteStatuses,
      quotes,
      quote_versions: quoteVersions,
      quote_lines: quoteLines,
    }),
    silent: true,
  });

const linksOf = async (
  dataProvider: ReturnType<typeof setup>,
  quoteId: unknown,
) =>
  (
    await dataProvider.getList("quote_access_tokens_summary", {
      filter: { quote_id: quoteId },
      pagination: { page: 1, perPage: 50 },
      sort: { field: "created_at", order: "DESC" },
    })
  ).data;

describe("demo quote links", () => {
  it("lists a link that was just issued as active and permanent, without its token", async () => {
    const dataProvider = setup();

    await dataProvider.issueQuoteVersion(quotes[0].id);
    const data = await linksOf(dataProvider, quotes[0].id);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ is_active: true, is_permanent: true });
    expect(data[0]).not.toHaveProperty("token");
  });

  it("keeps one link through a revision and the next issue, and reads it back", async () => {
    const dataProvider = setup();
    const quoteId = quotes[0].id;

    const first = await dataProvider.issueQuoteVersion(quoteId);
    await dataProvider.reviseQuote(quoteId, "Renegotiating");
    const second = await dataProvider.issueQuoteVersion(quoteId);
    const read = await dataProvider.getQuoteShareLink(quoteId);

    expect(second.token).toBe(first.token);
    expect(second.version_number).toBe(first.version_number + 1);
    expect(read).toMatchObject({
      token: first.token,
      version_number: second.version_number,
      expires_at: null,
    });
    expect(await linksOf(dataProvider, quoteId)).toHaveLength(1);
    // The demo provider simulates network latency on every call.
  }, 60_000);

  it("reads nothing for a quote never issued, and mints only when asked after a revocation", async () => {
    const dataProvider = setup();
    const quoteId = quotes[0].id;

    expect(await dataProvider.getQuoteShareLink(quoteId)).toBeNull();

    const issued = await dataProvider.issueQuoteVersion(quoteId);
    await dataProvider.revokeQuoteToken(issued.token_id);

    expect(await dataProvider.getQuoteShareLink(quoteId)).toBeNull();
    const minted = await dataProvider.getQuoteShareLink(quoteId, {
      create: true,
    });
    expect(minted?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(minted?.token).not.toBe(issued.token);
  }, 60_000);
});
