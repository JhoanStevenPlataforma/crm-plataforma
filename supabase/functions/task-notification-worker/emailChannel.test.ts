import { describe, expect, it } from "vitest";

import { emailProviders } from "../_shared/email/registry.ts";
import type { FetchLike } from "../_shared/email/types.ts";
import {
  resolveEmailChannel,
  sendEmail,
  type EmailChannel,
  type EmailSettingsRow,
} from "./emailChannel.ts";

type Call = { url: string; headers: Record<string, string>; body: any };

/** The provider's HTTP API, answering what the test tells it to. */
const respond = (
  response: { status: number; body?: unknown } | Error,
): { fetchImpl: FetchLike; calls: Call[] } => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({
      url,
      headers: init?.headers ?? {},
      body: JSON.parse(init?.body ?? "{}"),
    });
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    });
  };
  return { fetchImpl, calls };
};

const buildSettings = (
  overrides: Partial<EmailSettingsRow> = {},
): EmailSettingsRow => ({
  provider_key: "resend",
  is_enabled: true,
  from_email: "crm@plataforma.test",
  from_name: "Hermes CRM",
  transactional_stream: "outbound",
  ...overrides,
});

const reminder = {
  to: "laura@example.com",
  subject: "Reminder: call Ana",
  textBody: "Due today",
};

const readyChannel = (
  settings: EmailSettingsRow,
  credentials: string,
): Extract<EmailChannel, { ready: true }> => {
  const channel = resolveEmailChannel(settings, credentials, emailProviders);
  if (!channel.ready) throw new Error(channel.reason);
  return channel;
};

describe("resolveEmailChannel", () => {
  it("is not ready when the settings row is missing", () => {
    const channel = resolveEmailChannel(null, "re_key", emailProviders);

    expect(channel).toEqual({
      ready: false,
      reason: "outbound email is switched off",
    });
  });

  it("is not ready when outbound email is switched off", () => {
    const channel = resolveEmailChannel(
      buildSettings({ is_enabled: false }),
      "re_key",
      emailProviders,
    );

    expect(channel.ready).toBe(false);
  });

  it("refuses the simulated provider instead of reporting a reminder as sent", () => {
    const channel = resolveEmailChannel(
      buildSettings({ provider_key: "mock" }),
      null,
      emailProviders,
    );

    expect(channel).toEqual({
      ready: false,
      reason: "the mail provider is the simulated one: nothing is sent",
    });
  });

  it("names a provider this deployment does not know", () => {
    const channel = resolveEmailChannel(
      buildSettings({ provider_key: "sendgrid" }),
      "key",
      emailProviders,
    );

    expect(channel).toEqual({
      ready: false,
      reason: "no provider 'sendgrid' in this deployment",
    });
  });

  it.each([
    ["no credentials", buildSettings(), null],
    ["no sender address", buildSettings({ from_email: null }), "re_key"],
  ])("is not ready with %s", (_label, settings, credentials) => {
    const channel = resolveEmailChannel(settings, credentials, emailProviders);

    expect(channel).toEqual({
      ready: false,
      reason: "the mail provider has no credentials or no sender address",
    });
  });
});

describe("sendEmail", () => {
  it("sends a reminder through Resend when Resend is the configured provider", async () => {
    const { fetchImpl, calls } = respond({
      status: 200,
      body: { id: "re_msg_1" },
    });

    const result = await sendEmail(
      reminder,
      readyChannel(buildSettings(), "re_key"),
      fetchImpl,
    );

    expect(result).toEqual({ ok: true, providerMessageId: "re_msg_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].headers.Authorization).toBe("Bearer re_key");
    expect(calls[0].body).toMatchObject({
      from: expect.stringContaining("crm@plataforma.test"),
      to: [expect.stringContaining("laura@example.com")],
      subject: "Reminder: call Ana",
      text: "Due today",
    });
  });

  it("sends through Postmark, on the transactional stream, when Postmark is configured", async () => {
    const { fetchImpl, calls } = respond({
      status: 200,
      body: { ErrorCode: 0, MessageID: "pm-1" },
    });

    const result = await sendEmail(
      reminder,
      readyChannel(
        buildSettings({
          provider_key: "postmark",
          transactional_stream: "team-notices",
        }),
        "pm_token",
      ),
      fetchImpl,
    );

    expect(result).toEqual({ ok: true, providerMessageId: "pm-1" });
    expect(calls[0].url).toContain("postmarkapp.com");
    expect(calls[0].headers["X-Postmark-Server-Token"]).toBe("pm_token");
    expect(calls[0].body.MessageStream).toBe("team-notices");
  });

  it("reports the provider's refusal as the failure reason", async () => {
    const { fetchImpl } = respond({
      status: 403,
      body: { name: "validation_error", message: "domain is not verified" },
    });

    const result = await sendEmail(
      reminder,
      readyChannel(buildSettings(), "re_key"),
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, error: "domain is not verified" });
  });

  it("fails without the token in the reason when the provider cannot be reached", async () => {
    const { fetchImpl } = respond(new Error("connect failed for re_key"));

    const result = await sendEmail(
      reminder,
      readyChannel(buildSettings(), "re_key"),
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("re_key");
  });
});
