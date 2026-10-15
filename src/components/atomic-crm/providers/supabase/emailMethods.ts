/**
 * Outbound email as data-provider methods
 * (docs/proposals/outbound-email.md). The demo mirror implements the same
 * `EmailMethods` contract (`fakerest/email.ts`).
 *
 * Refusals become an `EmailRpcError` carrying the key from the exception's
 * DETAIL, never the message (`providers/commons/emailRpc.ts`).
 */

import type { Identifier } from "ra-core";

import type {
  EmailContext,
  EmailEntityType,
  EmailMessage,
  EmailServiceStatus,
  SendEmailInput,
} from "../../types";
import { emailRpcError } from "../commons/emailRpc";

export type EmailMethods = {
  /** `email_status()`: is mail on, and is it only simulated. */
  getEmailStatus(): Promise<EmailServiceStatus>;
  /** `email_context()`: recipients, variables and, for a quote, what is shareable. */
  getEmailContext(
    entityType: EmailEntityType,
    entityId: Identifier,
  ): Promise<EmailContext>;
  /**
   * Queues the message, asks the dispatcher to send it now, and returns the
   * row as it stands afterwards. A dispatcher that could not be reached is not
   * an error: the message is queued, and the scheduled tick sends it.
   */
  sendEmail(input: SendEmailInput): Promise<EmailMessage>;
  /** Queues a FAILED message again: the same row. */
  retryEmail(messageId: Identifier): Promise<EmailMessage>;
  /** `email_template_variables()`: what a template of this scope may name. */
  getEmailTemplateVariables(scope: string): Promise<string[]>;
  /** Stores a secret in Vault (admins); an empty value clears it. */
  setEmailProviderSecret(
    kind: "credentials" | "webhook",
    secret: string,
  ): Promise<void>;
};

/** The parts of the Supabase client these methods use. */
export type EmailClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      message?: string | null;
      details?: string | null;
      hint?: string | null;
    } | null;
  }>;
  functions: {
    invoke: (
      name: string,
      options: { method?: "POST"; body?: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

/**
 * The zone the sender reads dates in. The issue date of a quotation is a
 * timestamp, and the server needs to know whose calendar to read it on.
 */
const browserTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

export const createEmailMethods = (
  getClient: () => EmailClient,
  /** Reads one message back, through the provider (and so through RLS). */
  getMessage: (id: Identifier) => Promise<EmailMessage>,
): EmailMethods => {
  const call = async <T>(
    fn: string,
    args: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<T> => {
    const { data, error } = await getClient().rpc(fn, args);
    if (error) {
      throw emailRpcError(error, fallbackMessage);
    }
    return data as T;
  };

  const dispatch = async (messageId: Identifier): Promise<EmailMessage> => {
    try {
      await getClient().functions.invoke("email-dispatch", {
        method: "POST",
        body: { message_id: messageId },
      });
    } catch {
      // Queued is queued: the tick will send it, and the row says "pending".
    }
    return getMessage(messageId);
  };

  return {
    getEmailStatus: () =>
      call<EmailServiceStatus>(
        "email_status",
        {},
        "Failed to read the email status",
      ),

    getEmailContext: (entityType, entityId) =>
      call<EmailContext>(
        "email_context",
        {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_timezone: browserTimeZone(),
        },
        "Failed to prepare the message",
      ),

    sendEmail: async (input) => {
      const common = {
        p_to_email: input.toEmail,
        p_to_name: input.toName ?? null,
        p_subject: input.subject,
        p_body: input.body,
        p_template_id: input.templateId ?? null,
        p_language: input.language ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_confirm_duplicate: input.confirmDuplicate ?? false,
      };
      const queued =
        input.entityType === "quote"
          ? await call<EmailMessage>(
              "queue_quote_email",
              {
                ...common,
                p_quote_id: input.entityId,
                p_version_id: input.quoteVersionId ?? null,
                p_timezone: browserTimeZone(),
              },
              "Failed to queue the message",
            )
          : await call<EmailMessage>(
              "queue_email",
              {
                ...common,
                p_entity_type: input.entityType,
                p_entity_id: input.entityId,
              },
              "Failed to queue the message",
            );
      return dispatch(queued.id);
    },

    retryEmail: async (messageId) => {
      const queued = await call<EmailMessage>(
        "retry_email_message",
        { p_id: messageId },
        "Failed to retry the message",
      );
      return dispatch(queued.id);
    },

    getEmailTemplateVariables: (scope) =>
      call<string[]>(
        "email_template_variables",
        { p_scope: scope },
        "Failed to read the template variables",
      ),

    setEmailProviderSecret: (kind, secret) =>
      call<void>(
        "set_email_provider_secret",
        { p_kind: kind, p_secret: secret },
        "Failed to store the secret",
      ),
  };
};
