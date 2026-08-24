import type { DataProvider, Identifier, ResourceCallbacks } from "ra-core";

import type { Task, TaskAttachment, TaskCommentReaction } from "../../types";
import { emitTaskEvent } from "./taskEventEmitter";

/**
 * Demo-mode counterpart of the `task_attachments` and
 * `task_comment_reactions` triggers (proposal §3.2, §8.2).
 *
 * In the real backend the database owns all of this: the uploader, the
 * `attachment_count` counter, the soft-delete attribution and the event stream
 * are written by triggers so no write path can skip them. FakeRest has no
 * triggers, so the same guarantees are reproduced here — otherwise the demo
 * would show a file being attached and an empty History tab next to it.
 */

/** Recomputes a task's attachment counter from the live rows, as the trigger does. */
const refreshAttachmentCounter = async (
  dataProvider: DataProvider,
  taskId: Identifier,
) => {
  const { total } = await dataProvider.getList<TaskAttachment>(
    "task_attachments",
    {
      filter: { task_id: taskId, "deleted_at@is": null },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 1 },
    },
  );

  const { data: task } = await dataProvider.getOne<Task>("tasks", {
    id: taskId,
  });

  if ((task.attachment_count ?? 0) === total) return;

  await dataProvider.update<Task>("tasks", {
    id: taskId,
    data: { attachment_count: total },
    previousData: task,
  });
};

export const taskAttachmentCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskAttachment> => {
  // `afterUpdate` gets no `previousData`, so what changed is decided in
  // `beforeUpdate` and carried across — same idiom as the comment callbacks.
  let pendingRemoval = false;

  return {
    resource: "task_attachments",

    beforeCreate: async (params) => {
      const currentUser = await getIdentity();
      return {
        ...params,
        data: {
          ...params.data,
          // The uploader comes from the session, exactly as the trigger does.
          uploaded_by: currentUser?.id ?? params.data.uploaded_by,
          comment_id: params.data.comment_id ?? null,
          uploaded_at: new Date().toISOString(),
          deleted_at: null,
        },
      };
    },

    afterCreate: async (result, dataProvider) => {
      const attachment = result.data;
      await refreshAttachmentCounter(dataProvider, attachment.task_id);
      await emitTaskEvent(dataProvider, {
        taskId: attachment.task_id,
        eventType: "attachment.added",
        actor: attachment.uploaded_by,
        metadata: {
          attachment_id: attachment.id,
          comment_id: attachment.comment_id ?? null,
          file_name: attachment.file_name,
          mime_type: attachment.mime_type ?? null,
          size_bytes: attachment.size_bytes ?? null,
        },
      });
      return result;
    },

    beforeUpdate: async (params) => {
      const currentUser = await getIdentity();
      pendingRemoval =
        params.previousData.deleted_at == null &&
        params.data.deleted_at != null;

      if (!pendingRemoval) return params;

      return {
        ...params,
        data: {
          ...params.data,
          deleted_by: currentUser?.id ?? params.data.deleted_by,
        },
      };
    },

    afterUpdate: async (result, dataProvider) => {
      const attachment = result.data;
      const removed = pendingRemoval;
      pendingRemoval = false;

      await refreshAttachmentCounter(dataProvider, attachment.task_id);

      if (removed) {
        await emitTaskEvent(dataProvider, {
          taskId: attachment.task_id,
          eventType: "attachment.removed",
          actor: attachment.deleted_by ?? attachment.uploaded_by,
          metadata: {
            attachment_id: attachment.id,
            comment_id: attachment.comment_id ?? null,
            file_name: attachment.file_name,
          },
        });
      }

      return result;
    },
  };
};

/**
 * Reactions (§8.2). A 👍 is an "acknowledged" signal, so it belongs in the
 * audit trail like any other acknowledgement — and it is always your own.
 */
export const taskCommentReactionCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskCommentReaction> => ({
  resource: "task_comment_reactions",

  beforeCreate: async (params) => {
    const currentUser = await getIdentity();
    return {
      ...params,
      data: {
        ...params.data,
        sales_id: currentUser?.id ?? params.data.sales_id,
        created_at: new Date().toISOString(),
      },
    };
  },

  afterCreate: async (result, dataProvider) =>
    emitReactionEvent(dataProvider, result.data, "comment.reaction_added").then(
      () => result,
    ),

  afterDelete: async (result, dataProvider) =>
    emitReactionEvent(
      dataProvider,
      result.data,
      "comment.reaction_removed",
    ).then(() => result),
});

const emitReactionEvent = async (
  dataProvider: DataProvider,
  reaction: TaskCommentReaction,
  eventType: string,
) => {
  const { data: comment } = await dataProvider.getOne("task_comments", {
    id: reaction.comment_id,
  });

  await emitTaskEvent(dataProvider, {
    taskId: comment.task_id,
    eventType,
    actor: reaction.sales_id,
    metadata: { comment_id: reaction.comment_id, emoji: reaction.emoji },
  });
};
