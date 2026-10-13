import type {
  EmailProvider,
  EmailProviderRegistry,
  FetchLike,
} from "../_shared/email/types.ts";
import type { EmailMessage } from "./notificationMessage.ts";

/**
 * Outbound email to the team (§9.4), through the provider an administrator
 * configured for customer mail (docs/proposals/outbound-email.md).
 *
 * One provider, one sender address and one credential for everything the CRM
 * sends: the worker reads `email_settings` and the Vault secret behind it, the
 * same pair the customer-facing dispatcher uses. It has no configuration of
 * its own, so switching the provider in Settings switches the reminders too.
 */

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

/** The columns of `email_settings` the worker reads. */
export interface EmailSettingsRow {
  provider_key: string;
  is_enabled: boolean;
  from_email: string | null;
  from_name: string | null;
  transactional_stream: string | null;
}

export type EmailChannel =
  | {
      ready: true;
      provider: EmailProvider;
      credentials: string;
      fromEmail: string;
      fromName: string | null;
      messageStream: string | null;
    }
  | { ready: false; reason: string };

const notReady = (reason: string): EmailChannel => ({ ready: false, reason });

/**
 * What the worker may send through, or why it may not.
 *
 * A channel that is not ready is not a crash: the worker settles email
 * deliveries as `skipped` with this reason, which is visible in the timeline.
 * The simulated provider is one of those reasons -- a reminder it "sent" would
 * be recorded as sent while nothing left.
 */
export const resolveEmailChannel = (
  settings: EmailSettingsRow | null,
  credentials: string | null,
  registry: EmailProviderRegistry,
): EmailChannel => {
  if (!settings || !settings.is_enabled) {
    return notReady("outbound email is switched off");
  }
  const provider = registry[settings.provider_key];
  if (!provider) {
    return notReady(
      `no provider '${settings.provider_key}' in this deployment`,
    );
  }
  if (!provider.needsCredentials) {
    return notReady("the mail provider is the simulated one: nothing is sent");
  }
  if (!credentials || !settings.from_email) {
    return notReady(
      "the mail provider has no credentials or no sender address",
    );
  }

  return {
    ready: true,
    provider,
    credentials,
    fromEmail: settings.from_email,
    fromName: settings.from_name,
    messageStream: settings.transactional_stream,
  };
};

export const sendEmail = async (
  message: EmailMessage,
  channel: Extract<EmailChannel, { ready: true }>,
  fetchImpl: FetchLike,
): Promise<SendResult> => {
  // The reason is stored on the notification: never with the token in it.
  const failed = (reason: string): SendResult => ({
    ok: false,
    error: reason.split(channel.credentials).join("[redacted]"),
  });

  try {
    const result = await channel.provider.send(
      {
        from: { email: channel.fromEmail, name: channel.fromName },
        to: { email: message.to },
        subject: message.subject,
        textBody: message.textBody,
        messageStream: channel.messageStream,
      },
      channel.credentials,
      fetchImpl,
    );

    return result.ok
      ? { ok: true, providerMessageId: result.providerMessageId }
      : failed(result.message);
  } catch (error: unknown) {
    return failed(
      error instanceof Error ? error.message : "unknown send error",
    );
  }
};
