import type { Meta } from "@storybook/react-vite";
import { ResourceContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Quote } from "../types";
import { QuoteList } from "./QuoteList";
import {
  companies,
  deals,
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
