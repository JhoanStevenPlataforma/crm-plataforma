import type { DataProvider, Identifier, ResourceCallbacks } from "ra-core";

import type { Task, TaskComment } from "../../types";
import { mentionedSalesIds } from "../../tasks/taskMentions";
import { emitTaskEvent } from "./taskEventEmitter";

/**
 * Demo-mode counterpart of the `task_comments` triggers (proposal §8).
 *
 * In the real backend the database owns all of this: authorship, the comment
 * counter, the edit revisions and the event stream are written by triggers so
 * that no write path can skip them. FakeRest has no triggers, so the same
 * guarantees are reproduced here — otherwise the demo would show a comment
 * thread with an empty History tab, which is precisely the thing the module
 * exists to fix.
 *
 * Kept in its own module rather than inlined into `dataProvider.ts`: that file
 * is already long, and this is a self-contained emulation of one table.
 */

/** Adds `delta` to a task's comment counter, never letting it go negative. */
const bumpCommentCount = async (
  dataProvider: DataProvider,
  taskId: Identifier,
  delta: number,
) => {
  const { data: task } = await dataProvider.getOne<Task>("tasks", {
    id: taskId,
  });
  await dataProvider.update<Task>("tasks", {
    id: taskId,
    data: { comment_count: Math.max((task.comment_count ?? 0) + delta, 0) },
    previousData: task,
  });
};

/** What the update currently in flight actually changed. */
type PendingChange = "body" | "deleted" | "restored" | "none";

export const taskCommentCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskComment> => {
  // `afterUpdate` receives no `previousData`, so what changed is worked out in
  // `beforeUpdate` and carried across. Same idiom as `taskUpdateType` in
  // `dataProvider.ts`; safe because the fake provider serves one call at a time.
  let pending: PendingChange = "none";
  // The body being replaced, kept for the revision row and the edit event.
  let supersededBody = "";

  return {
    resource: "task_comments",

    beforeCreate: async (params) => {
      const currentUser = await getIdentity();
      return {
        ...params,
        data: {
          ...params.data,
          // Authorship comes from the session, exactly as the trigger does: a
          // client-supplied author would make the whole thread unattributable.
          author_id: currentUser?.id ?? params.data.author_id,
          is_private: params.data.is_private ?? false,
          edit_count: 0,
          edited_at: null,
          deleted_at: null,
          created_at: new Date().toISOString(),
        },
      };
    },

    afterCreate: async (result, dataProvider) => {
      const comment = result.data;
      await bumpCommentCount(dataProvider, comment.task_id, 1);

      await emitTaskEvent(dataProvider, {
        taskId: comment.task_id,
        eventType: "comment.created",
        actor: comment.author_id,
        note: comment.body.slice(0, 500),
        metadata: {
          comment_id: comment.id,
          parent_id: comment.parent_id ?? null,
          is_private: comment.is_private,
        },
      });

      for (const salesId of mentionedSalesIds(comment.body)) {
        await emitTaskEvent(dataProvider, {
          taskId: comment.task_id,
          eventType: "mention.created",
          actor: comment.author_id,
          metadata: { comment_id: comment.id, mentioned_sales_id: salesId },
        });
      }

      return result;
    },

    beforeUpdate: async (params) => {
      const { data, previousData } = params;

      const wasDeleted = previousData.deleted_at != null;
      const isDeleted = data.deleted_at != null;
      if (!wasDeleted && isDeleted) pending = "deleted";
      else if (wasDeleted && !isDeleted) pending = "restored";
      else if (data.body != null && data.body !== previousData.body) {
        pending = "body";
      } else pending = "none";

      if (pending !== "body") return params;
      supersededBody = previousData.body;

      // The superseded body becomes a revision before the update overwrites it,
      // exactly as `task_comments_before_update` does.
      return {
        ...params,
        data: {
          ...data,
          edit_count: (previousData.edit_count ?? 0) + 1,
          edited_at: new Date().toISOString(),
        },
      };
    },

    afterUpdate: async (result, dataProvider) => {
      const comment = result.data;
      const change = pending;
      pending = "none";

      if (change === "deleted") {
        await bumpCommentCount(dataProvider, comment.task_id, -1);
        await emitTaskEvent(dataProvider, {
          taskId: comment.task_id,
          eventType: "comment.deleted",
          actor: comment.author_id,
          metadata: { comment_id: comment.id },
        });
        return result;
      }

      if (change === "restored") {
        await bumpCommentCount(dataProvider, comment.task_id, 1);
        return result;
      }

      if (change === "body") {
        await dataProvider.create("task_comment_revisions", {
          data: {
            comment_id: comment.id,
            body: supersededBody,
            edited_by: comment.author_id,
            edited_at: comment.edited_at,
            revision: comment.edit_count,
          },
        });

        await emitTaskEvent(dataProvider, {
          taskId: comment.task_id,
          eventType: "comment.edited",
          actor: comment.author_id,
          oldValue: { body: supersededBody },
          newValue: { body: comment.body },
          metadata: { comment_id: comment.id, revision: comment.edit_count },
        });
      }

      return result;
    },
  };
};
