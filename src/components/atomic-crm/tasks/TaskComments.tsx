import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";

import type {
  TaskAttachment,
  TaskComment,
  TaskCommentReaction,
} from "../types";
import { TaskCommentInput } from "./TaskCommentInput";
import { TaskCommentItem } from "./TaskCommentItem";
import { useTaskAttachments } from "./useTaskAttachments";

/**
 * The discussion on a task (proposal §8).
 *
 * What this buys, beyond a comment box: the coordination that used to happen in
 * a chat tool — "I called, no answer, can you try?" — becomes part of the
 * task's own record, attributable and timestamped, next to the work it is
 * about. Every write here also lands in `task_events`, so the History tab shows
 * the conversation alongside the field changes.
 *
 * Authorship, mention resolution, edit revisions and the soft delete are all
 * enforced by the database (§8.2); this component never sends any of them.
 *
 * Attachments and reactions are fetched once for the whole thread rather than
 * per comment: a message list is exactly where an N+1 shows up first.
 */
export const TaskComments = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();

  const { data, isPending, error } = useGetList<TaskComment>("task_comments", {
    filter: { task_id: taskId },
    sort: { field: "created_at", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });

  const comments = data ?? [];
  const commentIds = comments.map((comment) => comment.id);

  const { data: attachmentData } = useGetList<TaskAttachment>(
    "task_attachments",
    {
      filter: {
        task_id: taskId,
        "comment_id@not.is": null,
        "deleted_at@is": null,
      },
      sort: { field: "uploaded_at", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
  );

  const { data: reactionData } = useGetList<TaskCommentReaction>(
    "task_comment_reactions",
    {
      // PostgREST list syntax — `(1,2,3)`, not an array; the demo adapter
      // parses the same string, so one query covers the whole thread.
      filter: { "comment_id@in": `(${commentIds.join(",")})` },
      sort: { field: "created_at", order: "ASC" },
      pagination: { page: 1, perPage: 200 },
    },
    { enabled: commentIds.length > 0 },
  );

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const [deleteOne, { isPending: isDeleting }] = useDelete();
  const { upload, open, isUploading } = useTaskAttachments(taskId);

  const isMutating = isCreating || isUpdating || isDeleting || isUploading;

  const onError = () =>
    notify("resources.tasks.comments.error", { type: "error" });

  // The comment is created first because an attachment hangs off its id. A
  // failed upload therefore costs the file, never the message.
  const post = (body: string, files: File[] = [], parentId?: Identifier) =>
    create(
      "task_comments",
      { data: { task_id: taskId, body, parent_id: parentId ?? null } },
      {
        onSuccess: async (comment: TaskComment) => {
          if (files.length > 0) await upload(files, comment.id);
          refresh();
        },
        onError,
      },
    );

  // `previousData` is not optional: it is how the provider layer knows what
  // actually changed, which is what decides whether a revision is written.
  const edit = (comment: TaskComment, body: string) =>
    update(
      "task_comments",
      { id: comment.id, data: { body }, previousData: comment },
      { onSuccess: () => refresh(), onError },
    );

  // Soft delete: the row survives with its body, so the audit view keeps it.
  const remove = (comment: TaskComment) =>
    update(
      "task_comments",
      {
        id: comment.id,
        data: { deleted_at: new Date().toISOString() },
        previousData: comment,
      },
      { onSuccess: () => refresh(), onError },
    );

  // A reaction is a row, so un-reacting is a delete — the removal is still
  // recorded, as `comment.reaction_removed` (§8.2).
  const toggleReaction = (
    comment: TaskComment,
    emoji: string,
    mine?: TaskCommentReaction,
  ) => {
    if (mine) {
      deleteOne(
        "task_comment_reactions",
        { id: mine.id, previousData: mine },
        { onSuccess: () => refresh(), onError },
      );
      return;
    }
    create(
      "task_comment_reactions",
      { data: { comment_id: comment.id, emoji } },
      { onSuccess: () => refresh(), onError },
    );
  };

  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate("resources.tasks.comments.error")}
      </p>
    );
  }

  const roots = comments.filter((comment) => comment.parent_id == null);
  const repliesOf = (id: Identifier) =>
    comments.filter((comment) => comment.parent_id === id);
  const attachmentsOf = (id: Identifier) =>
    (attachmentData ?? []).filter((attachment) => attachment.comment_id === id);
  const reactionsOf = (id: Identifier) =>
    (reactionData ?? []).filter((reaction) => reaction.comment_id === id);

  return (
    <div className="flex flex-col gap-3">
      {!isPending && roots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {translate("resources.tasks.comments.empty")}
        </p>
      )}

      <ol className="flex flex-col divide-y">
        {roots.map((comment) => (
          <li key={comment.id} className="flex flex-col">
            <TaskCommentItem
              comment={comment}
              isPending={isMutating}
              attachments={attachmentsOf(comment.id)}
              reactions={reactionsOf(comment.id)}
              onEdit={edit}
              onDelete={remove}
              onOpenAttachment={open}
              onToggleReaction={toggleReaction}
              onReply={(parentId, body, files) => post(body, files, parentId)}
            />

            {repliesOf(comment.id).length > 0 && (
              <ol className="pl-4 border-l ml-2 flex flex-col divide-y">
                {repliesOf(comment.id).map((reply) => (
                  <li key={reply.id}>
                    {/* One level of nesting (§8.2): a reply has no reply
                        button, so the thread cannot grow a third level. */}
                    <TaskCommentItem
                      comment={reply}
                      isPending={isMutating}
                      attachments={attachmentsOf(reply.id)}
                      reactions={reactionsOf(reply.id)}
                      onEdit={edit}
                      onDelete={remove}
                      onOpenAttachment={open}
                      onToggleReaction={toggleReaction}
                      canReply={false}
                    />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>

      <TaskCommentInput
        isPending={isMutating}
        canAttach
        onSubmit={(body, files) => post(body, files)}
      />
    </div>
  );
};
