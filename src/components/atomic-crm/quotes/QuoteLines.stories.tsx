import type { Meta } from "@storybook/react-vite";
import { RecordContextProvider, ResourceContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { QuoteSummary } from "../types";
import { QuoteLines } from "./QuoteLines";
import {
  companies,
  priceListItems,
  priceLists,
  products,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
  taxRates,
} from "./quoteFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Quote Lines",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const db = {
  companies,
  products,
  price_lists: priceLists,
  price_list_items: priceListItems,
  tax_rates: taxRates,
  quote_statuses: quoteStatuses,
  quotes,
  quote_versions: quoteVersions,
  quote_lines: quoteLines,
};

/** The record the editor renders under, in the shape `quotes_summary` returns. */
const asQuote = (overrides: Partial<QuoteSummary> = {}): QuoteSummary => ({
  ...quotes[0],
  status_label: "Draft",
  current_version_id: quoteVersions[0].id,
  current_version_number: 1,
  ...overrides,
});

const Panel = ({ quote }: { quote: QuoteSummary }) => (
  <StoryWrapper data={db}>
    <ResourceContextProvider value="quotes">
      <RecordContextProvider value={quote}>
        <div className="p-4">
          <QuoteLines />
        </div>
      </RecordContextProvider>
    </ResourceContextProvider>
  </StoryWrapper>
);

export const Draft = () => <Panel quote={asQuote()} />;

/** A document a customer was shown: its lines are immutable forever (§4). */
export const Issued = () => (
  <Panel quote={asQuote({ status_key: "sent", status_label: "Sent" })} />
);

export const Empty = () => (
  <StoryWrapper data={{ ...db, quote_lines: [] }}>
    <ResourceContextProvider value="quotes">
      <RecordContextProvider value={asQuote()}>
        <div className="p-4">
          <QuoteLines />
        </div>
      </RecordContextProvider>
    </ResourceContextProvider>
  </StoryWrapper>
);

/** No price list means no price book: there is nothing legitimate to offer. */
export const WithoutPriceList = () => (
  <Panel quote={asQuote({ price_list_id: null })} />
);
