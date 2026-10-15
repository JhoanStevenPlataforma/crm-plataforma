import { describe, expect, it } from "vitest";

import { mockProvider } from "../_shared/email/mock.ts";
import { postmarkProvider } from "../_shared/email/postmark.ts";
import type { FetchLike } from "../_shared/email/types.ts";
import {
  dispatchBatch,
  quotePortalUrl,
  type ClaimedEmail,
  type DispatchDeps,
  type Rpc,
} from "./dispatchMessage.ts";

const TOKEN = "f".repeat(64);
const SERVER_TOKEN = "postmark-server-token";

const claimed = (overrides: Partial<ClaimedEmail> = {}): ClaimedEmail => ({
  id: 1,
  attempt: 1,
  provider_key: "postmark",
  category: "transactional",
  language: "es",
  to_email: "ana@cliente.test",
  to_name: "Ana Compras",
  subject: "Cotización Q-2026-00001",
  body_text: "Hola Ana:\n\n{{quote_link}}",
  variables: { quote_number: "Q-2026-00001", total: "300.00", currency: "COP" },
  quote_id: 10,
  quote_version_id: 100,
  from_email: "ventas@crm.test",
  from_name: "Ventas",
  reply_to: "olga@crm.test",
  message_stream: "outbound",
  issuer_name: "Acme",
  logo_url: null,
  ...overrides,
});

type Sent = { url: string; body: any };

/** The database and the provider, both in memory. */
const stage = (options: {
  messages: ClaimedEmail[];
  responses?: Array<{ status: number; body?: unknown } | Error>;
  token?: string | null;
  settleStatus?: (args: Record<string, unknown>) => string;
  failSettle?: boolean;
}) => {
  const sent: Sent[] = [];
  const settled: Array<Record<string, unknown>> = [];
  const responses = [...(options.responses ?? [])];

  const fetchImpl: FetchLike = (url, init) => {
    sent.push({ url, body: JSON.parse(init?.body ?? "{}") });
    const next = responses.shift();
    if (next instanceof Error || next === undefined) {
      return Promise.reject(next ?? new Error("no response configured"));
    }
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    });
  };

  const rpc: Rpc = async (fn, args = {}) => {
    if (fn === "claim_email_messages") {
      return { data: options.messages, error: null };
    }
    if (fn === "email_message_quote_token") {
      return {
        data: options.token === undefined ? TOKEN : options.token,
        error: null,
      };
    }
    if (fn === "complete_email_message") {
      if (options.failSettle) {
        return { data: null, error: { message: "database unreachable" } };
      }
      settled.push(args);
      const status =
        options.settleStatus?.(args) ??
        (args.p_status === "failed" && args.p_retryable
          ? "pending"
          : (args.p_status as string));
      return { data: { status }, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  };

  const deps: DispatchDeps = {
    rpc,
    registry: { mock: mockProvider, postmark: postmarkProvider },
    fetchImpl,
    readSecret: async () => SERVER_TOKEN,
    baseUrl: "https://crm.test/",
  };
  return { deps, sent, settled };
};

describe("the customer link", () => {
  it("is the portal's address on the hash router, the token in its own fragment", () => {
    expect(quotePortalUrl("https://crm.test/", TOKEN)).toBe(
      `https://crm.test/#/quote#${TOKEN}`,
    );
  });
});

describe("dispatching the outbox", () => {
  it("sends a quotation with its link and records that the provider accepted it", async () => {
    // Arrange
    const { deps, sent, settled } = stage({
      messages: [claimed()],
      responses: [{ status: 200, body: { MessageID: "pm-1", ErrorCode: 0 } }],
    });

    // Act
    const summary = await dispatchBatch({ messageId: 1 }, deps);

    // Assert
    expect(summary).toEqual({
      claimed: 1,
      accepted: 1,
      simulated: 0,
      failed: 0,
      retrying: 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].body.TextBody).toContain(
      `https://crm.test/#/quote#${TOKEN}`,
    );
    expect(sent[0].body.HtmlBody).toContain("Q-2026-00001");
    expect(sent[0].body.ReplyTo).toBe("olga@crm.test");
    expect(settled).toEqual([
      {
        p_id: 1,
        p_status: "accepted",
        p_provider_message_id: "pm-1",
        p_error_code: null,
        p_error: null,
        p_retryable: false,
      },
    ]);
  });

  it("never reports a simulated send as accepted, and calls no network", async () => {
    const { deps, sent, settled } = stage({
      messages: [claimed({ provider_key: "mock", from_email: null })],
    });

    const summary = await dispatchBatch({}, deps);

    expect(summary).toMatchObject({ simulated: 1, accepted: 0 });
    expect(sent).toHaveLength(0);
    expect(settled[0]).toMatchObject({
      p_status: "simulated",
      p_provider_message_id: null,
    });
  });

  it("hands a transient provider failure back to the queue", async () => {
    const { deps, settled } = stage({
      messages: [claimed()],
      responses: [{ status: 503, body: { Message: "Service unavailable" } }],
    });

    const summary = await dispatchBatch({}, deps);

    expect(summary).toMatchObject({ retrying: 1, failed: 0, accepted: 0 });
    expect(settled[0]).toMatchObject({
      p_status: "failed",
      p_error_code: "provider_unavailable",
      p_retryable: true,
    });
  });

  it("reports a retryable failure as failed once the database says the attempts ran out", async () => {
    const { deps } = stage({
      messages: [claimed({ attempt: 5 })],
      responses: [new Error("socket hang up")],
      settleStatus: () => "failed",
    });

    const summary = await dispatchBatch({}, deps);

    expect(summary).toMatchObject({ failed: 1, retrying: 0 });
  });

  it("records a permanent refusal as final", async () => {
    const { deps, settled } = stage({
      messages: [claimed()],
      responses: [
        {
          status: 422,
          body: { ErrorCode: 406, Message: "Inactive recipient" },
        },
      ],
    });

    const summary = await dispatchBatch({}, deps);

    expect(summary).toMatchObject({ failed: 1, retrying: 0 });
    expect(settled[0]).toMatchObject({
      p_status: "failed",
      p_error_code: "recipient_inactive",
      p_error: "Inactive recipient",
      p_retryable: false,
    });
  });

  it("keeps the customer link and the API token out of a recorded error", async () => {
    const { deps, settled } = stage({
      messages: [claimed()],
      responses: [
        {
          status: 422,
          body: {
            ErrorCode: 999,
            Message: `rejected body containing https://crm.test/#/quote#${TOKEN} sent with ${SERVER_TOKEN}`,
          },
        },
      ],
    });

    await dispatchBatch({}, deps);

    const recorded = JSON.stringify(settled[0]);
    expect(recorded).not.toContain(TOKEN);
    expect(recorded).not.toContain(SERVER_TOKEN);
    expect(recorded).toContain("[redacted]");
  });

  it("does not send a quotation whose link no longer exists", async () => {
    const { deps, sent, settled } = stage({
      messages: [claimed()],
      token: null,
    });

    const summary = await dispatchBatch({}, deps);

    expect(sent).toHaveLength(0);
    expect(summary).toMatchObject({ failed: 1 });
    expect(settled[0]).toMatchObject({
      p_error_code: "email_quote_link_missing",
      p_retryable: false,
    });
  });

  it("does not send a quotation when the CRM's address is unknown", async () => {
    const { deps, sent, settled } = stage({ messages: [claimed()] });

    await dispatchBatch({}, { ...deps, baseUrl: "" });

    expect(sent).toHaveLength(0);
    expect(settled[0]).toMatchObject({
      p_error_code: "email_base_url_missing",
    });
  });

  it("fails a real provider that has no credentials, without calling it", async () => {
    const { deps, sent, settled } = stage({ messages: [claimed()] });

    await dispatchBatch({}, { ...deps, readSecret: async () => null });

    expect(sent).toHaveLength(0);
    expect(settled[0]).toMatchObject({
      p_status: "failed",
      p_error_code: "email_not_configured",
      p_retryable: false,
    });
  });

  it("fails a message whose provider this deployment does not have", async () => {
    const { deps, settled } = stage({
      messages: [claimed({ provider_key: "carrier-pigeon" })],
    });

    await dispatchBatch({}, deps);

    expect(settled[0]).toMatchObject({
      p_error_code: "email_provider_unknown",
    });
  });

  it("sends a plain message with no link and no quotation summary", async () => {
    const { deps, sent } = stage({
      messages: [
        claimed({
          quote_id: null,
          quote_version_id: null,
          body_text: "Un saludo.",
          variables: { customer_name: "Ana" } as ClaimedEmail["variables"],
        }),
      ],
      responses: [{ status: 200, body: { MessageID: "pm-2", ErrorCode: 0 } }],
    });

    await dispatchBatch({}, deps);

    expect(sent[0].body.TextBody).toBe("Un saludo.");
    expect(sent[0].body.HtmlBody).not.toContain("/#/quote#");
  });

  it("fills an automation's template from the snapshot the message was queued with", async () => {
    // Arrange: what `email_automation_enqueue()` stores is the template itself.
    const { deps, sent } = stage({
      messages: [
        claimed({
          language: "en",
          subject: "Reminder: quotation {{quote_number}} from {{issuer_name}}",
          body_text:
            "Dear {{customer_name}},\n\nIssued on {{issue_date}}, for {{total}} {{currency}}.\n\n{{quote_link}}\n\n{{sender_name}}",
          variables: {
            quote_number: "Q-2026-00001",
            issuer_name: "Acme",
            customer_name: "Ana Compras",
            issue_date: "2026-10-08",
            total: "1234567.5",
            currency: "COP",
            sender_name: "Olga Ventas",
          },
        }),
      ],
      responses: [{ status: 200, body: { MessageID: "pm-3", ErrorCode: 0 } }],
    });

    // Act
    await dispatchBatch({}, deps);

    // Assert
    expect(sent[0].body.Subject).toBe(
      "Reminder: quotation Q-2026-00001 from Acme",
    );
    expect(sent[0].body.TextBody).toBe(
      `Dear Ana Compras,\n\nIssued on October 8, 2026, for 1,234,567.50 COP.\n\nhttps://crm.test/#/quote#${TOKEN}\n\nOlga Ventas`,
    );
    expect(sent[0].body.HtmlBody).not.toContain("{{");
  });

  it("never lets a customer read braces, and never reads a value as a template", async () => {
    const { deps, sent } = stage({
      messages: [
        claimed({
          subject: "Hola {{customer_name}}\n{{deal_name}}",
          body_text: "{{customer_name}} / {{valid_until}} / {{quote_link}}",
          variables: { customer_name: "{{total}}", total: "300.00" },
        }),
      ],
      responses: [{ status: 200, body: { MessageID: "pm-4", ErrorCode: 0 } }],
    });

    await dispatchBatch({}, deps);

    // One line, whatever a value carried: a subject is a header.
    expect(sent[0].body.Subject).toBe("Hola {{total}}");
    expect(sent[0].body.TextBody).toBe(
      `{{total}} /  / https://crm.test/#/quote#${TOKEN}`,
    );
  });

  it("goes on to the next message when one could not be settled", async () => {
    const { deps, sent } = stage({
      messages: [claimed({ id: 1 }), claimed({ id: 2 })],
      responses: [
        { status: 200, body: { MessageID: "a", ErrorCode: 0 } },
        { status: 200, body: { MessageID: "b", ErrorCode: 0 } },
      ],
      failSettle: true,
    });

    const summary = await dispatchBatch({}, deps);

    expect(sent).toHaveLength(2);
    expect(summary).toMatchObject({ claimed: 2, failed: 2, accepted: 0 });
  });
});
