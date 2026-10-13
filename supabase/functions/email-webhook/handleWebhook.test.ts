import { describe, expect, it } from "vitest";

import { mockProvider } from "../_shared/email/mock.ts";
import { postmarkProvider } from "../_shared/email/postmark.ts";
import { resendProvider } from "../_shared/email/resend.ts";
import { timingSafeEqual } from "../_shared/email/timingSafe.ts";
import {
  handleWebhook,
  MAX_WEBHOOK_BYTES,
  type Rpc,
  type WebhookDeps,
} from "./handleWebhook.ts";

const SECRET = "webhook-user:webhook-password";
const AUTHORIZATION = `Basic ${btoa(SECRET)}`;

const delivery = {
  RecordType: "Delivery",
  MessageID: "pm-1",
  Recipient: "Ana@Cliente.test",
  DeliveredAt: "2026-10-08T15:00:00Z",
  Details: "smtp;250 2.0.0 OK",
};

const hardBounce = {
  RecordType: "Bounce",
  ID: 692560173,
  Type: "HardBounce",
  MessageID: "pm-2",
  Email: "nadie@cliente.test",
  BouncedAt: "2026-10-08T15:05:00Z",
  Description:
    "The server was unable to deliver your message (ex: unknown user).",
  Inactive: true,
};

/** The database, recording what it is told and answering like the function. */
const stage = (options: { secret?: string | null; fail?: boolean } = {}) => {
  const recorded: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const rpc: Rpc = async (fn, args = {}) => {
    if (fn !== "record_email_event") {
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    }
    if (options.fail) {
      return { data: null, error: { message: "database unreachable" } };
    }
    const id = String(args.p_provider_event_id);
    const duplicate = seen.has(id);
    seen.add(id);
    if (!duplicate) recorded.push(args);
    return {
      data: { duplicate, matched: true, status: "delivered" },
      error: null,
    };
  };
  const deps: WebhookDeps = {
    registry: {
      mock: mockProvider,
      postmark: postmarkProvider,
      resend: resendProvider,
    },
    readSecret: async () =>
      options.secret === undefined ? SECRET : options.secret,
    rpc,
  };
  return { deps, recorded };
};

const call = (
  deps: WebhookDeps,
  payload: unknown,
  overrides: { authorization?: string | null; providerKey?: string } = {},
) =>
  handleWebhook(
    {
      providerKey: overrides.providerKey ?? "postmark",
      authorization:
        overrides.authorization === undefined
          ? AUTHORIZATION
          : overrides.authorization,
      rawBody: typeof payload === "string" ? payload : JSON.stringify(payload),
    },
    deps,
  );

describe("comparing secrets", () => {
  it("says equal only for the same string, whatever the lengths", async () => {
    expect(await timingSafeEqual("secret", "secret")).toBe(true);
    expect(await timingSafeEqual("secret", "secreT")).toBe(false);
    expect(await timingSafeEqual("secret", "secret-and-more")).toBe(false);
    expect(await timingSafeEqual("", "secret")).toBe(false);
  });
});

describe("the delivery webhook", () => {
  it("records a delivery under an id that is stable across replays", async () => {
    // Arrange
    const { deps, recorded } = stage();

    // Act
    const response = await call(deps, delivery);

    // Assert
    expect(response).toEqual({
      status: 200,
      body: { success: true, duplicate: false, matched: true },
    });
    expect(recorded).toEqual([
      {
        p_provider_key: "postmark",
        p_provider_event_id: "delivery:pm-1:ana@cliente.test",
        p_provider_message_id: "pm-1",
        p_event_type: "delivered",
        p_occurred_at: "2026-10-08T15:00:00Z",
        p_recipient: "Ana@Cliente.test",
        p_is_permanent: false,
        p_detail: null,
      },
    ]);
  });

  it("answers 200 to the same event again, and records it once", async () => {
    const { deps, recorded } = stage();

    await call(deps, delivery);
    const replay = await call(deps, delivery);

    expect(replay).toEqual({
      status: 200,
      body: { success: true, duplicate: true, matched: true },
    });
    expect(recorded).toHaveLength(1);
  });

  it("records a hard bounce as permanent, with the provider's reason", async () => {
    const { deps, recorded } = stage();

    await call(deps, hardBounce);

    expect(recorded[0]).toMatchObject({
      p_provider_event_id: "bounce:692560173:pm-2",
      p_provider_message_id: "pm-2",
      p_event_type: "bounced",
      p_recipient: "nadie@cliente.test",
      p_is_permanent: true,
      p_detail:
        "The server was unable to deliver your message (ex: unknown user).",
    });
  });

  it("keeps two bounces apart even when their 64-bit ids round to the same number", async () => {
    const { deps, recorded } = stage();
    // Both exceed 2^53: JSON.parse reads them as the same double.
    const first = `{"RecordType":"Bounce","ID":4323372036854775807,"Type":"HardBounce","MessageID":"pm-8","Email":"a@cliente.test"}`;
    const second = `{"RecordType":"Bounce","ID":4323372036854775806,"Type":"HardBounce","MessageID":"pm-9","Email":"b@cliente.test"}`;

    await call(deps, first);
    await call(deps, second);

    expect(recorded).toHaveLength(2);
    expect(recorded[0].p_provider_event_id).not.toBe(
      recorded[1].p_provider_event_id,
    );
  });

  it("does not call a temporary bounce permanent", async () => {
    const { deps, recorded } = stage();

    await call(deps, {
      ...hardBounce,
      ID: 7,
      Type: "SoftBounce",
      Inactive: false,
    });

    expect(recorded[0]).toMatchObject({
      p_provider_event_id: "bounce:7:pm-2",
      p_event_type: "bounced",
      p_is_permanent: false,
    });
  });

  it("records a spam complaint as a complaint", async () => {
    const { deps, recorded } = stage();

    await call(deps, {
      RecordType: "SpamComplaint",
      ID: 42,
      MessageID: "pm-3",
      Email: "molesto@cliente.test",
      BouncedAt: "2026-10-08T16:00:00Z",
    });

    expect(recorded[0]).toMatchObject({
      p_provider_event_id: "complaint:42:pm-3",
      p_event_type: "complained",
      p_recipient: "molesto@cliente.test",
    });
  });

  it.each([
    ["no credentials", null],
    ["another password", `Basic ${btoa("webhook-user:guess")}`],
    ["the secret in the clear", SECRET],
    ["a bearer token", `Bearer ${SECRET}`],
  ])("refuses a request with %s and records nothing", async (_name, header) => {
    const { deps, recorded } = stage();

    const response = await call(deps, delivery, { authorization: header });

    expect(response.status).toBe(401);
    expect(recorded).toHaveLength(0);
  });

  it("accepts nothing while no secret is configured", async () => {
    const { deps, recorded } = stage({ secret: null });

    const response = await call(deps, delivery, {
      authorization: `Basic ${btoa("")}`,
    });

    expect(response.status).toBe(503);
    expect(recorded).toHaveLength(0);
  });

  it("does not exist for a provider that reports nothing", async () => {
    const { deps, recorded } = stage();

    const response = await call(deps, delivery, { providerKey: "mock" });

    expect(response.status).toBe(404);
    expect(recorded).toHaveLength(0);
  });

  it("acknowledges a record type it does not record, without recording it", async () => {
    const { deps, recorded } = stage();

    const response = await call(deps, {
      RecordType: "Open",
      MessageID: "pm-1",
      Recipient: "ana@cliente.test",
    });

    expect(response).toEqual({
      status: 200,
      body: { success: true, ignored: true },
    });
    expect(recorded).toHaveLength(0);
  });

  it("tells the provider to stop retrying a body that is not JSON, or too large", async () => {
    const { deps, recorded } = stage();

    const notJson = await call(deps, "RecordType=Delivery");
    const tooLarge = await call(
      deps,
      JSON.stringify({ ...delivery, Details: "x".repeat(MAX_WEBHOOK_BYTES) }),
    );

    expect(notJson.status).toBe(403);
    expect(tooLarge.status).toBe(403);
    expect(recorded).toHaveLength(0);
  });

  it("asks the provider to try again when the database did not record the event", async () => {
    const { deps } = stage({ fail: true });

    const response = await call(deps, delivery);

    expect(response.status).toBe(500);
  });

  it("dates an event on arrival when the provider's date is unreadable", async () => {
    const { deps, recorded } = stage();

    await call(deps, { ...delivery, DeliveredAt: "yesterday-ish" });

    expect(recorded[0].p_occurred_at).toBeNull();
  });

  it("ignores a delivery with no message id and a bounce with no id", async () => {
    const { deps, recorded } = stage();

    const delivered = await call(deps, { ...delivery, MessageID: "" });
    const bounced = await call(deps, { ...hardBounce, ID: undefined });

    expect(delivered.body).toMatchObject({ ignored: true });
    expect(bounced.body).toMatchObject({ ignored: true });
    expect(recorded).toHaveLength(0);
  });
});

describe("the delivery webhook of a provider that signs its calls", () => {
  const SIGNING_SECRET = `whsec_${btoa("resend-signing-key")}`;
  const rawBody = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-10-13T15:00:00.000Z",
    data: { email_id: "re-1", to: ["ana@cliente.test"] },
  });

  /** The three headers Resend would send for `body`, signed now. */
  const sign = async (body: string) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("resend-signing-key"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`msg_1.${timestamp}.${body}`),
    );
    return {
      "svix-id": "msg_1",
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(digest)))}`,
    };
  };

  it("records an event whose signature covers the body it arrived with", async () => {
    const { deps, recorded } = stage({ secret: SIGNING_SECRET });

    const response = await handleWebhook(
      {
        providerKey: "resend",
        authorization: null,
        headers: await sign(rawBody),
        rawBody,
      },
      deps,
    );

    expect(response.status).toBe(200);
    expect(recorded).toEqual([
      expect.objectContaining({
        p_provider_key: "resend",
        p_provider_event_id: "delivered:re-1:ana@cliente.test",
        p_provider_message_id: "re-1",
        p_event_type: "delivered",
      }),
    ]);
  });

  it("refuses a body that is not the one that was signed, and records nothing", async () => {
    const { deps, recorded } = stage({ secret: SIGNING_SECRET });

    const response = await handleWebhook(
      {
        providerKey: "resend",
        authorization: null,
        headers: await sign(rawBody),
        rawBody: rawBody.replace("re-1", "re-2"),
      },
      deps,
    );

    expect(response.status).toBe(401);
    expect(recorded).toHaveLength(0);
  });
});
