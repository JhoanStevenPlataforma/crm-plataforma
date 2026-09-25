import type { Identifier } from "ra-core";

import type { Task } from "../types";

/**
 * The soonest open task per linked record (contact, deal...), keyed on the
 * task's primary link. A task with no due date comes last.
 *
 * Callers fetch the open tasks of a whole page in one query and fold them
 * here, rather than asking once per row.
 */
export const nextTaskByEntity = (
  tasks: readonly Task[],
): Map<Identifier, Task> => {
  const dueTime = (task: Task) =>
    task.due_date ? new Date(task.due_date).getTime() : Infinity;
  const byEntity = new Map<Identifier, Task>();
  for (const task of tasks) {
    const entityId = task.primary_entity_id;
    if (entityId == null) continue;
    const current = byEntity.get(entityId);
    if (!current || dueTime(task) < dueTime(current)) {
      byEntity.set(entityId, task);
    }
  }
  return byEntity;
};
