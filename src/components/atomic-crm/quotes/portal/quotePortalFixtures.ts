/**
 * The portal fixtures the stories and the tests share.
 *
 * `portalPayload` has the shape `quote_portal_document()` returns — the keys
 * `quote_portal.test.sql` pins — and its figures add up the way the generated
 * columns compute them (round per line, then sum), so a document rendered from
 * it is a document the server could have sent.
 */

import {
  QuotePortalError,
  type QuotePortalAcceptance,
  type QuotePortalClient,
  type QuotePortalErrorKey,
  type QuotePortalPayload,
  type QuotePortalRejection,
} from "./quotePortalClient";

/** The one link the fake portal knows. Any other token is a dead link. */
export const PORTAL_TOKEN =
  "5e42aca4f1ad3eb0ee60e1cfa23aaccf2de80241212ed3ac33c1d319b9b730a6";

export const portalPayload: QuotePortalPayload = {
  quote: {
    number: "Q-2026-00042",
    title: "Renewal 2027",
    status: "sent",
    currency: "COP",
    version_number: 2,
    issued_at: "2026-09-10T15:00:00.000Z",
    valid_until: "2026-12-31",
    is_superseded: false,
  },
  parties: {
    company: {
      name: "Acme Andina",
      address: "Calle 80 # 11-42",
      zipcode: null,
      city: "Bogotá",
      state_abbr: null,
      country: "Colombia",
      tax_identifier: "900.555.123-4",
      phone_number: null,
      website: null,
    },
    contact: {
      first_name: "Lucía",
      last_name: "Gómez",
      title: "Purchasing",
      email: "lucia@acme.example",
      phone: null,
    },
    owner: { name: "Jane Doe" },
  },
  lines: [
    {
      position: 1,
      sku: "SUP-8X5",
      name: "Annual support",
      description: "8x5, business hours",
      unit: "year",
      quantity: 1,
      unit_price: 1200000,
      discount_percent: 10,
      tax_rate_percent: 19,
      line_total: 1285200,
    },
    {
      position: 2,
      sku: null,
      name: "Onboarding",
      description: null,
      unit: "hour",
      quantity: 12,
      unit_price: 150000,
      discount_percent: 0,
      tax_rate_percent: 19,
      line_total: 2142000,
    },
  ],
  totals: {
    subtotal: 3000000,
    discount_total: 120000,
    tax_total: 547200,
    total: 3427200,
  },
  terms: "Payment 30 days after invoice.",
  branding: { title: "Acme CRM", logo_url: null },
  actions: { can_accept: true, can_reject: true },
  acceptance: { accepted_at: null, accepted_by_name: null, rejected_at: null },
};

export const ANSWERED_AT = "2026-09-14T15:00:00.000Z";

export type FakeQuotePortal = {
  client: QuotePortalClient;
  /** The opens the server would have recorded, one per call. */
  views: () => number;
};

/**
 * A portal with no server behind it. It keeps the document, counts the opens
 * the way the server records views, closes both answers once one is given, and
 * refuses with the server's keys.
 */
export const createFakeQuotePortal = ({
  payload = portalPayload,
  refuseViewWith,
  refuseAnswerWith,
}: {
  payload?: QuotePortalPayload;
  refuseViewWith?: QuotePortalErrorKey;
  refuseAnswerWith?: QuotePortalErrorKey;
} = {}): FakeQuotePortal => {
  let current = payload;
  let viewCount = 0;

  const open = (token: string) => {
    if (token !== PORTAL_TOKEN)
      throw new QuotePortalError("quote_link_invalid");
  };

  const answer = (
    status: "accepted" | "rejected",
    acceptedBy: string | null,
  ) => {
    if (refuseAnswerWith) throw new QuotePortalError(refuseAnswerWith);
    current = {
      ...current,
      quote: { ...current.quote, status },
      actions: { can_accept: false, can_reject: false },
      acceptance:
        status === "accepted"
          ? {
              accepted_at: ANSWERED_AT,
              accepted_by_name: acceptedBy,
              rejected_at: null,
            }
          : {
              accepted_at: null,
              accepted_by_name: null,
              rejected_at: ANSWERED_AT,
            },
    };
    return current;
  };

  return {
    views: () => viewCount,
    client: {
      view: async (token) => {
        viewCount += 1;
        open(token);
        if (refuseViewWith) throw new QuotePortalError(refuseViewWith);
        return current;
      },
      accept: async (token, { name }: QuotePortalAcceptance) => {
        open(token);
        return answer("accepted", name);
      },
      reject: async (token, _rejection: QuotePortalRejection) => {
        open(token);
        return answer("rejected", null);
      },
    },
  };
};
