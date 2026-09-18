import type { Identifier, ResourceCallbacks } from "ra-core";

import type { Quote, QuoteComment } from "../../types";

/**
 * Demo-mode counterpart of the `quote_comments` triggers (quotes §2.5, Phase 8).
 *
 * In the real backend the database owns the thread's rules:
 * `quote_comments_before_insert` signs a comment with the session, fixes its
 * clock and keeps the thread one level deep; `quote_comments_before_update`
 * lets a written comment change in exactly three ways — its body (stamped
 * `edited_at`), a soft delete (stamped `deleted_at`), and, on a CUSTOMER
 * comment only, the read mark. FakeRest has no triggers, so the same rules are
 * reproduced here: a demo that let a rep share an internal remark after the
 * fact would teach exactly what the real backend refuses.
 *
 * What is deliberately not reproduced is the row level security (author-only
 * updates, internal-only inserts), for the reason `quoteMethods.ts` gives. A
 * client never sends `author_kind`, so it is simply forced here: in demo mode
 * there is no portal to write a customer comment through.
 */

/** What `quote_comments_before_update()` never lets change. */
const FIXED_COLUMNS = [
  "quote_id",
  "currency",
  "version_id",
  "parent_id",
  "author_sales_id",
  "author_kind",
  "author_name",
  "author_email",
  "visibility",
  "created_at",
  "edited_at",
] as const satisfies readonly (keyof QuoteComment)[];

const normalized = (value: unknown) => (value == null ? null : String(value));

const sameId = (
  a: Identifier | null | undefined,
  b: Identifier | null | undefined,
) => a != null && b != null && String(a) === String(b);

export const quoteCommentCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<QuoteComment> => ({
  resource: "quote_comments",

  beforeCreate: async (params, dataProvider) => {
    const data = params.data;
    // `quote_id` is `not null`: the insert fails, as it does in the database.
    if (data.quote_id == null) throw new Error("quote_id is required");
    const { data: quote } = await dataProvider.getOne<Quote>("quotes", {
      id: data.quote_id,
    });

    // One level of replies, on the same quote: a reply to a reply hangs off
    // the root, and a parent on another quote is refused.
    let parentId: Identifier | null = data.parent_id ?? null;
    if (parentId != null) {
      const { data: parent } = await dataProvider.getOne<QuoteComment>(
        "quote_comments",
        { id: parentId },
      );
      if (!sameId(parent?.quote_id, data.quote_id)) {
        throw new Error("quote_comment_parent_invalid");
      }
      parentId = parent.parent_id ?? parent.id;
    }

    const identity = await getIdentity();
    return {
      ...params,
      data: {
        ...data,
        currency: data.currency ?? quote.currency,
        parent_id: parentId,
        author_kind: "internal",
        author_sales_id: identity?.id ?? null,
        author_name: null,
        author_email: null,
        visibility: data.visibility ?? "internal",
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        read_by_internal_at: null,
      },
    };
  },

  beforeUpdate: async (params, dataProvider) => {
    // Compared against what is stored, not against the caller's
    // `previousData`: the trigger compares NEW with OLD, and OLD is the row.
    const { data: stored } = await dataProvider.getOne<QuoteComment>(
      "quote_comments",
      { id: params.id },
    );
    const next: QuoteComment = { ...stored, ...params.data };
    const changed = (column: keyof QuoteComment) =>
      normalized(next[column]) !== normalized(stored[column]);

    if (
      stored.deleted_at != null ||
      FIXED_COLUMNS.some(changed) ||
      (stored.author_kind === "customer" &&
        (changed("body") || changed("deleted_at"))) ||
      (stored.author_kind === "internal" && changed("read_by_internal_at"))
    ) {
      throw new Error("quote_comment_column_protected");
    }

    const now = new Date().toISOString();
    return {
      ...params,
      data: {
        ...params.data,
        ...(changed("body") ? { edited_at: now } : {}),
        ...(next.deleted_at != null ? { deleted_at: now } : {}),
      },
    };
  },
});
