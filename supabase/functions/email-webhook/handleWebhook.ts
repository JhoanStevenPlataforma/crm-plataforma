import type { EmailProviderRegistry } from "../_shared/email/types.ts";

/**
 * A delivery webhook, from the request to the database
 * (docs/proposals/outbound-email.md).
 *
 * Pure of any runtime: the provider registry, the secret and the database
 * call are handed in, so every answer below -- who is refused, what is
 * ignored, what a replay does -- is tested without a network.
 *
 * The answers are chosen for a provider that RETRIES: 401 for a request that
 * is not the provider's (nothing is read from it), 200 for anything understood
 * including a duplicate and a record type that is not recorded, 403 for a body
 * that will never be understood (Postmark stops retrying on 403), and 5xx only
 * when trying again can help.
 */

export type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Postmark's largest payload is a few KB; this is headroom, not a target. */
export const MAX_WEBHOOK_BYTES = 64 * 1024;

export interface WebhookRequest {
  providerKey: string;
  authorization: string | null;
  rawBody: string;
}

export interface WebhookDeps {
  registry: EmailProviderRegistry;
  /** The secret the provider must present, from Vault. Null when unset. */
  readSecret: () => Promise<string | null>;
  rpc: Rpc;
}

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

const answer = (
  status: number,
  body: Record<string, unknown>,
): WebhookResponse => ({ status, body });

export const handleWebhook = async (
  request: WebhookRequest,
  deps: WebhookDeps,
): Promise<WebhookResponse> => {
  const provider = deps.registry[request.providerKey];
  if (!provider?.verifyWebhook || !provider.parseWebhook) {
    return answer(404, { message: "Unknown provider" });
  }

  // No secret configured is not "open": a webhook nobody can authenticate
  // accepts nothing. Checked before the body is looked at.
  const secret = await deps.readSecret();
  if (!secret) {
    return answer(503, { message: "The webhook is not configured" });
  }
  const isAuthentic = await provider.verifyWebhook(
    { authorization: request.authorization, rawBody: request.rawBody },
    secret,
  );
  if (!isAuthentic) {
    return answer(401, { message: "Unauthorized" });
  }

  if (new TextEncoder().encode(request.rawBody).length > MAX_WEBHOOK_BYTES) {
    return answer(403, { message: "Payload too large" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return answer(403, { message: "Invalid JSON" });
  }

  const event = provider.parseWebhook(payload);
  if (!event) {
    return answer(200, { success: true, ignored: true });
  }

  const { data, error } = await deps.rpc("record_email_event", {
    p_provider_key: provider.key,
    p_provider_event_id: event.eventId,
    p_provider_message_id: event.messageId,
    p_event_type: event.type,
    // A date the database cannot read would fail the call and be retried
    // for ever: without one the event is dated when it arrived.
    p_occurred_at:
      event.occurredAt && !Number.isNaN(Date.parse(event.occurredAt))
        ? event.occurredAt
        : null,
    p_recipient: event.recipient,
    p_is_permanent: event.permanent,
    p_detail: event.detail,
  });
  if (error) {
    // The database did not record it: the provider should try again, and the
    // event id makes that safe.
    return answer(500, { message: "The event could not be recorded" });
  }

  const outcome = (data ?? {}) as { duplicate?: boolean; matched?: boolean };
  return answer(200, {
    success: true,
    duplicate: outcome.duplicate === true,
    matched: outcome.matched === true,
  });
};
