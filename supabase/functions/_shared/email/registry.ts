import { mockProvider } from "./mock.ts";
import { postmarkProvider } from "./postmark.ts";
import { resendProvider } from "./resend.ts";
import type { EmailProviderRegistry } from "./types.ts";

/**
 * Keyed by `email_settings.provider_key`. A key with no entry here is a
 * provider the database allows and this deployment cannot reach: the
 * dispatcher fails the message with a reason instead of guessing.
 */
export const emailProviders: EmailProviderRegistry = {
  [mockProvider.key]: mockProvider,
  [postmarkProvider.key]: postmarkProvider,
  [resendProvider.key]: resendProvider,
};
