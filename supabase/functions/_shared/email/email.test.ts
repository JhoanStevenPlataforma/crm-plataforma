import { describe, expect, it } from "vitest";

import { formatAddress, isValidEmail } from "./emailAddress.ts";
import { mockProvider } from "./mock.ts";
import { postmarkProvider } from "./postmark.ts";
import { renderEmail } from "./renderEmail.ts";
import type { FetchLike, OutboundEmail } from "./types.ts";

type Call = { url: string; headers: Record<string, string>; body: any };

/** A provider's HTTP API, answering what the test tells it to. */
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

describe("email addresses", () => {
  it("accepts an ordinary address and refuses one that could carry a header", () => {
    expect(isValidEmail("ana.compras+crm@cliente-correo.test")).toBe(true);
    expect(isValidEmail("ana@cliente.test\nBcc: x@y.test")).toBe(false);
    expect(isValidEmail("ana @cliente.test")).toBe(false);
    expect(isValidEmail('"ana"@cliente.test')).toBe(false);
    expect(isValidEmail("ana@cliente")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });

  it("drops a display name that could end the header instead of repairing it", () => {
    expect(formatAddress({ email: "a@b.test", name: "Ana Compras" })).toBe(
      '"Ana Compras" <a@b.test>',
    );
    expect(formatAddress({ email: "a@b.test", name: 'Ana" <x@y.test>' })).toBe(
      "a@b.test",
    );
    expect(formatAddress({ email: "a@b.test", name: "Ana\r\nBcc: x" })).toBe(
      "a@b.test",
    );
    expect(formatAddress({ email: "a@b.test", name: null })).toBe("a@b.test");
  });
});

describe("the Postmark provider", () => {
  it("sends the message with the token in a header and tracking switched off", async () => {
    // Arrange
    const { fetchImpl, calls } = respond({
      status: 200,
      body: { MessageID: "pm-123", ErrorCode: 0 },
    });

    // Act
    const result = await postmarkProvider.send(
      email,
      "server-token",
      fetchImpl,
    );

    // Assert
    expect(result).toEqual({ ok: true, providerMessageId: "pm-123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["X-Postmark-Server-Token"]).toBe("server-token");
    expect(calls[0].body).toMatchObject({
      From: '"Ventas" <ventas@crm.test>',
      To: '"Ana Compras" <ana@cliente.test>',
      ReplyTo: "olga@crm.test",
      Subject: "Cotización Q-2026-00001",
      TextBody: "Hola",
      HtmlBody: "<p>Hola</p>",
      MessageStream: "outbound",
      TrackLinks: "None",
      TrackOpens: false,
    });
    expect(JSON.stringify(calls[0].body)).not.toContain("server-token");
  });

  it("calls a 503 and a 429 retryable", async () => {
    for (const status of [503, 429]) {
      const { fetchImpl } = respond({ status, body: { Message: "busy" } });

      const result = await postmarkProvider.send(email, "token", fetchImpl);

      expect(result).toMatchObject({
        ok: false,
        retryable: true,
        code: "provider_unavailable",
      });
    }
  });

  it("calls a network failure retryable: nobody knows whether it left", async () => {
    const { fetchImpl } = respond(new Error("socket hang up"));

    const result = await postmarkProvider.send(email, "token", fetchImpl);

    expect(result).toEqual({
      ok: false,
      retryable: true,
      code: "provider_unreachable",
      message: "socket hang up",
    });
  });

  it("calls a refused recipient final, with the provider's reason", async () => {
    const { fetchImpl } = respond({
      status: 422,
      body: { ErrorCode: 406, Message: "Inactive recipient" },
    });

    const result = await postmarkProvider.send(email, "token", fetchImpl);

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "recipient_inactive",
      message: "Inactive recipient",
    });
  });

  it("calls a rejected token final", async () => {
    const { fetchImpl } = respond({
      status: 401,
      body: { ErrorCode: 10, Message: "Bad or missing Server API token." },
    });

    const result = await postmarkProvider.send(email, "token", fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      code: "provider_unauthorized",
    });
  });

  it("treats a 200 that carries an error code as a refusal", async () => {
    const { fetchImpl } = respond({
      status: 200,
      body: { ErrorCode: 300, Message: "Invalid 'To' address" },
    });

    const result = await postmarkProvider.send(email, "token", fetchImpl);

    expect(result).toMatchObject({ ok: false, code: "recipient_invalid" });
  });

  it("calls nobody without credentials, or with an address that carries a header", async () => {
    const { fetchImpl, calls } = respond();

    const noToken = await postmarkProvider.send(email, null, fetchImpl);
    const injected = await postmarkProvider.send(
      { ...email, to: { email: "ana@cliente.test\nBcc: x@y.test" } },
      "token",
      fetchImpl,
    );
    const subject = await postmarkProvider.send(
      { ...email, subject: "Hola\r\nBcc: x@y.test" },
      "token",
      fetchImpl,
    );

    expect(noToken).toMatchObject({ ok: false, code: "email_not_configured" });
    expect(injected).toMatchObject({ ok: false, code: "recipient_invalid" });
    expect(subject).toMatchObject({ ok: false, code: "email_subject_invalid" });
    expect(calls).toHaveLength(0);
  });
});

describe("the simulated provider", () => {
  it("calls no network and says the send was simulated", async () => {
    const { fetchImpl, calls } = respond();

    const result = await mockProvider.send(email, null, fetchImpl);

    expect(result).toEqual({
      ok: true,
      providerMessageId: null,
      simulated: true,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("the rendered message", () => {
  const link = "https://crm.test/#/quote#" + "a".repeat(64);

  it("escapes everything the user wrote and everything a record supplied", () => {
    const { html } = renderEmail({
      bodyText: 'Hola <script>alert(1)</script> & "amigos"',
      issuerName: "<b>Acme</b>",
      quote: { quote_number: "<img src=x onerror=alert(1)>" },
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Acme</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp; &quot;amigos&quot;");
  });

  it("puts the link in place of its marker, in both parts", () => {
    const { html, text } = renderEmail({
      bodyText: "Hola:\n\nVer aquí: {{quote_link}}\n\nSaludos",
      quoteLink: link,
    });

    expect(text).toBe(`Hola:\n\nVer aquí: ${link}\n\nSaludos`);
    expect(html).toContain(`href="${link}"`);
    expect(html).not.toContain("{{quote_link}}");
  });

  it("adds the link when the user removed its marker", () => {
    const { text, html } = renderEmail({
      bodyText: "Hola, le envío la cotización.",
      language: "es",
      quoteLink: link,
    });

    expect(text).toBe(
      `Hola, le envío la cotización.\n\nVer cotización: ${link}`,
    );
    expect(html).toContain("Ver cotización");
  });

  it("prints the figures it was given, formatted and never recomputed", () => {
    const { html } = renderEmail({
      bodyText: "Hola",
      language: "en",
      quoteLink: link,
      quote: {
        quote_number: "Q-2026-00007",
        quote_version: 2,
        issue_date: "2026-10-08",
        valid_until: "",
        total: "1234567.5",
        currency: "COP",
      },
    });

    expect(html).toContain("Q-2026-00007 · Version 2");
    expect(html).toContain("October 8, 2026");
    expect(html).toContain("1,234,567.50 COP");
    expect(html).not.toContain("Valid until");
  });

  it("refuses a link or a logo that is not a web address", () => {
    const { html, text } = renderEmail({
      bodyText: "Hola {{quote_link}}",
      quoteLink: "javascript:alert(1)",
      logoUrl: "data:image/svg+xml;base64,AAAA",
      issuerName: "Acme",
    });

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:image");
    expect(text).toBe("Hola");
  });
});
