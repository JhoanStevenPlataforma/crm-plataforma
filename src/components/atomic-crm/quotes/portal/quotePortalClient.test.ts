import { createQuotePortalClient } from "./quotePortalClient";
import { PORTAL_TOKEN, portalPayload } from "./quotePortalFixtures";

type SentRequest = { url: string; init: RequestInit };

/** A server that answers every request with one response, and keeps what it received. */
const serverAnswering = (status: number, body: unknown) => {
  const received: SentRequest[] = [];
  const client = createQuotePortalClient({
    baseUrl: "https://project.supabase.co",
    apiKey: "sb_publishable_test",
    fetchImpl: async (url, init) => {
      received.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  return { client, received };
};

describe("createQuotePortalClient", () => {
  it("sends the token in the body of a POST — never in the address — and no CRM session with it", async () => {
    const { client, received } = serverAnswering(200, { data: portalPayload });

    await expect(client.view(PORTAL_TOKEN)).resolves.toEqual(portalPayload);

    expect(received).toHaveLength(1);
    const [{ url, init }] = received;
    expect(url).toBe(
      "https://project.supabase.co/functions/v1/quote-portal/view",
    );
    expect(url).not.toContain(PORTAL_TOKEN);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ token: PORTAL_TOKEN });
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it("sends an answer under the names the edge function reads", async () => {
    const { client, received } = serverAnswering(200, { data: portalPayload });

    await client.accept(PORTAL_TOKEN, {
      name: "Lucía Gómez",
      email: "lucia@acme.example",
    });
    await client.reject(PORTAL_TOKEN, {
      reason_code: "price",
      reason: null,
      name: null,
      email: null,
    });
    await client.comment(PORTAL_TOKEN, {
      body: "Can we pay in two instalments?",
      name: "Lucía Gómez",
      email: null,
    });

    expect(received.map(({ url }) => url.split("/").pop())).toEqual([
      "accept",
      "reject",
      "comment",
    ]);
    expect(received.map(({ init }) => JSON.parse(String(init.body)))).toEqual([
      { token: PORTAL_TOKEN, name: "Lucía Gómez", email: "lucia@acme.example" },
      {
        token: PORTAL_TOKEN,
        reason_code: "price",
        reason: null,
        name: null,
        email: null,
      },
      {
        token: PORTAL_TOKEN,
        body: "Can we pay in two instalments?",
        name: "Lucía Gómez",
        email: null,
      },
    ]);
  });

  it("asks for the document's etag the same way, and a dead link answers it with its key", async () => {
    const { client, received } = serverAnswering(200, {
      data: { etag: "3f1c" },
    });
    const dead = serverAnswering(404, { error: "quote_link_invalid" });

    await expect(client.version(PORTAL_TOKEN)).resolves.toBe("3f1c");
    expect(received[0].url).toBe(
      "https://project.supabase.co/functions/v1/quote-portal/version",
    );
    expect(JSON.parse(String(received[0].init.body))).toEqual({
      token: PORTAL_TOKEN,
    });
    await expect(dead.client.version(PORTAL_TOKEN)).rejects.toMatchObject({
      key: "quote_link_invalid",
    });
  });

  it("turns a refusal into its key", async () => {
    const { client } = serverAnswering(409, {
      error: "quote_version_superseded",
    });

    await expect(
      client.accept(PORTAL_TOKEN, { name: "Lucía", email: "l@acme.example" }),
    ).rejects.toMatchObject({ key: "quote_version_superseded" });
  });

  it("treats anything it does not understand as unavailable, rather than rendering half a document", async () => {
    const malformed = serverAnswering(200, {
      data: { ...portalPayload, totals: { total: "3427200" } },
    });
    const unknownKey = serverAnswering(500, { error: "something_new" });
    const unreachable = createQuotePortalClient({
      baseUrl: "https://project.supabase.co",
      apiKey: "sb_publishable_test",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    for (const client of [malformed.client, unknownKey.client, unreachable]) {
      await expect(client.view(PORTAL_TOKEN)).rejects.toMatchObject({
        key: "quote_portal_unavailable",
      });
    }
  });
});
