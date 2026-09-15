import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";

import { EntityQuotesPanel } from "./EntityQuotesPanel";
import {
  companies,
  deals,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "./quoteFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Entity Quotes Panel",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const db = {
  companies,
  deals,
  quote_statuses: quoteStatuses,
  quotes,
  quote_versions: quoteVersions,
  quote_lines: quoteLines,
};

export const WithQuotes = () => (
  <StoryWrapper data={db}>
    <div className="p-4">
      <EntityQuotesPanel dealId={1} companyId={1} dealName="Acme renewal" />
    </div>
  </StoryWrapper>
);

export const Empty = () => (
  <StoryWrapper data={{ ...db, quotes: [] }}>
    <div className="p-4">
      <EntityQuotesPanel dealId={1} companyId={1} dealName="Acme renewal" />
    </div>
  </StoryWrapper>
);
