import type { To } from "react-router";

/** The customer portal's route (quotes §6). */
export const QUOTE_PORTAL_PATH = "/quote";

/** What `mint_quote_token()` hands out: 32 random bytes, hex-encoded. */
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Where a customer link points, as a router location.
 *
 * THE TOKEN TRAVELS IN THE FRAGMENT, never in the path or the query. A browser
 * never sends a fragment to any server, so the token stays out of the web
 * host's access logs, out of every proxy's, and out of the `Referer` of
 * anything the page loads — while a path segment would be written down by all
 * three. The router builds the address: `#/quote#<token>` under the hash router
 * production runs, `/quote#<token>` under a browser router, and the link is
 * right under either.
 */
export const quotePortalLocation = (token: string): To => ({
  pathname: QUOTE_PORTAL_PATH,
  hash: token,
});

/** The token a portal location carries, or null when it carries none. */
export const tokenFromHash = (hash: string): string | null => {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return TOKEN_PATTERN.test(value) ? value : null;
};

/**
 * Whether the browser is on the portal, read from `window.location` because
 * the auth provider runs outside the router.
 *
 * EXACT, on purpose: `/quotes/1/show` starts with `/quote` too, and a prefix
 * test would switch the session check off for the whole quotes module.
 */
export const isQuotePortalLocation = ({
  pathname,
  hash,
}: {
  pathname: string;
  hash: string;
}): boolean =>
  /(^|\/)quote\/?$/.test(pathname) || /^#\/quote\/?(?:[?#]|$)/.test(hash);

/**
 * A customer link whose second `#` arrived percent-encoded, put right; null
 * for any other address.
 *
 * A fragment may not hold a `#`, so some mail providers and mail clients
 * rewrite `#/quote#<token>` as `#/quote%23<token>` on its way to the customer.
 * The hash router then reads the token as part of the path and finds no route.
 * The entry point repairs the address before the router starts, so a link
 * opens whichever way it arrived.
 */
export const repairedQuotePortalHash = (hash: string): string | null => {
  const match = /^#\/quote\/?%23([0-9a-f]{64})$/.exec(hash);
  return match ? `#${QUOTE_PORTAL_PATH}#${match[1]}` : null;
};
