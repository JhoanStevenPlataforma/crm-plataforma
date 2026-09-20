import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Db } from "../providers/fakerest/dataGenerator/types";
import type { Company, QuoteLine, QuoteVersion } from "../types";
import {
  commentAuthors,
  companies,
  quoteComments,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "./quoteFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Quote Show",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

/**
 * The customer as the CRM knows them TODAY. They moved after version 1 was
 * sent, which is the situation the snapshot exists for: the two addresses below
 * differ on purpose, so a document printing the wrong one is visible.
 */
const movedCompany = {
  ...companies[0],
  address: "Carrera 99 # 10-20",
  city: "Medellín",
  country: "Colombia",
  tax_identifier: "900.123.456-7",
} as Company;

/** The customer as they were on the day version 1 was issued. */
const PARTY_SNAPSHOT = {
  company: {
    name: "Acme Andina",
    address: "Calle 1 # 2-3",
    city: "Bogotá",
    country: "Colombia",
    tax_identifier: "900.123.456-7",
  },
  contact: null,
  owner: { name: "Jane Doe" },
  snapshot_at: "2026-09-10T10:00:00.000Z",
};

const issuedFirstVersion: QuoteVersion = {
  ...quoteVersions[0],
  issued_at: "2026-09-10T10:00:00.000Z",
  party_snapshot: PARTY_SNAPSHOT,
};

const draftSecondVersion: QuoteVersion = {
  ...quoteVersions[0],
  id: 11,
  version_number: 2,
  issued_at: null,
  party_snapshot: null,
  subtotal: 1200000,
  discount_total: 0,
  tax_total: 228000,
  total: 1428000,
};

const licenceLine: QuoteLine = {
  ...quoteLines[0],
  id: 101,
  version_id: 11,
  product_id: 2,
  sku: "LIC-001",
  name: "Annual license",
  unit: "license",
  quantity: 1,
  unit_price: 1200000,
  discount_percent: 0,
};

const baseDb = {
  companies: [movedCompany],
  quote_statuses: quoteStatuses,
};

/** Sent and never revised: one frozen document. */
const issuedDb = {
  ...baseDb,
  quotes: [{ ...quotes[0], status_key: "sent" }],
  quote_versions: [issuedFirstVersion],
  quote_lines: quoteLines,
} as Partial<Db>;

/** Revised: version 1 as the customer was sent it, version 2 being drafted. */
const revisedDb = {
  ...baseDb,
  quotes: [quotes[0]],
  quote_versions: [
    { ...issuedFirstVersion, superseded_at: "2026-09-12T10:00:00.000Z" },
    draftSecondVersion,
  ],
  quote_lines: [...quoteLines, licenceLine],
} as Partial<Db>;

/** The routes are the real ones: the page is reached the way a row reaches it. */
export const Issued = () => (
  <StoryWrapper data={issuedDb} initialEntries={["/quotes/1/show"]}>
    {null}
  </StoryWrapper>
);

/** Sent, and being negotiated: every kind of comment the thread holds. */
export const Conversation = () => (
  <StoryWrapper
    data={
      {
        ...issuedDb,
        sales: commentAuthors,
        quote_comments: quoteComments,
      } as Partial<Db>
    }
    initialEntries={["/quotes/1/show"]}
  >
    {null}
  </StoryWrapper>
);

export const Revised = () => (
  <StoryWrapper data={revisedDb} initialEntries={["/quotes/1/show"]}>
    {null}
  </StoryWrapper>
);

/**
 * Answered, both ways (§6.4, Phase 10). The demo provider has no
 * `quote_portal_events` collection — there is no portal in demo mode — so these
 * two also prove the panel renders from the VERSION alone and treats the
 * missing trail as a fact it does not have.
 */
export const Accepted = () => (
  <StoryWrapper
    data={
      {
        ...issuedDb,
        quotes: [{ ...quotes[0], status_key: "accepted" }],
        quote_versions: [
          {
            ...issuedFirstVersion,
            accepted_at: "2026-09-12T15:04:00.000Z",
            accepted_by_name: "Lucía Gómez",
            accepted_by_email: "lucia@acme-andina.test",
            accepted_ip: "203.0.113.7",
            acceptance_method: "portal_click",
            acceptance_evidence: {
              token_id: 5,
              version_number: 1,
              currency: "COP",
              total: 642600,
              user_agent: "Mozilla/5.0 (Windows NT 10.0) PortalTest/1.0",
            },
          },
        ],
      } as Partial<Db>
    }
    initialEntries={["/quotes/1/show"]}
  >
    {null}
  </StoryWrapper>
);

export const Declined = () => (
  <StoryWrapper
    data={
      {
        ...issuedDb,
        quotes: [{ ...quotes[0], status_key: "rejected" }],
        quote_versions: [
          {
            ...issuedFirstVersion,
            rejected_at: "2026-09-12T15:04:00.000Z",
            rejected_reason_code: "delivery_time",
            rejected_reason: "Necesitamos la entrega en agosto.",
          },
        ],
      } as Partial<Db>
    }
    initialEntries={["/quotes/1/show"]}
  >
    {null}
  </StoryWrapper>
);

/** The print route, asked for the version that is NOT the newest. */
export const PrintFirstVersion = () => (
  <StoryWrapper
    data={revisedDb}
    initialEntries={["/quotes/1/print?version=10"]}
  >
    {null}
  </StoryWrapper>
);

/** A hand-edited URL naming a version of some other quote. */
export const PrintForeignVersion = () => (
  <StoryWrapper
    data={revisedDb}
    initialEntries={["/quotes/1/print?version=999"]}
  >
    {null}
  </StoryWrapper>
);
