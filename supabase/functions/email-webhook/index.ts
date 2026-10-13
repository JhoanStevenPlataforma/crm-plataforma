// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { emailProviders } from "../_shared/email/registry.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleWebhook, type Rpc } from "./handleWebhook.ts";

/**
 * The delivery webhook (docs/proposals/outbound-email.md).
 *
 * The mail provider calls this when it knows what became of a message:
 * delivered, bounced, reported as spam. It is the ONLY thing that can mark a
 * message delivered.
 *
 * No JWT: the caller is a provider, not a user. It is authenticated by the
 * secret stored in Vault (`set_email_provider_secret('webhook', …)`), which
 * the provider's own module knows how to check, and optionally by address
 * (`EMAIL_WEBHOOK_AUTHORIZED_IPS`, comma separated).
 *
 * `POST /email-webhook` is the configured provider's webhook;
 * `POST /email-webhook?provider=<key>` names another one.
 */

const AUTHORIZED_IPS = (Deno.env.get("EMAIL_WEBHOOK_AUTHORIZED_IPS") ?? "")
  .split(",")
  .map((ip) => ip.trim())
  .filter((ip) => ip !== "");

const rpc: Rpc = async (fn, args) => {
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  return { data, error: error ? { message: error.message } : null };
};

const readSecret = async () => {
  const { data } = await supabaseAdmin.rpc("get_email_provider_secret", {
    p_kind: "webhook",
  });
  return typeof data === "string" && data !== "" ? data : null;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

/** The provider this installation sends through, unless the URL names one. */
const providerKeyOf = async (url: URL): Promise<string> => {
  const named = url.searchParams.get("provider");
  if (named) return named;
  const { data } = await supabaseAdmin
    .from("email_settings")
    .select("provider_key")
    .eq("id", 1)
    .maybeSingle();
  return data?.provider_key ?? "";
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { message: "Method not allowed" });
  }

  // Supabase's gateway writes `x-forwarded-for`; when a list of addresses is
  // configured, a caller outside it is refused before anything is read.
  if (AUTHORIZED_IPS.length > 0) {
    const forwarded = (req.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((ip) => ip.trim());
    if (!forwarded.some((ip) => AUTHORIZED_IPS.includes(ip))) {
      return json(401, { message: "Unauthorized" });
    }
  }

  const response = await handleWebhook(
    {
      providerKey: await providerKeyOf(new URL(req.url)),
      authorization: req.headers.get("Authorization"),
      headers: Object.fromEntries(req.headers),
      rawBody: await req.text(),
    },
    { registry: emailProviders, readSecret, rpc },
  );
  return json(response.status, response.body);
});
