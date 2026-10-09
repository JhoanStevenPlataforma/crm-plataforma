import { postmarkProvider } from "../_shared/email/postmark.ts";
import type { EmailMessage } from "./notificationMessage.ts";

/**
 * Outbound email over Postmark (§9.4).
 *
 * The repo already talks to Postmark for INBOUND mail (`functions/postmark`),
 * so outbound reuses the same account rather than introducing a second
 * provider — one set of credentials, one deliverability reputation.
 *
 * The request itself is the shared provider's (`_shared/email/postmark.ts`),
 * the one the customer-facing dispatcher uses: one place writes headers and
 * reads Postmark's answer.
 */

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

export type EmailConfig = {
  serverToken: string;
  fromEmail: string;
  messageStream: string;
};

/**
 * Reads the outbound configuration, or `null` when it is absent.
 *
 * A missing token is not a crash: the worker then settles email deliveries as
 * `skipped` with an explicit reason, which is visible in the timeline. Throwing
 * at boot instead would take the whole worker down and leave every other
 * channel stuck too.
 */
export const readEmailConfig = (
  env: (key: string) => string | undefined,
): EmailConfig | null => {
  const serverToken = env("POSTMARK_SERVER_TOKEN");
  const fromEmail = env("TASK_REMINDER_FROM_EMAIL");
  if (!serverToken || !fromEmail) return null;

  return {
    serverToken,
    fromEmail,
    messageStream: env("POSTMARK_MESSAGE_STREAM") ?? "outbound",
  };
};

export const sendEmail = async (
  message: EmailMessage,
  config: EmailConfig,
): Promise<SendResult> => {
  const result = await postmarkProvider.send(
    {
      from: { email: config.fromEmail },
      to: { email: message.to },
      subject: message.subject,
      textBody: message.textBody,
      messageStream: config.messageStream,
    },
    config.serverToken,
    fetch,
  );

  return result.ok
    ? { ok: true, providerMessageId: result.providerMessageId }
    : { ok: false, error: result.message };
};
