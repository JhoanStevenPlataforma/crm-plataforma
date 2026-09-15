/**
 * The refusals of the quote RPCs, as a vocabulary both data providers and the
 * screens share (quotes §13.5).
 *
 * The rule this module exists to enforce is the one `dealStageGate.ts` states:
 * MATCH ON THE KEY, NEVER ON THE MESSAGE. Postgres carries the key in the
 * exception's `DETAIL`, which PostgREST surfaces as `error.details`; the
 * message is prose, it is written for a log, and it changes. A screen that
 * greps a message is one wording away from telling a user "something went
 * wrong" about the one failure they could have fixed themselves.
 *
 * Every refusal below is actionable by somebody: raise the ceiling, write the
 * reason, add a line, open a revision. That is what earns each of them a
 * sentence of its own in the catalogues instead of a shared apology.
 */

import type { QuoteDiscountGate } from "../../types";

/**
 * The `details` keys the module raises. The values are the database's, not
 * ours: they are asserted against `sqlstate:detail` in the pgTAP suite, so a
 * key renamed on one side turns a test red on the other.
 */
export const QUOTE_ERROR = {
  /** An issued version, or one of its lines, was touched. */
  versionFrozen: "quote_version_frozen",
  /** A client changed a system-owned column of a draft version. */
  versionColumnProtected: "quote_version_column_protected",
  /** A line write while the quote is not a draft. */
  notDraft: "quote_not_draft",
  /** No edge from the current status to the target. */
  transitionIllegal: "quote_transition_illegal",
  /** Already in that status. */
  statusUnchanged: "quote_status_unchanged",
  /** The move needs a written reason. */
  reasonRequired: "quote_reason_required",
  /** Nothing issued to revise, to link to, or to transition from. */
  notIssued: "quote_not_issued",
  /** Above the ceiling: an admin override is what is needed. */
  discountExceedsLimit: "quote_discount_exceeds_limit",
  /** Inside the ceiling, above the band that needs a written motive. */
  discountReasonRequired: "quote_discount_reason_required",
  /** A draft is already open. */
  draftExists: "quote_draft_exists",
  /** The offer has lapsed, so any link would be dead on arrival. */
  validityElapsed: "quote_validity_elapsed",
  /** A changed `valid_until` / `terms` posted to the header. */
  headerDerived: "quote_header_derived",
  /** The draft has no lines. */
  empty: "quote_empty",
  /** Nothing to issue. */
  noDraft: "quote_no_draft",
  /** Wrong actor for this edge. */
  actorNotAllowed: "quote_transition_actor_not_allowed",
  /** A rep tried to approve their own quote. */
  approvalRequiresManager: "quote_approval_requires_manager",
} as const;

export type QuoteErrorKey = (typeof QUOTE_ERROR)[keyof typeof QUOTE_ERROR];

const KNOWN_KEYS = new Set<string>(Object.values(QUOTE_ERROR));

/**
 * The error both data providers throw when a quote RPC refuses.
 *
 * It carries the gate when the database attached one, so a dialog can say
 * "15% of 10%" without asking the server a question it has already answered —
 * the same reason `DealStageGateError` carries its counts.
 */
export class QuoteRpcError extends Error {
  /** The stable key, or null when the failure was not one of ours. */
  readonly key: QuoteErrorKey | null;
  readonly gate?: QuoteDiscountGate;

  constructor(
    message: string,
    key: QuoteErrorKey | null,
    gate?: QuoteDiscountGate,
  ) {
    super(message);
    this.name = "QuoteRpcError";
    this.key = key;
    this.gate = gate;
  }
}

export const isQuoteRpcError = (error: unknown): error is QuoteRpcError =>
  error instanceof QuoteRpcError;

/**
 * The gate the database attached to a discount refusal.
 *
 * A hint we cannot read costs the dialog a number in its sentence, never the
 * refusal itself — so it is swallowed rather than raised over the error it was
 * decorating.
 */
export const parseQuoteGate = (
  hint: unknown,
): QuoteDiscountGate | undefined => {
  if (typeof hint !== "string" || hint === "") return undefined;
  try {
    return JSON.parse(hint) as QuoteDiscountGate;
  } catch {
    return undefined;
  }
};

/** The shape PostgREST hands back, and the only part of it worth reading. */
type PostgrestLikeError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * Turns whatever the backend answered into the one error type the screens
 * handle.
 *
 * `details` is where the key lives. `message` is checked as a fallback for the
 * same reason `dealStageGate.ts` checks it: a proxy that reshapes the body must
 * not be able to turn an actionable refusal into a generic failure — but it is
 * a fallback, never the primary test.
 */
export const quoteRpcError = (
  error: PostgrestLikeError | null | undefined,
  fallbackMessage: string,
): QuoteRpcError => {
  const details = error?.details ?? "";
  const message = error?.message ?? "";

  const key =
    (KNOWN_KEYS.has(details) ? (details as QuoteErrorKey) : null) ??
    ([...KNOWN_KEYS].find((candidate) => message.includes(candidate)) as
      | QuoteErrorKey
      | undefined) ??
    null;

  return new QuoteRpcError(
    message || fallbackMessage,
    key,
    parseQuoteGate(error?.hint),
  );
};

/**
 * The translation key for a refusal, for the caller that renders it.
 *
 * An unrecognised failure falls back to one sentence rather than to the
 * database's own prose: a raw Postgres message in a toast is noise to the
 * person reading it and detail in a log to anyone else.
 */
export const quoteErrorMessage = (error: unknown): string =>
  isQuoteRpcError(error) && error.key
    ? `resources.quotes.errors.${error.key}`
    : "resources.quotes.errors.generic";
