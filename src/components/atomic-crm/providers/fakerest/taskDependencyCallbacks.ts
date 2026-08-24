import type { DataProvider, Identifier, ResourceCallbacks } from "ra-core";

import { TASK_STATUSES } from "./dataGenerator/taskCatalogues";
import type { Task, TaskDependency } from "../../types";
import { emitTaskEvent } from "./taskEventEmitter";

/**
 * Demo-mode counterpart of the `task_dependencies` triggers (proposal §10).
 *
 * The behaviour worth reproducing is the automatic part: adding an open
 * blocker moves the target into `blocked`, and clearing the last one releases
 * it. Without that the demo would show the edge but never act on it, which is
 * exactly the difference between a dependency a user has to remember and one
 * the system enforces (§10.2).
 *
 * The cycle guard is not reproduced: it is a data-integrity rule the real
 * database owns, and a demo cannot corrupt anything that outlives the tab.
 */

const statusIdFor = (key: string) =>
  TASK_STATUSES.find((status) => status.key === key)?.id;

/** Does this task still have an unsatisfied blocker? */
const hasOpenBlockers = async (
  dataProvider: DataProvider,
  taskId: Identifier,
) => {
  const { data: edges } = await dataProvider.getList<TaskDependency>(
    "task_dependencies",
    {
      filter: { target_task_id: taskId, kind: "blocks", "removed_at@is": null },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 100 },
    },
  );
  if (edges.length === 0) return false;

  const { data: blockers } = await dataProvider.getMany<Task>("tasks", {
    ids: edges.map((edge) => edge.source_task_id),
  });

  return blockers.some(
    (task) => task.deleted_at == null && task.status_is_open !== false,
  );
};

/** Moves a task's status with no user behind it, and records why. */
const setStatusSystem = async (
  dataProvider: DataProvider,
  taskId: Identifier,
  statusKey: "blocked" | "pending",
  eventType: string,
  metadata: Record<string, unknown>,
) => {
  const status = TASK_STATUSES.find((entry) => entry.key === statusKey);
  const statusId = statusIdFor(statusKey);
  if (!status || statusId == null) return;

  const { data: task } = await dataProvider.getOne<Task>("tasks", {
    id: taskId,
  });
  if (task.status_key === statusKey) return;

  await dataProvider.update<Task>("tasks", {
    id: taskId,
    data: {
      status_id: statusId,
      status_key: statusKey,
      status_label: status.label,
      status_is_open: status.is_open,
      status_is_terminal: status.is_terminal,
      counts_as_done: status.counts_as_done,
    },
    previousData: task,
  });

  await emitTaskEvent(dataProvider, {
    taskId,
    eventType,
    actor: null,
    metadata: {
      ...metadata,
      from_status: task.status_key,
      to_status: statusKey,
    },
  });
};

/** Releases every task the given task was blocking, if nothing else blocks them. */
export const releaseDependentsOf = async (
  dataProvider: DataProvider,
  taskId: Identifier,
) => {
  const { data: edges } = await dataProvider.getList<TaskDependency>(
    "task_dependencies",
    {
      filter: { source_task_id: taskId, kind: "blocks", "removed_at@is": null },
      sort: { field: "id", order: "ASC" },
      pagination: { page: 1, perPage: 100 },
    },
  );

  for (const edge of edges) {
    await emitTaskEvent(dataProvider, {
      taskId: edge.target_task_id,
      eventType: "dependency.satisfied",
      actor: null,
      metadata: { source_task_id: taskId },
    });

    if (!(await hasOpenBlockers(dataProvider, edge.target_task_id))) {
      await setStatusSystem(
        dataProvider,
        edge.target_task_id,
        "pending",
        "task.unblocked",
        { source_task_id: taskId },
      );
    }
  }
};

export const taskDependencyCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskDependency> => ({
  resource: "task_dependencies",

  beforeCreate: async (params) => {
    const currentUser = await getIdentity();
    return {
      ...params,
      data: {
        ...params.data,
        created_by: currentUser?.id ?? params.data.created_by,
        created_at: new Date().toISOString(),
        removed_at: null,
      },
    };
  },

  afterCreate: async (result, dataProvider) => {
    const edge = result.data;
    const metadata = {
      dependency_id: edge.id,
      kind: edge.kind,
      source_task_id: edge.source_task_id,
      target_task_id: edge.target_task_id,
    };

    // Recorded on both tasks: each timeline should show the relationship.
    for (const id of [edge.target_task_id, edge.source_task_id]) {
      await emitTaskEvent(dataProvider, {
        taskId: id,
        eventType: "dependency.added",
        actor: edge.created_by,
        metadata,
      });
    }

    if (
      edge.kind === "blocks" &&
      (await hasOpenBlockers(dataProvider, edge.target_task_id))
    ) {
      await setStatusSystem(
        dataProvider,
        edge.target_task_id,
        "blocked",
        "task.blocked",
        metadata,
      );
    }

    return result;
  },

  afterUpdate: async (result, dataProvider) => {
    const edge = result.data;
    if (edge.removed_at == null) return result;

    await emitTaskEvent(dataProvider, {
      taskId: edge.target_task_id,
      eventType: "dependency.removed",
      actor: edge.created_by,
      metadata: { dependency_id: edge.id, kind: edge.kind },
    });

    // Removing the last blocker releases the task, as satisfying it would.
    if (
      edge.kind === "blocks" &&
      !(await hasOpenBlockers(dataProvider, edge.target_task_id))
    ) {
      await setStatusSystem(
        dataProvider,
        edge.target_task_id,
        "pending",
        "task.unblocked",
        { dependency_id: edge.id },
      );
    }

    return result;
  },
});
