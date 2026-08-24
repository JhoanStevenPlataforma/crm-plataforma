import type { Identifier, ResourceCallbacks } from "ra-core";

import type { TaskAssignment, TaskRole } from "../../types";
import { emitTaskEvent } from "./taskEventEmitter";

/**
 * Demo-mode counterpart of the `task_assignments` triggers (proposal §7).
 *
 * Two behaviours are worth reproducing, because both are what makes the
 * assignment table an audit trail rather than a join table:
 *
 *  - authorship is stamped server-side, never taken from the client;
 *  - removing somebody CLOSES their row (`unassigned_at`) instead of deleting
 *    it, so "who was on this task in June" stays answerable.
 *
 * The `owner` role stays silent here for the same reason it does in SQL: an
 * owner change already emits `task.reassigned`, and emitting both would put
 * three entries in the timeline for one action.
 */

const ADD_EVENT: Record<TaskRole, string | null> = {
  owner: null,
  collaborator: "task.assigned",
  watcher: "task.watcher_added",
  team: "task.team_assigned",
};

const REMOVE_EVENT: Record<TaskRole, string | null> = {
  owner: null,
  collaborator: "task.unassigned",
  watcher: "task.watcher_removed",
  team: "task.unassigned",
};

export const taskAssignmentCallbacks = (
  getIdentity: () => Promise<{ id: Identifier } | undefined>,
): ResourceCallbacks<TaskAssignment> => ({
  resource: "task_assignments",

  beforeCreate: async (params) => {
    const currentUser = await getIdentity();
    return {
      ...params,
      data: {
        ...params.data,
        assigned_by: currentUser?.id ?? params.data.assigned_by,
        assigned_at: new Date().toISOString(),
        unassigned_at: null,
        unassigned_by: null,
      },
    };
  },

  afterCreate: async (result, dataProvider) => {
    const assignment = result.data;
    const eventType = ADD_EVENT[assignment.role];
    if (!eventType) return result;

    await emitTaskEvent(dataProvider, {
      taskId: assignment.task_id,
      eventType,
      actor: assignment.assigned_by ?? null,
      note: assignment.reason ?? undefined,
      metadata: {
        assignment_id: assignment.id,
        role: assignment.role,
        sales_id: assignment.sales_id ?? null,
        team_id: assignment.team_id ?? null,
      },
    });

    return result;
  },

  beforeUpdate: async (params) => {
    if (params.data.unassigned_at == null) return params;
    const currentUser = await getIdentity();
    return {
      ...params,
      data: {
        ...params.data,
        unassigned_by: currentUser?.id ?? params.data.unassigned_by,
      },
    };
  },

  afterUpdate: async (result, dataProvider) => {
    const assignment = result.data;
    if (assignment.unassigned_at == null) return result;

    const eventType = REMOVE_EVENT[assignment.role];
    if (!eventType) return result;

    await emitTaskEvent(dataProvider, {
      taskId: assignment.task_id,
      eventType,
      actor: assignment.unassigned_by ?? null,
      metadata: {
        assignment_id: assignment.id,
        role: assignment.role,
        sales_id: assignment.sales_id ?? null,
        team_id: assignment.team_id ?? null,
      },
    });

    return result;
  },
});
