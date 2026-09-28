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

describe("demo quote links", () => {
  it("lists a link that was just issued as active", async () => {
    const dataProvider = setup();

    await dataProvider.issueQuoteVersion(quotes[0].id, { tokenDays: 30 });
    const { data } = await dataProvider.getList("quote_access_tokens_summary", {
      filter: { quote_id: quotes[0].id },
      pagination: { page: 1, perPage: 50 },
      sort: { field: "created_at", order: "DESC" },
    });

    expect(data).toHaveLength(1);
    expect(data[0].is_active).toBe(true);
  });
});
