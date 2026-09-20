import cloneDeep from "lodash/cloneDeep";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { createCrmDb, StoryWrapper } from "@/test/StoryWrapper";

import { createDataProvider } from "../providers/fakerest";
import type { Db } from "../providers/fakerest/dataGenerator/types";
import {
  commentAuthors,
  companies,
  quoteComments,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "./quoteFixtures";

/** A write, then the refetch it triggers, over the demo provider's latency. */
const SETTLED = { timeout: 5000 };

const negotiation = {
  companies,
  quote_statuses: quoteStatuses,
  quotes: [{ ...quotes[0], status_key: "sent" }],
  quote_versions: quoteVersions,
  quote_lines: quoteLines,
  sales: commentAuthors,
  quote_comments: quoteComments,
} as Partial<Db>;

/**
 * The quote's page while it stays open (quotes §6.5), through the REAL route.
 *
 * The data provider is the demo one, so the test holds it to write "from
 * elsewhere" — the writes nobody on this page made, which is what a customer on
 * the portal or a colleague in another tab is — and replaces only the
 * subscription, to be the server announcing that the quote changed.
 */
describe("useQuoteRealtime", () => {
  beforeAll(() => {
    // The mobile admin registers no quote routes at all.
    page.viewport(1600, 900);
  });

  it("shows what changed on the server as soon as it is announced, without a reload", async () => {
    const provider = createDataProvider({
      db: createCrmDb(cloneDeep(negotiation)),
      silent: true,
    });
    let announce: (() => void) | undefined;
    const screen = await render(
      <StoryWrapper
        dataProvider={{
          ...provider,
          subscribeToQuoteChanges: async (_quoteId, onChange) => {
            announce = onChange;
            return () => {
              announce = undefined;
            };
          },
        }}
        initialEntries={["/quotes/1/show"]}
      >
        {null}
      </StoryWrapper>,
    );
    const thread = screen.getByRole("region", { name: "Conversation" });
    await expect
      .element(thread.getByText("Purchasing confirms stock for October."))
      .toBeVisible();

    await provider.create("quote_comments", {
      data: { quote_id: 1, visibility: "internal", body: "Written elsewhere." },
    });
    await expect
      .element(thread.getByText("Written elsewhere."))
      .not.toBeInTheDocument();

    await expect.poll(() => announce).toBeTypeOf("function");
    announce?.();

    await expect
      .element(thread.getByText("Written elsewhere."), SETTLED)
      .toBeVisible();
  });
});
