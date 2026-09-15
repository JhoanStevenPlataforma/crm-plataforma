/**
 * The origin allowed to call these functions from a browser.
 *
 * `*` is the default because that is what every existing deployment already
 * relies on, and silently narrowing it here would break their front-end on the
 * next deploy. Set `CORS_ALLOWED_ORIGIN` to the CRM's own origin (e.g.
 * `https://crm.example.com`) to close it.
 *
 * The exposure this limits is modest and worth naming precisely: these
 * functions authenticate on the `Authorization` header, not on a cookie, so a
 * browser never attaches credentials to a cross-origin call on its own — `*`
 * is not an authentication bypass. What the setting buys is that a random page
 * cannot read these responses at all, which removes a probing surface rather
 * than a hole.
 *
 * One origin, not a list: a project serves one CRM front-end, and matching a
 * list means echoing the request's `Origin` back, which needs the Request at
 * every call site and a `Vary: Origin` header to keep caches honest. Neither is
 * worth building before a second origin exists.
 */
const allowedOrigin = Deno.env.get("CORS_ALLOWED_ORIGIN") ?? "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, DELETE",
};

/**
 * Handle OPTIONS requests for CORS preflight.
 */
export function OptionsMiddleware(
  req: Request,
  next: (req: Request) => Promise<Response>,
) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return next(req);
}
