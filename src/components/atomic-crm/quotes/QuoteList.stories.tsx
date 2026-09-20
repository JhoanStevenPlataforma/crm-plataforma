import type { Meta } from "@storybook/react-vite";
import { ResourceContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Quote, QuoteVersion } from "../types";
import { QuoteList } from "./QuoteList";
import {
  companies,
  deals,
  quoteComments,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "./quoteFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Quote List",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

/** A second document, accepted, so the status filter has something to hide. */
const accepted: Quote = {
  ...quotes[0],
  id: 2,
  quote_number: "Q-2026-00002",
  title: "Support retainer",
  status_key: "accepted",
};

/**
 * One we lost, with the reason the customer gave (§6.4, Phase 10). Its version
 * is issued and refused, which is what `quotes_summary` reads the code off.
 */
const lost: Quote = {
  ...quotes[0],
  id: 3,
  quote_number: "Q-2026-00003",
  title: "Hardware refresh",
  status_key: "rejected",
};

const lostVersion: QuoteVersion = {
  ...quoteVersions[0],
  id: 30,
  quote_id: 3,
  issued_at: "2026-09-10T10:00:00.000Z",
  rejected_at: "2026-09-12T15:04:00.000Z",
  rejected_reason_code: "delivery_time",
  rejected_reason: "Necesitamos la entrega en agosto.",
};

const lostDb = {
  companies,
  deals,
  quote_statuses: quoteStatuses,
  quotes: [...quotes, accepted, lost],
  quote_versions: [...quoteVersions, lostVersion],
  quote_lines: quoteLines,
};

/** What are we losing on — the question the loss reason exists to answer. */
export const WithLostQuote = () => (
  <StoryWrapper data={lostDb}>
    <ResourceContextProvider value="quotes">
      <QuoteList />
    </ResourceContextProvider>
  </StoryWrapper>
);

export const WithQuotes = () => (
  <StoryWrapper
    data={{
      companies,
      deals,
      quote_statuses: quoteStatuses,
      quotes: [...quotes, accepted],
      quote_versions: quoteVersions,
      quote_lines: quoteLines,
    }}
  >
    <ResourceContextProvider value="quotes">
      <QuoteList />
    </ResourceContextProvider>
  </StoryWrapper>
);

/** The customer of quote 1 asked something on the link, and nobody has read it. */
export const WithUnansweredCustomer = () => (
  <StoryWrapper
    data={{
      companies,
      deals,
      quote_statuses: quoteStatuses,
      quotes: [...quotes, accepted],
      quote_versions: quoteVersions,
      quote_lines: quoteLines,
      quote_comments: quoteComments,
    }}
  >
    <ResourceContextProvider value="quotes">
      <QuoteList />
    </ResourceContextProvider>
  </StoryWrapper>
);
