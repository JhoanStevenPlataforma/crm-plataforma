import { useGetIdentity, useTranslate, type Identifier } from "ra-core";
import { useState } from "react";

import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type {
  Sale,
  TaskAttachment,
  TaskComment,
  TaskCommentReaction,
} from "../types";
import { TaskAttachmentList } from "./TaskAttachmentList";
import { TaskCommentBody } from "./TaskCommentBody";
import { TaskCommentInput } from "./TaskCommentInput";
import { TaskCommentReactions } from "./TaskCommentReactions";

/**
 * One comment in the thread (proposal §8.2).
 *
 * A deleted comment renders as a tombstone rather than disappearing: the row is
 * still there (deletion is soft), and a thread that silently loses a message is
 * exactly the kind of unexplained gap this module exists to remove.
 */
export const TaskCommentItem = ({
  comment,
  onEdit,
  onDelete,
  onReply,
  isPending,
  canReply = true,
  attachments = [],
  reactions = [],
  onOpenAttachment,
  onToggleReaction,
}: {
  comment: TaskComment;
  onEdit: (comment: TaskComment, body: string) => void;
  onDelete: (comment: TaskComment) => void;
  onReply?: (parentId: Identifier, body: string, files: File[]) => void;
  isPending?: boolean;
  canReply?: boolean;
  /** The files of THIS comment, fetched once for the whole thread. */
  attachments?: TaskAttachment[];
  reactions?: TaskCommentReaction[];
  onOpenAttachment?: (attachment: TaskAttachment) => void;
  onToggleReaction?: (
    comment: TaskComment,
    emoji: string,
    mine?: TaskCommentReaction,
  ) => void;
}) => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const [mode, setMode] = useState<"read" | "edit" | "reply">("read");

  const isAuthor = identity != null && comment.author_id === identity.id;

  if (comment.deleted_at) {
    return (
      <div className="text-xs italic text-muted-foreground py-1">
        {translate("resources.tasks.comments.deleted")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <ReferenceField<TaskComment, Sale>
          source="author_id"
          reference="sales"
          record={comment}
          className="inline text-sm font-medium"
          render={({ referenceRecord }) =>
            referenceRecord ? (
              <>
                {referenceRecord.first_name} {referenceRecord.last_name}
              </>
            ) : null
          }
        />

        <DateField
          source="created_at"
          record={comment}
          showDate
          showTime
          className="text-xs text-muted-foreground"
        />

        {comment.edit_count > 0 && (
          <span className="text-xs text-muted-foreground">
            {translate("resources.tasks.comments.edited", {
              count: comment.edit_count,
            })}
          </span>
        )}

        {comment.is_private && (
          <Badge variant="outline" className="text-[10px]">
            {translate("resources.tasks.comments.private")}
          </Badge>
        )}
      </div>

      {mode === "edit" ? (
        <TaskCommentInput
          initialValue={comment.body}
          isPending={isPending}
          submitLabel="ra.action.save"
          onCancel={() => setMode("read")}
          onSubmit={(body) => {
            onEdit(comment, body);
            setMode("read");
          }}
        />
      ) : (
        <TaskCommentBody body={comment.body} />
      )}

      {onOpenAttachment && (
        <TaskAttachmentList
          attachments={attachments}
          onOpen={onOpenAttachment}
        />
      )}

      {mode === "read" && onToggleReaction && (
        <TaskCommentReactions
          reactions={reactions}
          isPending={isPending}
          onToggle={(emoji, mine) => onToggleReaction(comment, emoji, mine)}
        />
      )}

      {mode === "read" && (
        <div className="flex gap-1">
          {canReply && onReply && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setMode("reply")}
            >
              {translate("resources.tasks.comments.reply")}
            </Button>
          )}
          {isAuthor && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setMode("edit")}
              >
                {translate("ra.action.edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onDelete(comment)}
              >
                {translate("ra.action.delete")}
              </Button>
            </>
          )}
        </div>
      )}

      {mode === "reply" && onReply && (
        <div className="pl-4 border-l">
          <TaskCommentInput
            isPending={isPending}
            canAttach
            onCancel={() => setMode("read")}
            onSubmit={(body, files) => {
              onReply(comment.id, body, files);
              setMode("read");
            }}
          />
        </div>
      )}
    </div>
  );
};
