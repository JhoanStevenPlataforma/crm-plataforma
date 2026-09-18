/**
 * The HTTP half of the customer portal (docs/proposals/quotes-cpq-module.md §6),
 * as pure functions.
 *
 * Nothing here decides anything about a quote. Whether a link is alive, what a
 * customer may see and whether an answer is allowed are decided by the
 * `quote_portal_*` SQL functions (D7), where `make test-db` defends them. This
 * module keeps malformed input from reaching them, and turns their answer into
 * a response that says exactly what they meant — and nothing they did not.
 */

import { isIP } from "node:net";

export const PORTAL_ACTIONS = ["view", "accept", "reject", "comment"] as const;

export type PortalAction = (typeof PORTAL_ACTIONS)[number];

/**
 * An answer or a comment is a name, an email address and a paragraph: 16 KB is
 * generous. A comment body is capped at 4000 characters by the database.
 */
export const MAX_BODY_BYTES = 16 * 1024;

/** What `mint_quote_token()` hands out: 32 random bytes, hex-encoded. */
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** A user agent is evidence, not an essay. */
const MAX_USER_AGENT_LENGTH = 512;

export type PortalCall =
  | { action: "view"; token: string }
  | {
      action: "accept";
      token: string;
      name: string | null;
      email: string | null;
    }
  | {
      action: "reject";
      token: string;
      reasonCode: string | null;
      reason: string | null;
      name: string | null;
      email: string | null;
    }
  | {
      action: "comment";
      token: string;
      body: string | null;
      name: string | null;
      email: string | null;
    };

export type PortalResponse = {
  status: number;
  body: { data: unknown } | { error: string; retry_after_seconds?: number };
};

export type RpcCall = { fn: string; args: Record<string, unknown> };

export type RpcResult = {
  data: unknown;
  error: { code?: string; details?: string | null; message?: string } | null;
};

/** The answer for every failure that is not one of the portal's own refusals. */
export const PORTAL_UNAVAILABLE = "quote_portal_unavailable";

const LINK_INVALID = "quote_link_invalid";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isControl = (character: string) => {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
};

const nonBlank = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * One line of text: control characters dropped, line breaks and tabs folded
 * into a space. A name with a newline in it is an accident or an injection
 * attempt, and neither belongs on an acceptance record.
 */
export const cleanLine = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return nonBlank(
    Array.from(value, (character) =>
      character === "\n" || character === "\r" || character === "\t"
        ? " "
        : isControl(character)
          ? ""
          : character,
    ).join(""),
  );
};

/** A paragraph: the same, except that its line breaks survive, as `\n`. */
export const cleanParagraph = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return nonBlank(
    Array.from(value.replace(/\r\n?/g, "\n"), (character) =>
      character !== "\n" && isControl(character) ? "" : character,
    ).join(""),
  );
};

const isPortalAction = (value: unknown): value is PortalAction =>
  (PORTAL_ACTIONS as readonly unknown[]).includes(value);

/**
 * The call a request asks for, or the refusal it earns before any query runs.
 *
 * The action is the last path segment (`/quote-portal/accept`), so it shows in
 * access logs; the token is in the BODY, so it does not. A value that is not a
 * token's shape gets the same answer the database gives for a dead link: a
 * distinct reply for a malformed value would tell whoever sent it which values
 * are worth trying.
 */
export const parsePortalCall = (
  pathname: string,
  body: unknown,
): PortalCall | PortalResponse => {
  const segments = pathname.split("/").filter(Boolean);
  const action = segments[segments.length - 1];
  if (!isPortalAction(action)) {
    return { status: 404, body: { error: "quote_portal_not_found" } };
  }

  const fields = isRecord(body) ? body : {};
  const token = fields.token;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return { status: 404, body: { error: LINK_INVALID } };
  }

  switch (action) {
    case "view":
      return { action, token };
    case "accept":
      return {
        action,
        token,
        name: cleanLine(fields.name),
        email: cleanLine(fields.email),
      };
    case "reject":
      return {
        action,
        token,
        reasonCode: cleanLine(fields.reason_code),
        reason: cleanParagraph(fields.reason),
        name: cleanLine(fields.name),
        email: cleanLine(fields.email),
      };
    case "comment":
      return {
        action,
        token,
        body: cleanParagraph(fields.body),
        name: cleanLine(fields.name),
        email: cleanLine(fields.email),
      };
  }
};

export const isPortalCall = (
  value: PortalCall | PortalResponse,
): value is PortalCall => "action" in value;

/**
 * The token as the database knows it: the sha256 of its 32 BYTES (not of its
 * hex text), written as the bytea literal PostgREST passes through.
 *
 * Hashed here, so the raw token never reaches the database — the same rule
 * that keeps it from ever being stored there.
 */
export const tokenHashParam = async (token: string): Promise<string> => {
  const bytes = new Uint8Array(token.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(token.slice(index * 2, index * 2 + 2), 16);
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `\\x${hex}`;
};

/**
 * Where the request came from, kept as evidence on the acceptance record.
 *
 * EVIDENCE, NOT AUTHENTICATION. `cf-connecting-ip` is written by the edge
 * network in front of a hosted project and cannot be forged through it.
 * Without that proxy (a local stack, a self-hosted gateway) the forwarded
 * headers are whatever the hops wrote, and the first entry of
 * `x-forwarded-for` is the client's own claim. A value that is not an address
 * is dropped rather than passed on: the column is `inet`, and a malformed value
 * would fail the customer's whole answer.
 */
export const clientAddress = (headers: Headers): string | null => {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim() ?? "";
    if (isIP(value) !== 0) return value;
  }
  return null;
};

export const cleanUserAgent = (value: string | null): string | null =>
  cleanLine(value)?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;

/**
 * The SQL function each action calls, with its named arguments: the contract
 * with `supabase/schemas/02_functions.sql`. A misspelled argument is not a
 * type error anywhere — PostgREST answers it with "function not found" — which
 * is why the test pins every name.
 */
export const rpcCallFor = (
  call: PortalCall,
  tokenHash: string,
  ipAddress: string | null,
  userAgent: string | null,
): RpcCall => {
  const origin = {
    p_token_hash: tokenHash,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  };
  switch (call.action) {
    case "view":
      return { fn: "quote_portal_view", args: origin };
    case "accept":
      return {
        fn: "quote_portal_accept",
        args: { ...origin, p_name: call.name, p_email: call.email },
      };
    case "reject":
      return {
        fn: "quote_portal_reject",
        args: {
          ...origin,
          p_reason_code: call.reasonCode,
          p_reason: call.reason,
          p_name: call.name,
          p_email: call.email,
        },
      };
    case "comment":
      return {
        fn: "quote_portal_comment",
        args: {
          ...origin,
          p_body: call.body,
          p_name: call.name,
          p_email: call.email,
        },
      };
  }
};

/**
 * The status each refusal key earns — every key the portal functions raise or
 * return on purpose (`quote_portal.test.sql` pins them). A key not listed is
 * not one of those, so it is answered as a generic failure and its message
 * stays in the function's log: a database error string is written for an
 * operator, and on a public page it is a description of the schema.
 */
const STATUS_BY_KEY: Record<string, number> = {
  quote_link_invalid: 404,
  quote_portal_throttled: 429,
  quote_portal_name_required: 422,
  quote_portal_email_invalid: 422,
  quote_portal_reason_code_invalid: 422,
  quote_portal_input_too_long: 422,
  quote_portal_body_required: 422,
  quote_portal_comments_closed: 409,
  quote_portal_comment_limit: 429,
  quote_version_superseded: 409,
  quote_version_answered: 409,
  quote_validity_elapsed: 409,
  quote_transition_illegal: 409,
  quote_status_unchanged: 409,
  quote_transition_actor_not_allowed: 409,
};

export const responseFor = ({ data, error }: RpcResult): PortalResponse => {
  if (error) {
    const key = error.details ?? "";
    const status = STATUS_BY_KEY[key];
    return status
      ? { status, body: { error: key } }
      : { status: 500, body: { error: PORTAL_UNAVAILABLE } };
  }

  // The refusals that leave a trace are returned, not raised (02_functions.sql).
  if (isRecord(data) && typeof data.error === "string") {
    const status = STATUS_BY_KEY[data.error];
    if (!status) return { status: 500, body: { error: PORTAL_UNAVAILABLE } };
    return typeof data.retry_after_seconds === "number"
      ? {
          status,
          body: {
            error: data.error,
            retry_after_seconds: data.retry_after_seconds,
          },
        }
      : { status, body: { error: data.error } };
  }

  // `quote_portal_document()` is null only for a version never issued, which no
  // token can point at. Answered as a dead link, never as an empty document.
  if (!isRecord(data)) return { status: 404, body: { error: LINK_INVALID } };

  return { status: 200, body: { data } };
};
