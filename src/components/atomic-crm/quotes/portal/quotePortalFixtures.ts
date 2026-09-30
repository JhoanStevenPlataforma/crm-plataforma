/**
 * The portal fixtures the stories and the tests share.
 *
 * `portalPayload` has the shape `quote_portal_document()` returns — the keys
 * `quote_portal.test.sql` pins — and its figures add up the way the generated
 * columns compute them (round per line, then sum), so a document rendered from
 * it is a document the server could have sent. Its `etag` is a label, not a
 * hash: the fake portal only needs it to change whenever the document does.
 */

import {
  QuotePortalError,
  type QuotePortalAcceptance,
  type QuotePortalClient,
  type QuotePortalComment,
  type QuotePortalErrorKey,
  type QuotePortalPayload,
  type QuotePortalRejection,
} from "./quotePortalClient";

/** The one link the fake portal knows. Any other token is a dead link. */
export const PORTAL_TOKEN =
  "5e42aca4f1ad3eb0ee60e1cfa23aaccf2de80241212ed3ac33c1d319b9b730a6";

export const portalPayload: QuotePortalPayload = {
  etag: "etag-0",
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
  comments: [
    {
      author_kind: "customer",
      author_name: "Lucía Gómez",
      body: "Could the onboarding\nstart in October?",
      created_at: "2026-09-11T14:00:00.000Z",
      edited_at: null,
    },
    {
      author_kind: "internal",
      author_name: "Jane Doe",
      body: "Yes, the first week of October works for us.",
      created_at: "2026-09-11T16:30:00.000Z",
      edited_at: "2026-09-11T16:45:00.000Z",
    },
  ],
  branding: { title: "Acme CRM", logo_url: null },
  slides: [],
  standard_presentation: false,
  // Version 1 was declined and renegotiated into version 2, the one on offer.
  versions: [
    {
      number: 2,
      issued_at: "2026-09-10T15:00:00.000Z",
      is_current: true,
      outcome: null,
    },
    {
      number: 1,
      issued_at: "2026-09-01T15:00:00.000Z",
      is_current: false,
      outcome: "rejected",
    },
  ],
  actions: { can_accept: true, can_reject: true, can_comment: true },
  acceptance: { accepted_at: null, accepted_by_name: null, rejected_at: null },
};

/**
 * Two slides as `portal_slides_snapshot()` freezes them: a picture filling the
 * left of the stage beside a heading, then a text alone in the middle.
 */
export const portalSlidesSample: QuotePortalPayload["slides"] = [
  {
    elements: [
      {
        id: "picture",
        kind: "image",
        x: 0,
        y: 0,
        w: 55,
        h: 100,
        path: "slides/11111111-1111-4111-8111-111111111111.webp",
        alt: "Our team",
      },
      {
        id: "heading",
        kind: "text",
        x: 60,
        y: 30,
        w: 35,
        h: 30,
        text: "People behind every event",
        size: "xl",
        align: "left",
        color: "light",
      },
    ],
  },
  {
    elements: [
      {
        id: "claim",
        kind: "text",
        x: 10,
        y: 40,
        w: 80,
        h: 20,
        text: "Twenty years on stage",
        size: "lg",
        align: "center",
        color: "light",
      },
    ],
  },
];

export const ANSWERED_AT = "2026-09-14T15:00:00.000Z";

export const COMMENTED_AT = "2026-09-15T09:00:00.000Z";

export type FakeQuotePortal = {
  client: QuotePortalClient;
  /** The opens the server would have recorded, one per call. */
  views: () => number;
  /** The times the page asked whether the document changed. */
  polls: () => number;
  /** The version each open asked for, in order (null: the link as sent). */
  openedVersions: () => (number | null)[];
  /** The version each answer named, in order. */
  answeredVersions: () => number[];
  /** The team changes the document on the server: a new etag with it. */
  change: (edit: (payload: QuotePortalPayload) => QuotePortalPayload) => void;
  /** The link dies — revoked by a revision, or withdrawn. */
  revoke: () => void;
  /** Every poll fails with this key until it is cleared with `null`. */
  failPollsWith: (key: QuotePortalErrorKey | null) => void;
};

/**
 * A portal with no server behind it. It keeps the document, counts the opens
 * the way the server records views, closes both answers and the thread once an
 * answer is given, and refuses with the server's keys. Every change to the
 * document mints a new etag, as the server's hash of it would change.
 */
export const createFakeQuotePortal = ({
  payload = portalPayload,
  refuseViewWith,
  refuseAnswerWith,
  refuseCommentWith,
}: {
  payload?: QuotePortalPayload;
  refuseViewWith?: QuotePortalErrorKey;
  refuseAnswerWith?: QuotePortalErrorKey;
  refuseCommentWith?: QuotePortalErrorKey;
} = {}): FakeQuotePortal => {
  let current = payload;
  let viewCount = 0;
  let pollCount = 0;
  const opened: (number | null)[] = [];
  const answered: number[] = [];
  let revision = 0;
  let isRevoked = false;
  let pollFailure: QuotePortalErrorKey | null = null;

  const open = (token: string) => {
    if (token !== PORTAL_TOKEN || isRevoked)
      throw new QuotePortalError("quote_link_invalid");
  };

  const store = (next: QuotePortalPayload) => {
    revision += 1;
    current = { ...next, etag: `etag-${revision}` };
    return current;
  };

  /**
   * The document as the server builds it for one version: the current one, or
   * an older one read-only, as `quote_portal_document()` marks it — superseded,
   * nothing to answer, the thread (the quote's) as it stands. A number no
   * version carries gets the current one, as `quote_portal_target_version()`.
   */
  const documentOf = (versionNumber?: number | null): QuotePortalPayload => {
    const older = current.versions.find(
      (version) => version.number === versionNumber && !version.is_current,
    );
    if (!older) return current;
    return {
      ...current,
      etag: `${current.etag}:v${older.number}`,
      quote: {
        ...current.quote,
        version_number: older.number,
        issued_at: older.issued_at,
        is_superseded: true,
      },
      actions: { ...current.actions, can_accept: false, can_reject: false },
      acceptance: {
        accepted_at: older.outcome === "accepted" ? older.issued_at : null,
        accepted_by_name: null,
        rejected_at: older.outcome === "rejected" ? older.issued_at : null,
      },
    };
  };

  const answer = (
    versionNumber: number,
    status: "accepted" | "rejected",
    acceptedBy: string | null,
  ) => {
    answered.push(versionNumber);
    if (refuseAnswerWith) throw new QuotePortalError(refuseAnswerWith);
    if (versionNumber !== current.quote.version_number)
      throw new QuotePortalError("quote_version_superseded");
    return store({
      ...current,
      quote: { ...current.quote, status },
      actions: { can_accept: false, can_reject: false, can_comment: false },
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
    });
  };

  return {
    views: () => viewCount,
    polls: () => pollCount,
    openedVersions: () => [...opened],
    answeredVersions: () => [...answered],
    change: (edit) => {
      store(edit(current));
    },
    revoke: () => {
      isRevoked = true;
    },
    failPollsWith: (key) => {
      pollFailure = key;
    },
    client: {
      view: async (token, versionNumber) => {
        viewCount += 1;
        opened.push(versionNumber ?? null);
        open(token);
        if (refuseViewWith) throw new QuotePortalError(refuseViewWith);
        return documentOf(versionNumber);
      },
      version: async (token, versionNumber) => {
        pollCount += 1;
        if (pollFailure) throw new QuotePortalError(pollFailure);
        open(token);
        return documentOf(versionNumber).etag;
      },
      accept: async (token, versionNumber, { name }: QuotePortalAcceptance) => {
        open(token);
        return answer(versionNumber, "accepted", name);
      },
      reject: async (
        token,
        versionNumber,
        _rejection: QuotePortalRejection,
      ) => {
        open(token);
        return answer(versionNumber, "rejected", null);
      },
      comment: async (token, { body, name }: QuotePortalComment) => {
        open(token);
        if (refuseCommentWith) throw new QuotePortalError(refuseCommentWith);
        if (!current.actions.can_comment)
          throw new QuotePortalError("quote_portal_comments_closed");
        return store({
          ...current,
          comments: [
            ...current.comments,
            {
              author_kind: "customer",
              author_name: name,
              body,
              created_at: COMMENTED_AT,
              edited_at: null,
            },
          ],
        });
      },
    },
  };
};
