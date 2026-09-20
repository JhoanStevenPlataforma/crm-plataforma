import { createContext, useContext, useMemo } from "react";
import { z } from "zod";

/**
 * How the customer portal page talks to the `quote-portal` edge function
 * (docs/proposals/quotes-cpq-module.md §6).
 *
 * `fetch`, not the Supabase client and never the data provider. The page is
 * public: a rep who opens a customer link in a browser where they are signed
 * in must not send their own session to an endpoint that has no use for it,
 * and the portal must not depend on anything the CRM's screens depend on (§9).
 *
 * Every answer is VALIDATED before it is rendered. The payload is external data
 * like any other, and a document rendered from a half-understood response is a
 * quotation with blanks in it.
 */

const nullableText = z.string().nullable();
const snapshotObject = z.record(z.string(), z.unknown()).nullable();

/** `quote_portal_document()`, group for group (02_functions.sql). */
const payloadSchema = z.object({
  // The hash of everything else here, and what the poll compares (§6.5).
  etag: z.string(),
  quote: z.object({
    number: z.string(),
    title: nullableText,
    status: z.string(),
    currency: z.string(),
    version_number: z.number(),
    issued_at: z.string(),
    valid_until: nullableText,
    is_superseded: z.boolean(),
  }),
  parties: z.object({
    company: snapshotObject,
    contact: snapshotObject,
    owner: snapshotObject,
  }),
  lines: z.array(
    z.object({
      position: z.number(),
      sku: nullableText,
      name: z.string(),
      description: nullableText,
      unit: nullableText,
      quantity: z.number(),
      unit_price: z.number(),
      discount_percent: z.number(),
      tax_rate_percent: z.number(),
      line_total: z.number(),
    }),
  ),
  totals: z.object({
    subtotal: z.number(),
    discount_total: z.number(),
    tax_total: z.number(),
    total: z.number(),
  }),
  terms: nullableText,
  // The shared thread, oldest first. No ids and no emails: the page prints a
  // name, a date and the words, and that is all the server discloses.
  comments: z.array(
    z.object({
      author_kind: z.enum(["internal", "customer"]),
      author_name: nullableText,
      body: z.string(),
      created_at: z.string(),
      edited_at: nullableText,
    }),
  ),
  branding: z.object({ title: nullableText, logo_url: nullableText }),
  actions: z.object({
    can_accept: z.boolean(),
    can_reject: z.boolean(),
    can_comment: z.boolean(),
  }),
  acceptance: z.object({
    accepted_at: nullableText,
    accepted_by_name: nullableText,
    rejected_at: nullableText,
  }),
});

export type QuotePortalPayload = z.infer<typeof payloadSchema>;

export type QuotePortalThreadComment = QuotePortalPayload["comments"][number];

/** `quote_portal_version()`: the poll's whole answer. */
const versionSchema = z.object({ etag: z.string() });

type PortalAction = "view" | "accept" | "reject" | "comment" | "version";

/**
 * The reasons a version can record (`quote_versions.rejected_reason_code`), in
 * the order the form offers them.
 */
export const QUOTE_REJECTION_REASONS = [
  "price",
  "terms",
  "delivery_time",
  "product",
  "other",
] as const;

export type QuoteRejectionReason = (typeof QUOTE_REJECTION_REASONS)[number];

/**
 * The refusals the edge function answers with. The values are the database's
 * (`quote_portal.test.sql` asserts them), plus `quote_portal_unavailable` for
 * everything that is not one of them — a network failure, a server error, an
 * answer this page does not understand.
 */
export const QUOTE_PORTAL_ERRORS = [
  "quote_link_invalid",
  "quote_portal_throttled",
  "quote_portal_unavailable",
  "quote_portal_name_required",
  "quote_portal_email_invalid",
  "quote_portal_reason_code_invalid",
  "quote_portal_input_too_long",
  "quote_portal_body_required",
  "quote_portal_comments_closed",
  "quote_portal_comment_limit",
  "quote_version_superseded",
  "quote_version_answered",
  "quote_validity_elapsed",
  "quote_transition_illegal",
  "quote_status_unchanged",
  "quote_transition_actor_not_allowed",
] as const;

export type QuotePortalErrorKey = (typeof QUOTE_PORTAL_ERRORS)[number];

const isErrorKey = (value: string): value is QuotePortalErrorKey =>
  (QUOTE_PORTAL_ERRORS as readonly string[]).includes(value);

export class QuotePortalError extends Error {
  readonly key: QuotePortalErrorKey;

  constructor(key: QuotePortalErrorKey) {
    super(key);
    this.name = "QuotePortalError";
    this.key = key;
  }
}

/** The key of any failure: ours, or the generic one. */
export const portalErrorKeyOf = (error: unknown): QuotePortalErrorKey =>
  error instanceof QuotePortalError ? error.key : "quote_portal_unavailable";

export type QuotePortalAcceptance = { name: string; email: string };

export type QuotePortalRejection = {
  reason_code: QuoteRejectionReason;
  reason: string | null;
  name: string | null;
  email: string | null;
};

/** A customer comment: signed with a name, the email optional. */
export type QuotePortalComment = {
  body: string;
  name: string;
  email: string | null;
};

export type QuotePortalClient = {
  /** Opens the document. The server records a view for every call. */
  view: (token: string) => Promise<QuotePortalPayload>;
  /**
   * The document's `etag` as it stands on the server. Records nothing: it is
   * what the page asks every few seconds to learn whether to open it again.
   */
  version: (token: string) => Promise<string>;
  accept: (
    token: string,
    answer: QuotePortalAcceptance,
  ) => Promise<QuotePortalPayload>;
  reject: (
    token: string,
    answer: QuotePortalRejection,
  ) => Promise<QuotePortalPayload>;
  /** Resolves with the document, its thread now carrying the comment. */
  comment: (
    token: string,
    comment: QuotePortalComment,
  ) => Promise<QuotePortalPayload>;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const createQuotePortalClient = ({
  baseUrl,
  apiKey,
  fetchImpl = (input, init) => fetch(input, init),
}: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}): QuotePortalClient => {
  const call = async <T>(
    action: PortalAction,
    body: Record<string, unknown>,
    data: z.ZodType<T>,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(
        `${baseUrl}/functions/v1/quote-portal/${action}`,
        {
          method: "POST",
          // The publishable key only routes the call through the gateway; it
          // authorises nothing. The token in the body is the credential.
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify(body),
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        },
      );
    } catch {
      throw new QuotePortalError("quote_portal_unavailable");
    }

    const parsed = z
      .union([z.object({ data }), z.object({ error: z.string() })])
      .safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new QuotePortalError("quote_portal_unavailable");
    if ("error" in parsed.data) {
      throw new QuotePortalError(
        isErrorKey(parsed.data.error)
          ? parsed.data.error
          : "quote_portal_unavailable",
      );
    }
    return parsed.data.data;
  };

  return {
    view: (token) => call("view", { token }, payloadSchema),
    version: async (token) =>
      (await call("version", { token }, versionSchema)).etag,
    accept: (token, answer) =>
      call("accept", { token, ...answer }, payloadSchema),
    reject: (token, answer) =>
      call("reject", { token, ...answer }, payloadSchema),
    comment: (token, comment) =>
      call("comment", { token, ...comment }, payloadSchema),
  };
};

const QuotePortalClientContext = createContext<QuotePortalClient | null>(null);

/** Stories and tests hand the page a client that needs no server. */
export const QuotePortalClientProvider = QuotePortalClientContext.Provider;

/** The client the page uses: the provided one, or the edge function. */
export const useQuotePortalClient = (): QuotePortalClient => {
  const provided = useContext(QuotePortalClientContext);
  return useMemo(
    () =>
      provided ??
      createQuotePortalClient({
        baseUrl: import.meta.env.VITE_SUPABASE_URL,
        apiKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
      }),
    [provided],
  );
};
