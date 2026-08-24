import type { DataProvider, Identifier, ResourceCallbacks } from "ra-core";

import type { Task, TaskChecklistItem } from "../../types";
import { emitTaskEvent } from "./taskEventEmitter";

/**
 * Demo-mode counterpart of the `task_checklist_items` triggers (proposal §11).
 *
 * Mirrors what the database does: default ordering and authorship on insert,
 * an attributed completion stamp on every tick, one event per change into the
 * shared stream (§11.3), and `tasks.checklist_total` / `checklist_done`
 * recomputed from the rows so the "3/7" badge on the task row is never stale.
 */

/** Recomputes the counters from the items, exactly as the SQL function does. */
const refreshCounters = async (
  dataProvider: DataProvider,
  taskId: Identifier,
) => {
  const { data: items } = await dataProvider.getList<TaskChecklistItem>(
    "task_checklist_items",
    {
      filter: { task_id: taskId, "deleted_at@is": null },
      sort: { field: "position", order: "ASC" },
      pagination: { page: 1, perPage: 500 },
    },
  );

  const total = items.length;
  const done = items.filter((item) => item.is_done).length;

  const { data: task } = await dataProvider.getOne<Task>("tasks", {
    id: taskId,
  });
  if (task.checklist_total === total && task.checklist_done === done) return;

  await dataProvider.update<Task>("tasks", {
    id: taskId,
    data: { checklist_total: total, checklist_done: done },
    previousData: task,
  });
};

/** What the update in flight actually changed, worked out in `beforeUpdate`. */
type PendingChange = "done" | "reopened" | "removed" | "reordered" | "none";

export const taskChecklistCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskChecklistItem> => {
  let pending: PendingChange = "none";

  return {
    resource: "task_checklist_items",

    beforeCreate: async (params, dataProvider) => {
      const currentUser = await getIdentity();
      const { data } = params;

      let position = data.position;
      if (position == null) {
        // Append to the end, so typing steps in order needs no rank maths.
        const { data: siblings } =
          await dataProvider.getList<TaskChecklistItem>(
            "task_checklist_items",
            {
              filter: { task_id: data.task_id, "deleted_at@is": null },
              sort: { field: "position", order: "DESC" },
              pagination: { page: 1, perPage: 1 },
            },
          );
        position = (siblings[0]?.position ?? 0) + 1;
      }

      const isDone = data.is_done ?? false;
      return {
        ...params,
        data: {
          ...data,
          position,
          is_done: isDone,
          // A step created already ticked still carries its attribution.
          done_at: isDone ? new Date().toISOString() : null,
          done_by: isDone ? (currentUser?.id ?? null) : null,
          created_by: currentUser?.id ?? data.created_by,
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
      };
    },

    afterCreate: async (result, dataProvider) => {
      await emitTaskEvent(dataProvider, {
        taskId: result.data.task_id,
        eventType: "checklist.item_added",
        actor: result.data.created_by,
        metadata: { item_id: result.data.id, label: result.data.label },
      });
      await refreshCounters(dataProvider, result.data.task_id);
      return result;
    },

    beforeUpdate: async (params) => {
      const { data, previousData } = params;
      const currentUser = await getIdentity();

      if (previousData.deleted_at == null && data.deleted_at != null) {
        pending = "removed";
        return params;
      }

      if (data.is_done != null && data.is_done !== previousData.is_done) {
        pending = data.is_done ? "done" : "reopened";
        return {
          ...params,
          data: {
            ...data,
            // Who ticked it is resolved here, never taken from the client.
            done_at: data.is_done ? new Date().toISOString() : null,
            done_by: data.is_done ? (currentUser?.id ?? null) : null,
          },
        };
      }

      pending =
        data.position != null && data.position !== previousData.position
          ? "reordered"
          : "none";
      return params;
    },

    afterUpdate: async (result, dataProvider) => {
      const item = result.data;
      const change = pending;
      pending = "none";

      const eventType = {
        done: "checklist.item_completed",
        reopened: "checklist.item_reopened",
        removed: "checklist.item_removed",
        reordered: "checklist.item_reordered",
        none: null,
      }[change];

      if (eventType) {
        await emitTaskEvent(dataProvider, {
          taskId: item.task_id,
          eventType,
          actor: item.done_by ?? item.created_by,
          metadata: { item_id: item.id, label: item.label },
        });
      }

      await refreshCounters(dataProvider, item.task_id);
      return result;
    },
  };
};
