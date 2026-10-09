// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { emailProviders } from "../_shared/email/registry.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { dispatchBatch, type Rpc } from "./dispatchMessage.ts";

/**
 * The outbound email dispatcher (docs/proposals/outbound-email.md).
 *
 * Two callers:
 *
 *  - the user who has just queued a message, with their own session and that
 *    message's id, so "Send" answers in a second instead of at the next tick.
 *    They may dispatch a message they sent; a manager or an admin, any.
 *  - pg_cron, every minute, through `email_dispatch_tick()`, with the
 *    service-role key: it sends whatever is due, which is how a transient
 *    failure is retried.
 *
 * Both paths claim through `claim_email_messages()` (`for update skip
 * locked`), so the two arriving together cannot send one message twice.
 *
 * Environment: CRM_BASE_URL (required to share a quotation: the link is built
 * from it), EMAIL_DISPATCH_BATCH (20).
 */

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "";
const CRM_BASE_URL = (Deno.env.get("CRM_BASE_URL") ?? "").replace(/\/+$/, "");
const BATCH_SIZE = Number(Deno.env.get("EMAIL_DISPATCH_BATCH") ?? 20);

const rpcOf =
  (client: SupabaseClient): Rpc =>
  async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    return { data, error: error ? { message: error.message } : null };
  };

const adminRpc: Rpc = rpcOf(supabaseAdmin);

const readSecret = async () => {
  const { data } = await supabaseAdmin.rpc("get_email_provider_secret", {
    p_kind: "credentials",
  });
  return typeof data === "string" && data !== "" ? data : null;
};

type Caller =
  | { kind: "service"; rpc: Rpc }
  | { kind: "user"; salesId: number; managesAll: boolean }
  | { kind: "refused"; status: number; message: string };

/**
 * Who is calling. A session must belong to an active user. Anything else is
 * treated as a service credential and PROVEN to be one by Postgres, exactly as
 * `exchange-rates-sync` does: the token calls `fail_stale_email_messages()`,
 * which only `service_role` may execute and which the tick runs anyway.
 */
const identify = async (req: Request): Promise<Caller> => {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { kind: "refused", status: 401, message: "Unauthorized" };
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) {
    return { kind: "service", rpc: adminRpc };
  }

  const asUser = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await asUser.auth.getUser().catch(() => ({ data: null }));
  if (data?.user) {
    const sale = await getUserSale(data.user);
    if (!sale || sale.disabled) {
      return { kind: "refused", status: 403, message: "Forbidden" };
    }
    return {
      kind: "user",
      salesId: Number(sale.id),
      managesAll: sale.role === "admin" || sale.role === "manager",
    };
  }

  const asService = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await asService.rpc("fail_stale_email_messages");
  return error
    ? { kind: "refused", status: 401, message: "Unauthorized" }
    : { kind: "service", rpc: rpcOf(asService) };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const messageIdOf = (body: unknown): number | null => {
  const value = (body as { message_id?: unknown } | null)?.message_id;
  const id = typeof value === "string" ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0
    ? id
    : null;
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method not allowed");
    }

    const caller = await identify(req);
    if (caller.kind === "refused") {
      return createErrorResponse(caller.status, caller.message);
    }

    const messageId = messageIdOf(await req.json().catch(() => null));

    if (caller.kind === "user") {
      // A user dispatches ONE message, and one they may: without this, any
      // signed-in account could drain the whole queue on demand.
      if (messageId == null) {
        return createErrorResponse(400, "message_id is required");
      }
      const { data: message } = await supabaseAdmin
        .from("email_messages")
        .select("id, sales_id")
        .eq("id", messageId)
        .maybeSingle();
      if (
        !message ||
        (!caller.managesAll && Number(message.sales_id) !== caller.salesId)
      ) {
        return createErrorResponse(404, "Unknown email message");
      }
    }

    try {
      const summary = await dispatchBatch(
        { messageId, limit: BATCH_SIZE },
        {
          rpc: caller.kind === "service" ? caller.rpc : adminRpc,
          registry: emailProviders,
          fetchImpl: fetch,
          readSecret,
          baseUrl: CRM_BASE_URL,
        },
      );
      return json({ success: true, data: summary });
    } catch (error: unknown) {
      return createErrorResponse(
        500,
        error instanceof Error ? error.message : "dispatch failed",
      );
    }
  }),
);
