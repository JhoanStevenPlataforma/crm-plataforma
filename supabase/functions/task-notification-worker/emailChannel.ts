import type { EmailMessage } from "./notificationMessage.ts";

/**
 * Outbound email over Postmark (§9.4).
 *
 * The repo already talks to Postmark for INBOUND mail (`functions/postmark`),
 * so outbound reuses the same account rather than introducing a second
 * provider — one set of credentials, one deliverability reputation.
 */

const POSTMARK_ENDPOINT = "https://api.postmarkapp.com/email";

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
  try {
    const response = await fetch(POSTMARK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": config.serverToken,
      },
      body: JSON.stringify({
        From: config.fromEmail,
        To: message.to,
        Subject: message.subject,
        TextBody: message.textBody,
        MessageStream: config.messageStream,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      MessageID?: string;
      Message?: string;
      ErrorCode?: number;
    } | null;

    if (!response.ok || (payload?.ErrorCode ?? 0) !== 0) {
      return {
        ok: false,
        error: payload?.Message ?? `postmark responded ${response.status}`,
      };
    }

    return { ok: true, providerMessageId: payload?.MessageID ?? null };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown send error",
    };
  }
};
