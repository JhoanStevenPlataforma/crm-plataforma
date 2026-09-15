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
  branding: z.object({ title: nullableText, logo_url: nullableText }),
  actions: z.object({ can_accept: z.boolean(), can_reject: z.boolean() }),
  acceptance: z.object({
    accepted_at: nullableText,
    accepted_by_name: nullableText,
    rejected_at: nullableText,
  }),
});

export type QuotePortalPayload = z.infer<typeof payloadSchema>;

const responseSchema = z.union([
  z.object({ data: payloadSchema }),
  z.object({ error: z.string() }),
]);

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

export type QuotePortalClient = {
  /** Opens the document. The server records a view for every call. */
  view: (token: string) => Promise<QuotePortalPayload>;
  accept: (
    token: string,
    answer: QuotePortalAcceptance,
  ) => Promise<QuotePortalPayload>;
  reject: (
    token: string,
    answer: QuotePortalRejection,
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
  const call = async (
    action: "view" | "accept" | "reject",
    body: Record<string, unknown>,
  ): Promise<QuotePortalPayload> => {
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

    const parsed = responseSchema.safeParse(
      await response.json().catch(() => null),
    );
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
    view: (token) => call("view", { token }),
    accept: (token, answer) => call("accept", { token, ...answer }),
    reject: (token, answer) => call("reject", { token, ...answer }),
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
