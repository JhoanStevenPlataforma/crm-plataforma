/**
 * The seam between the CRM and whoever actually delivers its mail
 * (docs/proposals/outbound-email.md).
 *
 * Everything above this file speaks of an `OutboundEmail` and a `SendResult`;
 * only a provider module knows an endpoint, a header name or an error code.
 * Replacing the provider is one more file here and one more entry in the
 * registry.
 */

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface EmailParty {
  email: string;
  name?: string | null;
}

export interface OutboundEmail {
  from: EmailParty;
  to: EmailParty;
  replyTo?: string | null;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  /** The provider's channel for this kind of mail (transactional / commercial). */
  messageStream?: string | null;
}

/**
 * `retryable` is the provider module's judgement, and the only place it is
 * made: a refused address will be refused again, a 503 will not.
 *
 * `code` is a stable key the UI translates; `message` is a short technical
 * note for whoever diagnoses it. Neither ever holds a credential or a request
 * body.
 */
export type SendResult =
  | { ok: true; providerMessageId: string | null; simulated?: boolean }
  | { ok: false; retryable: boolean; code: string; message: string };

/**
 * What a provider reported about a message after accepting it, in the CRM's
 * own words. `eventId` must be the same for the same event however many times
 * the provider delivers it: it is what makes a replay harmless.
 */
export interface EmailProviderEvent {
  eventId: string;
  /** The id the provider gave the message when it accepted it. */
  messageId: string | null;
  type: "delivered" | "bounced" | "complained";
  recipient: string | null;
  /** ISO timestamp, as the provider states it. */
  occurredAt: string | null;
  /** A bounce the provider will not retry: the address is dead. */
  permanent: boolean;
  /** The provider's one-line reason. Never a message body. */
  detail: string | null;
}

export interface EmailProvider {
  key: string;
  /** False for the simulated provider, which needs no secret. */
  needsCredentials: boolean;
  send: (
    email: OutboundEmail,
    credentials: string | null,
    fetchImpl: FetchLike,
  ) => Promise<SendResult>;
  /**
   * Is this request really the provider's? Each provider proves it its own
   * way (a shared secret, an HMAC of the body), so the check lives with the
   * provider. Absent for a provider that reports nothing.
   */
  verifyWebhook?: (
    request: {
      authorization: string | null;
      rawBody: string;
      /** The request's headers, names in lower case. */
      headers?: Record<string, string>;
    },
    secret: string,
  ) => Promise<boolean>;
  /**
   * One webhook payload as an event, or null for a record type the CRM does
   * not record (opens, clicks, subscription changes).
   */
  parseWebhook?: (payload: unknown) => EmailProviderEvent | null;
}

export type EmailProviderRegistry = Record<string, EmailProvider>;
