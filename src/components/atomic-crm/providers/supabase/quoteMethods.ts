/**
 * The quote RPCs, as data-provider methods (quotes §13.4).
 *
 * Every one of these is the ONLY write path for what it does. `status_key` is
 * refused by `quotes_status_guard` on a plain update, an issued version is
 * frozen forever, and a token is minted in exactly one function — so these are
 * not conveniences over an update the client could also do by hand. There is no
 * other door.
 *
 * They are collected here rather than inlined in `dataProvider.ts` for the
 * reason the phase plan gives: the demo mirror has to implement the same
 * methods, and two lists in two files drift. The contract is this module's
 * exported types, and `fakerest/quoteMethods.ts` satisfies it.
 *
 * Refusals become a `QuoteRpcError` carrying the stable key from the
 * exception's `DETAIL` — never the message (`providers/commons/quoteRpc.ts`).
 */

import type { Identifier } from "ra-core";

import type {
  Quote,
  QuoteDiscountGate,
  QuoteLink,
  QuoteStatusKey,
  QuoteVersion,
} from "../../types";
import { quoteRpcError } from "../commons/quoteRpc";

/**
 * The only part of the Supabase client these methods use.
 *
 * Structural rather than the imported `SupabaseClient`, so the contract is
 * visible and a test can satisfy it with an object literal instead of a mock of
 * a library.
 */
export type QuoteRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      message?: string | null;
      details?: string | null;
      hint?: string | null;
    } | null;
  }>;
};

/** How long a portal link lives, unless the caller shortens it (§6.2). */
export const DEFAULT_TOKEN_DAYS = 30;

export type IssueQuoteOptions = {
  tokenDays?: number;
  tokenLabel?: string | null;
  /**
   * Admin-only, and only when the discount gate refuses. Sent as typed: the
   * server decides whether the caller may use it, so a rep filling it in learns
   * nothing about the privilege.
   */
  overrideReason?: string | null;
  /**
   * The written motive the gate asks for inside the ceiling but above the
   * reason band. A different fact from the override, and stored in a different
   * place: this one lands on the `sent` history row.
   */
  reason?: string | null;
};

export type CreateQuoteLinkOptions = {
  tokenDays?: number;
  tokenLabel?: string | null;
};

/** The methods a data provider must offer for the quote screens to work. */
export type QuoteMethods = {
  getQuoteDiscountGate(quoteId: Identifier): Promise<QuoteDiscountGate>;
  transitionQuote(
    quoteId: Identifier,
    toStatus: QuoteStatusKey,
    options?: { reason?: string | null },
  ): Promise<Quote>;
  issueQuoteVersion(
    quoteId: Identifier,
    options?: IssueQuoteOptions,
  ): Promise<QuoteLink>;
  createQuoteLink(
    quoteId: Identifier,
    options?: CreateQuoteLinkOptions,
  ): Promise<QuoteLink>;
  reviseQuote(quoteId: Identifier, reason: string): Promise<QuoteVersion>;
  revokeQuoteToken(tokenId: Identifier): Promise<void>;
  markQuoteCommentsRead(quoteId: Identifier): Promise<number>;
};

export const createQuoteMethods = (
  getClient: () => QuoteRpcClient,
): QuoteMethods => {
  const call = async <T>(
    fn: string,
    args: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<T> => {
    const { data, error } = await getClient().rpc(fn, args);
    if (error) {
      throw quoteRpcError(error, fallbackMessage);
    }
    return data as T;
  };

  return {
    /**
     * What the issue dialog shows before anything is written: how much discount
     * this document grants and how much the caller is allowed to grant.
     *
     * The same function `issue_quote_version()` calls to decide, so the dialog
     * cannot enable a button for an issue the server is going to refuse. That
     * is the whole reason the rule is one function with two callers (§3.1).
     */
    getQuoteDiscountGate: (quoteId) =>
      call<QuoteDiscountGate>(
        "quote_discount_gate",
        { p_quote_id: quoteId },
        "Failed to read the discount rule",
      ),

    /**
     * Moves a quote through the status machine.
     *
     * A plain `update` on `status_key` is refused by `quotes_status_guard`, so
     * this is the only path. Legality, the reason requirement and the
     * issued-version requirement all come from `quote_transitions` — this
     * method states none of them, it just carries the refusal back.
     *
     * `p_attachments` is deliberately not exposed: nothing internal uploads
     * evidence with a status move yet, and a parameter with no caller is a
     * contract nobody is testing.
     */
    transitionQuote: (quoteId, toStatus, options = {}) =>
      call<Quote>(
        "transition_quote",
        {
          p_quote_id: quoteId,
          p_to_status: toStatus,
          p_reason: options.reason ?? null,
        },
        "Failed to move the quote",
      ),

    /**
     * Freezes the draft into a document and mints the link to it.
     *
     * The raw token comes back EXACTLY ONCE, in this response: the database
     * stores only its sha256. Whatever needs the link has to build it here —
     * asking again is not possible, only minting another one is.
     */
    issueQuoteVersion: (quoteId, options = {}) =>
      call<QuoteLink>(
        "issue_quote_version",
        {
          p_quote_id: quoteId,
          p_token_days: options.tokenDays ?? DEFAULT_TOKEN_DAYS,
          p_token_label: options.tokenLabel ?? null,
          p_override_reason: options.overrideReason ?? null,
          p_reason: options.reason ?? null,
        },
        "Failed to issue the quote",
      ),

    /** Another link to the live document; the older ones keep working. */
    createQuoteLink: (quoteId, options = {}) =>
      call<QuoteLink>(
        "create_quote_link",
        {
          p_quote_id: quoteId,
          p_token_days: options.tokenDays ?? DEFAULT_TOKEN_DAYS,
          p_token_label: options.tokenLabel ?? null,
        },
        "Failed to create the link",
      ),

    /**
     * Opens a new draft from the last issued document, and revokes the links
     * that pointed at it.
     *
     * Copying rather than editing is what makes the snapshot hold (§4): the
     * customer's copy stays byte-identical to what they were shown.
     */
    reviseQuote: (quoteId, reason) =>
      call<QuoteVersion>(
        "revise_quote",
        { p_quote_id: quoteId, p_reason: reason },
        "Failed to revise the quote",
      ),

    /**
     * Withdraws one link. Returns nothing on purpose: the token row carries the
     * hash, so the caller re-reads `quote_access_tokens_summary` instead.
     */
    revokeQuoteToken: async (tokenId) => {
      await call<void>(
        "revoke_quote_token",
        { p_token_id: tokenId },
        "Failed to revoke the link",
      );
    },

    /**
     * Somebody on the team has read what the customer wrote. Returns how many
     * comments it marked; a thread already read is 0, not an error.
     *
     * A function and not an update, because no policy can say it: a comment
     * update belongs to its author, and a customer's comment has no author on
     * this side (§13.6 #6).
     */
    markQuoteCommentsRead: (quoteId) =>
      call<number>(
        "mark_quote_comments_read",
        { p_quote_id: quoteId },
        "Failed to mark the comments as read",
      ),
  };
};
