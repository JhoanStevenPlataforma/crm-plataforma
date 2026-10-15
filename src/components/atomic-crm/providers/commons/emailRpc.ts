/**
 * The refusals of the outbound-email RPCs (docs/proposals/outbound-email.md),
 * matched on the key the database puts in the exception's DETAIL -- never on
 * the message (the rule `quoteRpc.ts` states). Every key here is asserted as
 * `sqlstate:detail` in `email_queue.test.sql` / `email_quote.test.sql`.
 */

import type { EmailQuoteBlock } from "../../types";

export const EMAIL_ERROR = {
  /** The caller may not read the record, or the action is not their role's. */
  forbidden: "email_forbidden",
  entityInvalid: "email_entity_invalid",
  /** Outbound email is switched off. */
  disabled: "email_disabled",
  /** The real provider has no sender address or no credentials. */
  notConfigured: "email_not_configured",
  recipientInvalid: "email_recipient_invalid",
  /** A free address, typed by somebody who is not a manager or an admin. */
  recipientNotAllowed: "email_recipient_not_allowed",
  /** The address bounced for good, or its owner reported a message as spam. */
  recipientSuppressed: "email_recipient_suppressed",
  subjectInvalid: "email_subject_invalid",
  bodyInvalid: "email_body_invalid",
  /** A `{{variable}}` nobody filled would reach the customer. */
  unresolvedVariable: "email_unresolved_variable",
  templateInvalid: "email_template_invalid",
  rateLimited: "email_rate_limited",
  /** The same message to the same address minutes ago: confirm to send. */
  duplicateRecent: "email_duplicate_recent",
  /** The version is not the live, issued offer. `hint` says why. */
  quoteNotShareable: "email_quote_not_shareable",
  notRetryable: "email_not_retryable",
  idempotencyRequired: "email_idempotency_required",
  templateUnknownVariable: "email_template_unknown_variable",
  templateLocked: "email_template_locked",
  settingsColumnProtected: "email_settings_column_protected",
} as const;

export type EmailErrorKey = (typeof EMAIL_ERROR)[keyof typeof EMAIL_ERROR];

const KNOWN_KEYS = new Set<string>(Object.values(EMAIL_ERROR));

export class EmailRpcError extends Error {
  readonly key: EmailErrorKey | null;
  /** For `quoteNotShareable`: the reason the server gave. */
  readonly block: EmailQuoteBlock | null;

  constructor(
    message: string,
    key: EmailErrorKey | null,
    block: EmailQuoteBlock | null = null,
  ) {
    super(message);
    this.name = "EmailRpcError";
    this.key = key;
    this.block = block;
  }
}

type PostgrestLikeError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export const emailRpcError = (
  error: PostgrestLikeError | null | undefined,
  fallbackMessage: string,
): EmailRpcError => {
  const details = error?.details ?? "";
  const key = KNOWN_KEYS.has(details) ? (details as EmailErrorKey) : null;
  return new EmailRpcError(
    error?.message || fallbackMessage,
    key,
    key === EMAIL_ERROR.quoteNotShareable && error?.hint
      ? (error.hint as EmailQuoteBlock)
      : null,
  );
};

/** The translation key for a refusal, or the generic sentence. */
export const emailErrorMessage = (error: unknown): string => {
  if (error instanceof EmailRpcError) {
    if (error.key === EMAIL_ERROR.quoteNotShareable && error.block) {
      return `crm.email.quote_block.${error.block}`;
    }
    if (error.key) return `crm.email.errors.${error.key}`;
  }
  // A plain write refused by a guard trigger arrives as an ordinary error
  // whose body still carries the key.
  const details = (error as { body?: { details?: string } } | null)?.body
    ?.details;
  if (details && KNOWN_KEYS.has(details)) {
    return `crm.email.errors.${details}`;
  }
  return "crm.email.errors.generic";
};
