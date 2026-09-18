import {
  useCreate,
  useDataProvider,
  useGetIdentity,
  useGetList,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import type { QuoteComment, QuoteVersion } from "../types";
import { QuoteCommentInput } from "./QuoteCommentInput";
import { QuoteCommentItem } from "./QuoteCommentItem";

/** A quotation is negotiated by people: tens of messages, not thousands (§11). */
const THREAD_PAGE = { page: 1, perPage: 500 };

const isUnreadCustomerComment = (comment: QuoteComment) =>
  comment.author_kind === "customer" &&
  comment.read_by_internal_at == null &&
  comment.deleted_at == null;

/**
 * The negotiation thread of a quotation, the team's side of it (quotes §2.5,
 * Phase 8).
 *
 * One thread per QUOTE, not per version: a negotiation outlives the document it
 * started on, so a customer's question about version 1 is still on the page
 * while version 2 is drafted — labelled with the version it was asked about.
 * The customer reads the shared part of it, flat and oldest first, under the
 * document their link opens.
 *
 * What the database decides and this component therefore never sends: the
 * author, the dates, the thread depth (a reply to a reply hangs off the root),
 * the edit stamp and the read mark. It sends the words, the audience and, for a
 * reply, the comment replied to.
 *
 * "Read" is a fact somebody states, not a side effect of the page rendering: a
 * rep scrolling past a thread has not answered it. The list's attention badge
 * (`nb_unanswered_customer_comments`) clears when somebody marks the thread
 * read, or when somebody answers the customer — a SHARED comment is an answer,
 * an internal one is not.
 */
export const QuoteComments = ({
  quoteId,
  versions,
}: {
  quoteId: Identifier;
  versions: QuoteVersion[];
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { identity } = useGetIdentity();
  const [isMarking, setIsMarking] = useState(false);

  const { data, isPending, error } = useGetList<QuoteComment>(
    "quote_comments",
    {
      filter: { quote_id: quoteId },
      sort: { field: "created_at", order: "ASC" },
      pagination: THREAD_PAGE,
    },
  );
  const [create, { isPending: isCreating }] = useCreate<QuoteComment>();
  const [update, { isPending: isUpdating }] = useUpdate<QuoteComment>();
  const isMutating = isCreating || isUpdating || isMarking;

  const comments = data ?? [];
  const unreadCount = comments.filter(isUnreadCustomerComment).length;

  const versionNumberOf = (versionId?: Identifier | null) =>
    versionId == null
      ? null
      : (versions.find((version) => String(version.id) === String(versionId))
          ?.version_number ?? null);

  /** Says why, then rethrows so the composer keeps the words. */
  const attempt = async (write: () => Promise<unknown>) => {
    try {
      await write();
    } catch (caught) {
      notify("resources.quotes.comments.error", { type: "error" });
      throw caught;
    }
    refresh();
  };

  const post = (
    body: string,
    visibility: QuoteComment["visibility"],
    parentId?: Identifier,
  ) =>
    attempt(async () => {
      await create(
        "quote_comments",
        {
          data: {
            quote_id: quoteId,
            body,
            visibility,
            parent_id: parentId ?? null,
          },
        },
        { returnPromise: true },
      );
      // Answering the customer is reading them. Asked of the server rather
      // than decided from the list on screen, which may not have loaded yet:
      // a thread with nothing unread answers 0.
      if (visibility === "shared") {
        await dataProvider.markQuoteCommentsRead(quoteId);
      }
    });

  const edit = (comment: QuoteComment, body: string) =>
    attempt(() =>
      update(
        "quote_comments",
        { id: comment.id, data: { body }, previousData: comment },
        { returnPromise: true },
      ),
    );

  // Soft: the server stamps its own clock, and the row stays as a tombstone.
  const remove = (comment: QuoteComment) =>
    attempt(() =>
      update(
        "quote_comments",
        {
          id: comment.id,
          data: { deleted_at: new Date().toISOString() },
          previousData: comment,
        },
        { returnPromise: true },
      ),
    ).catch(() => undefined);

  const markRead = async () => {
    setIsMarking(true);
    try {
      await attempt(() => dataProvider.markQuoteCommentsRead(quoteId));
    } catch {
      // Already reported.
    } finally {
      setIsMarking(false);
    }
  };

  const roots = comments.filter((comment) => comment.parent_id == null);
  const repliesOf = (id: Identifier) =>
    comments.filter((comment) => String(comment.parent_id) === String(id));

  const itemOf = (comment: QuoteComment, canReply: boolean) => (
    <QuoteCommentItem
      comment={comment}
      versionNumber={versionNumberOf(comment.version_id)}
      isAuthor={
        identity != null &&
        String(comment.author_sales_id) === String(identity.id)
      }
      isPending={isMutating}
      canReply={canReply}
      onEdit={edit}
      onDelete={remove}
      onReply={(parent, body, visibility) => post(body, visibility, parent.id)}
    />
  );

  return (
    <section
      aria-labelledby="quote-comments-title"
      className="quote-print-hide flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quote-comments-title" className="text-base font-semibold">
          {translate("resources.quotes.comments.title")}
        </h2>
        {unreadCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isMutating}
            onClick={() => void markRead()}
          >
            {translate("resources.quotes.comments.mark_read", {
              smart_count: unreadCount,
            })}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.comments.load_error")}
        </p>
      ) : !isPending && comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.comments.empty")}
        </p>
      ) : null}

      <ol className="flex flex-col divide-y">
        {roots.map((comment) => (
          <li key={comment.id} className="flex flex-col">
            {itemOf(comment, comment.deleted_at == null)}
            {repliesOf(comment.id).length > 0 ? (
              // One level (§2.5): a reply offers no reply of its own.
              <ol className="ml-2 flex flex-col divide-y border-l pl-4">
                {repliesOf(comment.id).map((reply) => (
                  <li key={reply.id}>{itemOf(reply, false)}</li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>

      <QuoteCommentInput
        isPending={isMutating}
        onSubmit={(body, visibility) => post(body, visibility)}
      />
    </section>
  );
};
