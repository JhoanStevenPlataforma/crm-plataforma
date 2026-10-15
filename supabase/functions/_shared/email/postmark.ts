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
 * Postmark, over its HTTP API.
 *
 * The CRM already receives mail through Postmark (`functions/postmark`), so
 * sending through it means one account and one sender reputation.
 */

const ENDPOINT = "https://api.postmarkapp.com/email";
const TIMEOUT_MS = 15000;
const MAX_ERROR_LENGTH = 300;

// Postmark's own error codes for an address it will not deliver to: asking
// again changes nothing. https://postmarkapp.com/developer/api/overview#error-codes
const INVALID_RECIPIENT = 300;
const INACTIVE_RECIPIENT = 406;

type PostmarkAnswer = {
  MessageID?: string;
  Message?: string;
  ErrorCode?: number;
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

const classify = (status: number, answer: PostmarkAnswer): SendResult => {
  const message = answer?.Message ?? `postmark responded ${status}`;
  if (status === 401 || status === 403) {
    return refuse(false, "provider_unauthorized", message);
  }
  if (status === 429 || status >= 500) {
    return refuse(true, "provider_unavailable", message);
  }
  if (answer?.ErrorCode === INACTIVE_RECIPIENT) {
    return refuse(false, "recipient_inactive", message);
  }
  if (answer?.ErrorCode === INVALID_RECIPIENT) {
    return refuse(false, "recipient_invalid", message);
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
        "X-Postmark-Server-Token": credentials,
      },
      body: JSON.stringify({
        From: formatAddress(email.from),
        To: formatAddress(email.to),
        ...(email.replyTo && isValidEmail(email.replyTo)
          ? { ReplyTo: email.replyTo }
          : {}),
        Subject: email.subject,
        TextBody: email.textBody,
        ...(email.htmlBody ? { HtmlBody: email.htmlBody } : {}),
        MessageStream: email.messageStream || "outbound",
        // Link tracking rewrites every URL through Postmark's redirector,
        // which would hand it the customer's quotation link. Never.
        TrackLinks: "None",
        TrackOpens: false,
      }),
      signal: controller.signal,
    });

    const answer = (await response.json().catch(() => null)) as PostmarkAnswer;
    if (!response.ok || (answer?.ErrorCode ?? 0) !== 0) {
      return classify(response.status, answer);
    }
    return { ok: true, providerMessageId: answer?.MessageID ?? null };
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

/**
 * Postmark does not sign its webhooks. What it offers is HTTP basic auth: the
 * webhook URL is registered as `https://<user>:<password>@…/email-webhook`
 * and every call carries that pair. The stored secret is the pair itself,
 * `user:password`, compared in constant time.
 */
const verifyWebhook = (
  request: { authorization: string | null },
  secret: string,
): Promise<boolean> => {
  if (!secret || !request.authorization) return Promise.resolve(false);
  return timingSafeEqual(request.authorization, `Basic ${btoa(secret)}`);
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * Delivery, Bounce and SpamComplaint, the three record types that say what
 * became of a message. Anything else -- opens, clicks, subscription changes --
 * is not recorded.
 *
 * The event id must not change between two deliveries of the same event: a
 * bounce and a complaint have their own `ID`; a delivery has none, and there
 * is exactly one per message and recipient.
 * https://postmarkapp.com/developer/webhooks/webhooks-overview
 */
const parseWebhook = (payload: unknown): EmailProviderEvent | null => {
  if (payload == null || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const messageId = text(record.MessageID);

  if (record.RecordType === "Delivery") {
    const recipient = text(record.Recipient);
    if (!messageId) return null;
    return {
      eventId: `delivery:${messageId}:${(recipient ?? "").toLowerCase()}`,
      messageId,
      type: "delivered",
      recipient,
      occurredAt: text(record.DeliveredAt),
      permanent: false,
      detail: null,
    };
  }

  if (record.RecordType === "Bounce" || record.RecordType === "SpamComplaint") {
    const id = record.ID;
    if (typeof id !== "number" && typeof id !== "string") return null;
    const isComplaint =
      record.RecordType === "SpamComplaint" || record.Type === "SpamComplaint";
    return {
      // The message id rides along because Postmark's bounce ids are 64-bit:
      // past 2^53 `JSON.parse` rounds them, and two bounces could round to
      // the same number. Two bounces of the SAME message cannot.
      eventId: `${isComplaint ? "complaint" : "bounce"}:${id}:${messageId ?? ""}`,
      messageId,
      type: isComplaint ? "complained" : "bounced",
      recipient: text(record.Email),
      occurredAt: text(record.BouncedAt),
      // `Inactive` is Postmark saying it will not send to the address again.
      permanent: record.Type === "HardBounce" || record.Inactive === true,
      detail: text(record.Description) ?? text(record.Name),
    };
  }

  return null;
};

export const postmarkProvider: EmailProvider = {
  key: "postmark",
  needsCredentials: true,
  send,
  verifyWebhook,
  parseWebhook,
};
