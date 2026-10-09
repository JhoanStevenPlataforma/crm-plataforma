// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { createProviderRegistry } from "./providers/registry.ts";
import { parseSyncRequest } from "./syncRequest.ts";
import { syncProvider, type Rpc, type SyncOutcome } from "./syncProvider.ts";

/**
 * Exchange-rate update (docs/proposals/multi-currency-fx.md).
 *
 * Two callers:
 *
 *  - pg_cron, every 30 minutes, through `fx_dispatch_sync()`, with the
 *    service-role key. Each provider is called only when it is due
 *    (`refresh_interval_minutes`, decided by `fx_begin_sync_run()`).
 *  - an administrator pressing "Sync now", with their own session. Forced:
 *    the cache is bypassed. A historical backfill (`from`/`to`) is admin-only.
 *
 * Providers run one at a time in priority order, because a cross-rate
 * provider pivots on the rate the one before it stored.
 *
 * Environment (all optional): FX_HTTP_TIMEOUT_MS (10000), FX_MAX_ATTEMPTS (3),
 * FX_TRM_URL, FX_FRANKFURTER_URL.
 */

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "";
const TIMEOUT_MS = Number(Deno.env.get("FX_HTTP_TIMEOUT_MS") ?? 10000);
const MAX_ATTEMPTS = Number(Deno.env.get("FX_MAX_ATTEMPTS") ?? 3);
const registry = createProviderRegistry({
  trm: Deno.env.get("FX_TRM_URL") || undefined,
  frankfurter: Deno.env.get("FX_FRANKFURTER_URL") || undefined,
});

// Declared before its first use: a `const` read at module load before its
// declaration is a ReferenceError that kills the worker on every request.
const rpcOf =
  (client: SupabaseClient): Rpc =>
  async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    return { data, error: error ? { message: error.message } : null };
  };

const adminRpc: Rpc = rpcOf(supabaseAdmin);

const readSecret = async (providerKey: string) => {
  const { data } = await supabaseAdmin.rpc("get_fx_provider_secret", {
    p_provider_key: providerKey,
  });
  return typeof data === "string" ? data : null;
};

type Caller =
  | { kind: "service"; rpc: Rpc }
  | { kind: "admin"; salesId: number }
  | { kind: "refused"; status: number; message: string };

/**
 * Who is calling. A user session must belong to an active admin. Anything else
 * is treated as a service credential and PROVEN to be one by Postgres: a
 * client holding it calls `fx_reap_sync_runs()`, which only `service_role`
 * may execute (and which is harmless: it frees abandoned runs). Comparing the
 * token to an environment variable is not enough -- a deployment may hand the
 * scheduler a legacy JWT and the runtime a `sb_secret_` key, or the reverse.
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
    if (!sale || sale.disabled || sale.role !== "admin") {
      return {
        kind: "refused",
        status: 403,
        message: "Only an administrator can update exchange rates",
      };
    }
    return { kind: "admin", salesId: Number(sale.id) };
  }

  const asService = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await asService.rpc("fx_reap_sync_runs");
  return error
    ? { kind: "refused", status: 401, message: "Unauthorized" }
    : { kind: "service", rpc: rpcOf(asService) };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method not allowed");
    }

    const caller = await identify(req);
    if (caller.kind === "refused") {
      return createErrorResponse(caller.status, caller.message);
    }

    const parsed = parseSyncRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) {
      return createErrorResponse(400, parsed.error);
    }
    const request = parsed.value;
    const isBackfill = Boolean(request.from && request.to);
    if (isBackfill && caller.kind !== "admin") {
      return createErrorResponse(403, "A backfill is started by an admin");
    }

    let query = supabaseAdmin
      .from("exchange_rate_providers")
      .select("key")
      .eq("is_enabled", true)
      .order("priority", { ascending: true });
    if (request.provider) {
      query = query.eq("key", request.provider);
    }
    const { data: providers, error } = await query;
    if (error) {
      return createErrorResponse(
        500,
        `Could not list providers: ${error.message}`,
      );
    }

    const outcomes: SyncOutcome[] = [];
    for (const { key } of providers ?? []) {
      try {
        outcomes.push(
          await syncProvider({
            providerKey: key,
            triggeredBy: isBackfill
              ? "backfill"
              : caller.kind === "admin"
                ? "manual"
                : "cron",
            // A person pressing the button wants a call now, not the cache.
            force: caller.kind === "admin",
            salesId: caller.kind === "admin" ? caller.salesId : null,
            from: request.from,
            to: request.to,
            rpc: caller.kind === "service" ? caller.rpc : adminRpc,
            registry,
            fetchImpl: fetch,
            timeoutMs: TIMEOUT_MS,
            maxAttempts: MAX_ATTEMPTS,
            readSecret,
          }),
        );
      } catch (e: unknown) {
        // The claim itself failed (database unreachable). Reported, and the
        // next provider still gets its turn.
        outcomes.push({
          provider: key,
          status: "skipped",
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({ success: true, data: outcomes });
  }),
);
