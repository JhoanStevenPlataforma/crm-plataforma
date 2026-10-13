import { describe, expect, it } from "vitest";

import { resendProvider, verifySvixSignature } from "./resend.ts";
import type { FetchLike, OutboundEmail } from "./types.ts";

type Call = { url: string; headers: Record<string, string>; body: any };

/** Resend's HTTP API, answering what the test tells it to. */
const respond = (
  ...responses: Array<{ status: number; body?: unknown } | Error>
): { fetchImpl: FetchLike; calls: Call[] } => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({
      url,
      headers: init?.headers ?? {},
      body: JSON.parse(init?.body ?? "{}"),
    });
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
  return { fetchImpl, calls };
};

const email: OutboundEmail = {
  from: { email: "ventas@crm.test", name: "Ventas" },
  to: { email: "ana@cliente.test", name: "Ana Compras" },
  replyTo: "olga@crm.test",
  subject: "Cotización Q-2026-00001",
  textBody: "Hola",
  htmlBody: "<p>Hola</p>",
  messageStream: "outbound",
};

// Svix's own published test vector.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
const SVIX = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  rawBody: '{"test": 2432232314}',
  now: 1614265330,
  headers: {
    "svix-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
    "svix-timestamp": "1614265330",
    "svix-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
  },
};

const bounced = {
  type: "email.bounced",
  created_at: "2026-10-13T15:05:00.000Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    to: ["Nadie@Cliente.test"],
    bounce: {
      message: "mailbox unavailable",
      subType: "General",
      type: "Permanent",
    },
  },
};

describe("the Resend provider", () => {
  it("sends the message with the key as a bearer token and returns Resend's id", async () => {
    // Arrange
    const { fetchImpl, calls } = respond({
      status: 200,
      body: { id: "re-123" },
    });

    // Act
    const result = await resendProvider.send(email, "re_key", fetchImpl);

    // Assert
    expect(result).toEqual({ ok: true, providerMessageId: "re-123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].headers.Authorization).toBe("Bearer re_key");
    expect(calls[0].body).toEqual({
      from: '"Ventas" <ventas@crm.test>',
      to: ['"Ana Compras" <ana@cliente.test>'],
      reply_to: "olga@crm.test",
      subject: "Cotización Q-2026-00001",
      text: "Hola",
      html: "<p>Hola</p>",
    });
  });

  it("calls a 503 and a rate limit retryable", async () => {
    for (const answer of [
      { status: 503, body: { name: "service_unavailable", message: "down" } },
      { status: 429, body: { name: "rate_limit_exceeded", message: "slow" } },
    ]) {
      const { fetchImpl } = respond(answer);

      const result = await resendProvider.send(email, "re_key", fetchImpl);

      expect(result).toMatchObject({
        ok: false,
        retryable: true,
        code: "provider_unavailable",
      });
    }
  });

  it("calls an exhausted quota final: asking again in a minute changes nothing", async () => {
    const { fetchImpl } = respond({
      status: 429,
      body: { name: "daily_quota_exceeded", message: "Daily quota reached" },
    });

    const result = await resendProvider.send(email, "re_key", fetchImpl);

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "provider_rejected",
      message: "Daily quota reached",
    });
  });

  it("calls a rejected key final, whichever status carries it", async () => {
    for (const answer of [
      { status: 401, body: { name: "missing_api_key", message: "no key" } },
      { status: 403, body: { name: "invalid_api_key", message: "bad key" } },
    ]) {
      const { fetchImpl } = respond(answer);

      const result = await resendProvider.send(email, "re_key", fetchImpl);

      expect(result).toMatchObject({
        ok: false,
        retryable: false,
        code: "provider_unauthorized",
      });
    }
  });

  it("reports an unverified domain as a refusal, with Resend's reason, not as a bad key", async () => {
    const { fetchImpl } = respond({
      status: 403,
      body: {
        name: "validation_error",
        message: "The crm.test domain is not verified.",
      },
    });

    const result = await resendProvider.send(email, "re_key", fetchImpl);

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "provider_rejected",
      message: "The crm.test domain is not verified.",
    });
  });

  it("calls a network failure retryable: nobody knows whether it left", async () => {
    const { fetchImpl } = respond(new Error("socket hang up"));

    const result = await resendProvider.send(email, "re_key", fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      code: "provider_unreachable",
    });
  });

  it("calls nobody without credentials, or with an address that carries a header", async () => {
    const { fetchImpl, calls } = respond();

    const noKey = await resendProvider.send(email, null, fetchImpl);
    const injected = await resendProvider.send(
      { ...email, to: { email: "ana@cliente.test\nBcc: x@y.test" } },
      "re_key",
      fetchImpl,
    );

    expect(noKey).toMatchObject({ ok: false, code: "email_not_configured" });
    expect(injected).toMatchObject({ ok: false, code: "recipient_invalid" });
    expect(calls).toHaveLength(0);
  });
});

describe("a Resend webhook's signature", () => {
  it("accepts Svix's published test vector", async () => {
    expect(await verifySvixSignature(SVIX, SVIX.secret, SVIX.now)).toBe(true);
  });

  it("accepts a request that carries a second, older signature beside the right one", async () => {
    const request = {
      ...SVIX,
      headers: {
        ...SVIX.headers,
        "svix-signature": `v1,AAAA ${SVIX.headers["svix-signature"]}`,
      },
    };

    expect(await verifySvixSignature(request, SVIX.secret, SVIX.now)).toBe(
      true,
    );
  });

  it.each([
    ["a body that changed", { rawBody: '{"test": 1}' }, SVIX.secret, SVIX.now],
    ["another secret", {}, "whsec_c2VjcmV0", SVIX.now],
    ["no secret", {}, "", SVIX.now],
    ["no signature headers", { headers: {} }, SVIX.secret, SVIX.now],
    ["a request replayed an hour later", {}, SVIX.secret, SVIX.now + 3600],
    [
      "a timestamp that is not a number",
      { headers: { ...SVIX.headers, "svix-timestamp": "now" } },
      SVIX.secret,
      SVIX.now,
    ],
  ])("refuses %s", async (_name, overrides, secret, now) => {
    expect(
      await verifySvixSignature({ ...SVIX, ...overrides }, secret, now),
    ).toBe(false);
  });
});

describe("a Resend webhook's event", () => {
  const parse = resendProvider.parseWebhook!;

  it("reads a permanent bounce, under an id that is stable across replays", () => {
    expect(parse(bounced)).toEqual({
      eventId:
        "bounced:56761188-7520-42d8-8898-ff6fc54ce618:nadie@cliente.test",
      messageId: "56761188-7520-42d8-8898-ff6fc54ce618",
      type: "bounced",
      recipient: "Nadie@Cliente.test",
      occurredAt: "2026-10-13T15:05:00.000Z",
      permanent: true,
      detail: "mailbox unavailable",
    });
    expect(parse(bounced)?.eventId).toBe(parse(bounced)?.eventId);
  });

  it("does not call a temporary bounce permanent", () => {
    const event = parse({
      ...bounced,
      data: {
        ...bounced.data,
        bounce: { ...bounced.data.bounce, type: "Temporary" },
      },
    });

    expect(event).toMatchObject({ type: "bounced", permanent: false });
  });

  it("reads a delivery and a spam complaint", () => {
    const data = { email_id: "re-1", to: ["ana@cliente.test"] };

    expect(parse({ type: "email.delivered", data })).toMatchObject({
      eventId: "delivered:re-1:ana@cliente.test",
      type: "delivered",
      permanent: false,
      detail: null,
    });
    expect(parse({ type: "email.complained", data })).toMatchObject({
      eventId: "complained:re-1:ana@cliente.test",
      type: "complained",
    });
  });

  it("reads an address Resend suppressed as one that cannot be written to", () => {
    const event = parse({
      type: "email.suppressed",
      data: { email_id: "re-2", to: ["nadie@cliente.test"] },
    });

    expect(event).toMatchObject({
      eventId: "suppressed:re-2:nadie@cliente.test",
      type: "bounced",
      permanent: true,
    });
  });

  it("ignores what the CRM does not record, and an event with no message id", () => {
    const data = { email_id: "re-1", to: ["ana@cliente.test"] };

    expect(parse({ type: "email.sent", data })).toBeNull();
    expect(parse({ type: "email.opened", data })).toBeNull();
    expect(
      parse({ type: "email.delivered", data: { to: data.to } }),
    ).toBeNull();
    expect(parse("email.delivered")).toBeNull();
  });
});
