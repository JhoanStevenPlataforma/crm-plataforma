import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  cleanUserAgent,
  clientAddress,
  isPortalCall,
  MAX_BODY_BYTES,
  parsePortalCall,
  PORTAL_UNAVAILABLE,
  responseFor,
  rpcCallFor,
  tokenHashParam,
  type PortalResponse,
} from "./portalRequest.ts";

/**
 * The customer portal's one door (docs/proposals/quotes-cpq-module.md §6, D1).
 *
 * A customer is not a CRM user, so there is no JWT to verify
 * (`verify_jwt = false` in `supabase/config.toml`) and nothing from
 * `_shared/authentication.ts` applies: the token in the request body IS the
 * credential. This function holds the service role and calls the
 * `quote_portal_*` SQL functions, which are granted to that role alone. No
 * policy anywhere grants `anon`, and this function is why none has to (F2).
 * See adr/ADR-7dcff21a-PHASE-7-quote-portal-no-anon-rls.md.
 *
 * `POST /quote-portal/{view|accept|reject|comment|version}` with
 * `{ "token": … }`. POST for the reads as well, on purpose: opening the
 * document RECORDS a view, so it is not a safe GET, and a token in a URL is a
 * token in every access log and cache that URL passes through. (That is also
 * why `_shared/cors.ts` needed no GET.) `version` is the page's poll (§6.5): it
 * answers the document's `etag` and writes nothing.
 */

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
  // One customer's quotation: no shared cache may keep a copy of it.
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const respond = ({ status, body }: PortalResponse) =>
  new Response(JSON.stringify(body), {
    status,
    headers:
      "retry_after_seconds" in body && body.retry_after_seconds != null
        ? { ...JSON_HEADERS, "Retry-After": String(body.retry_after_seconds) }
        : JSON_HEADERS,
  });

/** The body as JSON, or null when it is too large or is not JSON at all. */
const readBody = async (req: Request): Promise<unknown> => {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return respond({
        status: 405,
        body: { error: "quote_portal_method_not_allowed" },
      });
    }
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return respond({
        status: 413,
        body: { error: "quote_portal_input_too_long" },
      });
    }

    const call = parsePortalCall(
      new URL(req.url).pathname,
      await readBody(req),
    );
    if (!isPortalCall(call)) return respond(call);

    const { fn, args } = rpcCallFor(
      call,
      await tokenHashParam(call.token),
      clientAddress(req.headers),
      cleanUserAgent(req.headers.get("user-agent")),
    );

    try {
      const result = await supabaseAdmin.rpc(fn, args);
      const response = responseFor(result);
      if (response.status === 500) {
        // The detail stays in the log. The token is not in `args` — only its
        // hash — so nothing here can leak the credential.
        console.error("quote-portal: unexpected database answer", {
          fn,
          code: result.error?.code,
          message: result.error?.message,
        });
      }
      return respond(response);
    } catch (error) {
      console.error("quote-portal: the database could not be reached", {
        fn,
        error: error instanceof Error ? error.message : String(error),
      });
      return respond({ status: 500, body: { error: PORTAL_UNAVAILABLE } });
    }
  }),
);
