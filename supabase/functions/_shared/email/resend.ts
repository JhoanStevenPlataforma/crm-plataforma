import { formatAddress, isHeaderSafe, isValidEmail } from "./emailAddress.ts";
import { timingSafeEqual } from "./timingSafe.ts";
import type {
  EmailProvider,
  EmailProviderEvent,
  FetchLike,
  OutboundEmail,
  SendResult,
} from "./types.ts";

/**
 * Resend, over its HTTP API.
 *
 * Resend has no message streams: `messageStream` is ignored. Open and click
 * tracking are settings of the DOMAIN in Resend, off by default, and must stay
 * off -- click tracking would route the customer's quotation link through
 * Resend's redirector.
 */

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 15000;
const MAX_ERROR_LENGTH = 300;

/** How far a webhook's timestamp may be from this clock, either way. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

// The error `name`s that say the key itself is the problem.
// https://resend.com/docs/api-reference/errors
const KEY_ERRORS = [
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "suspended_api_key",
  "invalid_permission",
];
// A quota is a 429 that asking again in a minute does not lift.
const QUOTA_ERRORS = ["daily_quota_exceeded", "monthly_quota_exceeded"];

type ResendAnswer = {
  id?: string;
  name?: string;
  message?: string;
} | null;

const refuse = (
  retryable: boolean,
  code: string,
  message: string,
): SendResult => ({
  ok: false,
  retryable,
  code,
  message: message.slice(0, MAX_ERROR_LENGTH),
});

const classify = (status: number, answer: ResendAnswer): SendResult => {
  const name = answer?.name ?? "";
  const message = answer?.message ?? `resend responded ${status}`;
  if (status === 401 || KEY_ERRORS.includes(name)) {
    return refuse(false, "provider_unauthorized", message);
  }
  if (QUOTA_ERRORS.includes(name)) {
    return refuse(false, "provider_rejected", message);
  }
  if (status === 429 || status >= 500) {
    return refuse(true, "provider_unavailable", message);
  }
  return refuse(false, "provider_rejected", message);
};

const send = async (
  email: OutboundEmail,
  credentials: string | null,
  fetchImpl: FetchLike,
): Promise<SendResult> => {
  if (!credentials) {
    return refuse(false, "email_not_configured", "no provider credentials");
  }
  // Checked again here, at the last line before the network: this module is
  // the one that writes headers.
  if (!isValidEmail(email.to.email) || !isValidEmail(email.from.email)) {
    return refuse(false, "recipient_invalid", "invalid address");
  }
  if (!isHeaderSafe(email.subject)) {
    return refuse(false, "email_subject_invalid", "invalid subject");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${credentials}`,
      },
      body: JSON.stringify({
        from: formatAddress(email.from),
        to: [formatAddress(email.to)],
        ...(email.replyTo && isValidEmail(email.replyTo)
          ? { reply_to: email.replyTo }
          : {}),
        subject: email.subject,
        text: email.textBody,
        ...(email.htmlBody ? { html: email.htmlBody } : {}),
      }),
      signal: controller.signal,
    });

    const answer = (await response.json().catch(() => null)) as ResendAnswer;
    if (!response.ok) {
      return classify(response.status, answer);
    }
    return { ok: true, providerMessageId: answer?.id ?? null };
  } catch (error: unknown) {
    // No answer at all: a timeout or a network failure. The provider may or
    // may not have the message, which is exactly what a retry is for.
    return refuse(
      true,
      "provider_unreachable",
      controller.signal.aborted
        ? `timeout after ${TIMEOUT_MS} ms`
        : error instanceof Error
          ? error.message
          : "network error",
    );
  } finally {
    clearTimeout(timer);
  }
};

const bytesOf = (base64: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

/**
 * Resend signs its webhooks through Svix: `svix-signature` is a space
 * separated list of `v1,<base64>`, each the HMAC-SHA256 of
 * `<svix-id>.<svix-timestamp>.<raw body>` under the bytes of the signing
 * secret (`whsec_<base64>`). The timestamp is checked as well, so a captured
 * request cannot be replayed next week.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export const verifySvixSignature = async (
  request: { headers?: Record<string, string>; rawBody: string },
  secret: string,
  nowSeconds: number = Date.now() / 1000,
): Promise<boolean> => {
  const id = request.headers?.["svix-id"];
  const timestamp = request.headers?.["svix-timestamp"];
  const signatures = request.headers?.["svix-signature"];
  if (!secret || !id || !timestamp || !signatures) return false;

  const sentAt = Number(timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(nowSeconds - sentAt) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const keyBytes = bytesOf(secret.replace(/^whsec_/, ""));
  if (!keyBytes || keyBytes.length === 0) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${request.rawBody}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));

  const matches = await Promise.all(
    signatures
      .split(" ")
      .filter((signature) => signature.startsWith("v1,"))
      .map((signature) => timingSafeEqual(signature.slice(3), expected)),
  );
  return matches.includes(true);
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const EVENT_TYPES: Record<string, EmailProviderEvent["type"]> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  // Resend refused to send because the address is on ITS suppression list:
  // for the CRM that is an address that cannot be written to.
  "email.suppressed": "bounced",
  "email.complained": "complained",
};

/**
 * Delivered, bounced, suppressed and complained. Anything else -- sent,
 * delayed, opened, clicked -- is not recorded.
 *
 * The CRM sends one message to one recipient, so type, message and recipient
 * name an event for good: a replay builds the same id.
 * https://resend.com/docs/dashboard/webhooks/event-types
 */
const parseWebhook = (payload: unknown): EmailProviderEvent | null => {
  if (payload == null || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const type = EVENT_TYPES[String(record.type)];
  const data = (record.data ?? null) as Record<string, unknown> | null;
  const messageId = text(data?.email_id);
  if (!type || !data || !messageId) return null;

  const recipient = Array.isArray(data.to) ? text(data.to[0]) : text(data.to);
  const bounce = (data.bounce ?? null) as Record<string, unknown> | null;
  const isSuppressed = record.type === "email.suppressed";

  return {
    eventId: `${String(record.type).slice("email.".length)}:${messageId}:${(recipient ?? "").toLowerCase()}`,
    messageId,
    type,
    recipient,
    occurredAt: text(record.created_at),
    permanent: isSuppressed || bounce?.type === "Permanent",
    detail: text(bounce?.message) ?? (isSuppressed ? "suppressed" : null),
  };
};

export const resendProvider: EmailProvider = {
  key: "resend",
  needsCredentials: true,
  send,
  verifyWebhook: verifySvixSignature,
  parseWebhook,
};
