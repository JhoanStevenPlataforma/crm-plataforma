import {
  fillTemplate,
  type EmailVariables,
} from "../_shared/email/fillTemplate.ts";
import {
  emailIconUrl,
  emailLanguage,
  renderEmail,
  type EmailQuoteSummary,
} from "../_shared/email/renderEmail.ts";
import type {
  EmailProviderRegistry,
  FetchLike,
  SendResult,
} from "../_shared/email/types.ts";

/**
 * Sending what the outbox holds (docs/proposals/outbound-email.md).
 *
 * Pure of any runtime: the database (`rpc`), the provider registry, the
 * network (`fetchImpl`) and the secret reader are all handed in, so every
 * decision below -- what is retried, what is final, what is merely simulated --
 * is tested without a database, a provider or a mail leaving.
 */

export type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** One row of `claim_email_messages()`. */
export interface ClaimedEmail {
  id: number;
  attempt: number;
  provider_key: string;
  category: string;
  language: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_text: string;
  /**
   * What the record said when the message was queued: for a quotation, the
   * figures of the version shared. An automation's text is filled from it.
   */
  variables: (EmailVariables & EmailQuoteSummary) | null;
  quote_id: number | null;
  quote_version_id: number | null;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  message_stream: string | null;
  issuer_name: string | null;
  logo_url: string | null;
}

export interface DispatchDeps {
  rpc: Rpc;
  registry: EmailProviderRegistry;
  fetchImpl: FetchLike;
  /** The provider's API token, from Vault. */
  readSecret: () => Promise<string | null>;
  /** The CRM's public address, e.g. `https://crm.example.com`. */
  baseUrl: string;
}

export type DispatchStatus = "accepted" | "simulated" | "failed" | "retrying";

export interface DispatchSummary {
  claimed: number;
  accepted: number;
  simulated: number;
  failed: number;
  retrying: number;
}

/** What a mail to nobody is sent from, when the simulated provider runs. */
const SIMULATED_SENDER = "simulated@crm.invalid";

/**
 * The customer's address of a quotation. The app runs on a hash router and
 * the token rides in a SECOND fragment (`quotes/portal/quotePortalPaths.ts`),
 * which no server ever receives.
 */
export const quotePortalUrl = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/#/quote#${token}`;

const failure = (
  code: string,
  message: string,
  retryable = false,
): SendResult => ({ ok: false, retryable, code, message });

const send = async (
  message: ClaimedEmail,
  deps: DispatchDeps,
): Promise<{ result: SendResult; secrets: string[] }> => {
  const provider = deps.registry[message.provider_key];
  if (!provider) {
    return {
      result: failure(
        "email_provider_unknown",
        `no provider '${message.provider_key}' in this deployment`,
      ),
      secrets: [],
    };
  }

  let quoteLink: string | null = null;
  const secrets: string[] = [];
  if (message.quote_version_id != null) {
    if (!deps.baseUrl) {
      return {
        result: failure("email_base_url_missing", "CRM_BASE_URL is not set"),
        secrets,
      };
    }
    const { data: token, error } = await deps.rpc("email_message_quote_token", {
      p_message_id: message.id,
    });
    if (error) {
      // The database did not answer: nothing was decided, try again.
      return {
        result: failure("email_link_unavailable", error.message, true),
        secrets,
      };
    }
    if (typeof token !== "string" || token === "") {
      return {
        result: failure(
          "email_quote_link_missing",
          "the quotation has no live customer link",
        ),
        secrets,
      };
    }
    secrets.push(token);
    quoteLink = quotePortalUrl(deps.baseUrl, token);
  }

  const credentials = provider.needsCredentials
    ? await deps.readSecret()
    : null;
  if (provider.needsCredentials) {
    if (!credentials || !message.from_email) {
      return {
        result: failure(
          "email_not_configured",
          "the provider has no credentials or no sender address",
        ),
        secrets,
      };
    }
    secrets.push(credentials);
  }

  // A person's message arrives filled (the queue refuses leftover braces);
  // an automation's is the template itself, filled here from the snapshot.
  const language = emailLanguage(message.language);
  const variables = message.variables ?? {};
  const subject = fillTemplate(message.subject, variables, language)
    .replace(/\s+/g, " ")
    .trim();

  const rendered = renderEmail({
    bodyText: fillTemplate(message.body_text, variables, language),
    language: message.language,
    // An installation with no title still signs its mail: the sender's name.
    issuerName: message.issuer_name ?? message.from_name,
    logoUrl: message.logo_url,
    iconUrl: emailIconUrl(deps.baseUrl),
    quoteLink,
    quote: message.quote_version_id != null ? message.variables : null,
  });

  try {
    const result = await provider.send(
      {
        from: {
          email: message.from_email ?? SIMULATED_SENDER,
          name: message.from_name,
        },
        to: { email: message.to_email, name: message.to_name },
        replyTo: message.reply_to,
        subject,
        textBody: rendered.text,
        htmlBody: rendered.html,
        messageStream: message.message_stream,
      },
      credentials,
      deps.fetchImpl,
    );
    return { result, secrets };
  } catch (error: unknown) {
    return {
      result: failure(
        "provider_unreachable",
        error instanceof Error ? error.message : "unknown send error",
        true,
      ),
      secrets,
    };
  }
};

/**
 * A provider's error text is stored and shown to the team. It must never be
 * the way a customer link or an API token reaches a table.
 */
const redact = (text: string, secrets: string[]): string =>
  secrets.reduce(
    (clean, secret) =>
      secret ? clean.split(secret).join("[redacted]") : clean,
    text,
  );

/** Send one claimed message and record what happened. */
export const dispatchMessage = async (
  message: ClaimedEmail,
  deps: DispatchDeps,
): Promise<DispatchStatus> => {
  const { result, secrets } = await send(message, deps);

  const status = result.ok
    ? result.simulated
      ? "simulated"
      : "accepted"
    : "failed";

  const { data, error } = await deps.rpc("complete_email_message", {
    p_id: message.id,
    p_status: status,
    p_provider_message_id: result.ok ? result.providerMessageId : null,
    p_error_code: result.ok ? null : result.code,
    p_error: result.ok ? null : redact(result.message, secrets),
    p_retryable: result.ok ? false : result.retryable,
  });
  if (error) {
    // The row stays `processing`. `fail_stale_email_messages()` will fail it
    // visibly rather than send it twice: see that function.
    throw new Error(`could not settle email message ${message.id}`);
  }

  const settled = (data as { status?: string } | null)?.status;
  if (settled === "pending") return "retrying";
  return status;
};

/** Claim what is due (or one message) and send it, one at a time. */
export const dispatchBatch = async (
  options: { messageId?: number | null; limit?: number },
  deps: DispatchDeps,
): Promise<DispatchSummary> => {
  const { data, error } = await deps.rpc("claim_email_messages", {
    p_limit: options.limit ?? 20,
    p_message_id: options.messageId ?? null,
  });
  if (error) {
    throw new Error(`could not claim email messages: ${error.message}`);
  }

  const claimed = (Array.isArray(data) ? data : []) as ClaimedEmail[];
  const summary: DispatchSummary = {
    claimed: claimed.length,
    accepted: 0,
    simulated: 0,
    failed: 0,
    retrying: 0,
  };

  for (const message of claimed) {
    try {
      summary[await dispatchMessage(message, deps)] += 1;
    } catch {
      // Unsettled: counted as failed here, resolved by the stale sweep.
      summary.failed += 1;
    }
  }
  return summary;
};
