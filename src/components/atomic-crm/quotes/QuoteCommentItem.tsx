import { useTranslate } from "ra-core";
import { useState } from "react";

import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { QuoteComment, Sale } from "../types";
import { QuoteCommentInput } from "./QuoteCommentInput";

/** A word with a dot, the shape `QuoteStatusBadge` uses: never colour alone. */
const Marker = ({ dot, children }: { dot: string; children: string }) => (
  <Badge variant="outline" className="gap-1.5 font-normal whitespace-nowrap">
    <span
      className={cn("size-1.5 shrink-0 rounded-full", dot)}
      aria-hidden="true"
    />
    {children}
  </Badge>
);

/**
 * One message of a quotation's thread (quotes §2.5).
 *
 * WHO IT REACHES is on every comment, not only on the composer: "shared" means
 * the customer reads it on the link, and a reader of the thread must never have
 * to guess which of the team's remarks the customer has seen. A customer's own
 * comment is marked as theirs, with the address they signed with — which the
 * portal never shows anybody — and as unread until somebody marks the thread.
 *
 * The body is plain text in a `whitespace-pre-line` paragraph, never markdown:
 * a customer's words are attacker-controlled text, and the team's shared ones
 * are printed the same way on the portal, so both sides render one format.
 *
 * Only the author edits or deletes, and only a team comment; a customer's words
 * are the other side's record of the negotiation. A deleted comment stays as a
 * tombstone — deletion is soft, and a thread that silently loses a message
 * reads as complete when it is not.
 */
export const QuoteCommentItem = ({
  comment,
  versionNumber,
  isAuthor,
  isPending,
  canReply,
  onEdit,
  onDelete,
  onReply,
}: {
  comment: QuoteComment;
  /** The version the customer's link opened, when the comment names one. */
  versionNumber?: number | null;
  isAuthor: boolean;
  isPending: boolean;
  canReply: boolean;
  onEdit: (comment: QuoteComment, body: string) => Promise<void>;
  onDelete: (comment: QuoteComment) => void;
  onReply: (
    parent: QuoteComment,
    body: string,
    visibility: QuoteComment["visibility"],
  ) => Promise<void>;
}) => {
  const translate = useTranslate();
  const [mode, setMode] = useState<"read" | "edit" | "reply">("read");

  if (comment.deleted_at) {
    return (
      <p className="py-2 text-xs italic text-muted-foreground">
        {translate("resources.quotes.comments.deleted")}
      </p>
    );
  }

  const isCustomer = comment.author_kind === "customer";
  const isUnread = isCustomer && comment.read_by_internal_at == null;
  const canChange = isAuthor && !isCustomer;

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {isCustomer ? (
          <span className="text-sm font-medium">
            {comment.author_name}
            {comment.author_email ? (
              <span className="ml-1 font-normal text-muted-foreground">
                &lt;{comment.author_email}&gt;
              </span>
            ) : null}
          </span>
        ) : (
          <ReferenceField<QuoteComment, Sale>
            source="author_sales_id"
            reference="sales"
            record={comment}
            link={false}
            className="inline text-sm font-medium"
            render={({ referenceRecord }) =>
              referenceRecord
                ? `${referenceRecord.first_name} ${referenceRecord.last_name}`
                : null
            }
          />
        )}
        <DateField
          source="created_at"
          record={comment}
          showDate
          showTime
          className="text-xs text-muted-foreground"
        />
        {comment.edited_at ? (
          <span className="text-xs text-muted-foreground">
            {translate("resources.quotes.comments.edited")}
          </span>
        ) : null}
        {versionNumber != null ? (
          <span className="text-xs text-muted-foreground">
            {translate("resources.quotes.comments.on_version", {
              number: versionNumber,
            })}
          </span>
        ) : null}
        {isCustomer ? (
          <Marker dot="bg-info">
            {translate("resources.quotes.comments.from_customer")}
          </Marker>
        ) : comment.visibility === "shared" ? (
          <Marker dot="bg-info">
            {translate("resources.quotes.comments.shared")}
          </Marker>
        ) : (
          <Marker dot="bg-muted-foreground">
            {translate("resources.quotes.comments.internal")}
          </Marker>
        )}
        {isUnread ? (
          <Marker dot="bg-warning">
            {translate("resources.quotes.comments.unread")}
          </Marker>
        ) : null}
      </div>

      {mode === "edit" ? (
        <QuoteCommentInput
          initialBody={comment.body}
          showVisibility={false}
          isPending={isPending}
          submitLabel="ra.action.save"
          onCancel={() => setMode("read")}
          onSubmit={async (body) => {
            await onEdit(comment, body);
            setMode("read");
          }}
        />
      ) : (
        <p className="whitespace-pre-line break-words text-sm">
          {comment.body}
        </p>
      )}

      {mode === "read" && (canReply || canChange) ? (
        <div className="flex gap-1">
          {canReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setMode("reply")}
            >
              {translate("resources.quotes.comments.reply")}
            </Button>
          ) : null}
          {canChange ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={isPending}
                onClick={() => setMode("edit")}
              >
                {translate("ra.action.edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={isPending}
                onClick={() => onDelete(comment)}
              >
                {translate("ra.action.delete")}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {mode === "reply" ? (
        <div className="border-l pl-4">
          <QuoteCommentInput
            isPending={isPending}
            onCancel={() => setMode("read")}
            onSubmit={async (body, visibility) => {
              await onReply(comment, body, visibility);
              setMode("read");
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
