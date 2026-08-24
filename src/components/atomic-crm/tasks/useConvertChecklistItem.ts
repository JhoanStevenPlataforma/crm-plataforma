import {
  useDataProvider,
  useNotify,
  useRefresh,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import type { Task, TaskChecklistItem } from "../types";

/**
 * "Convert this step into a sub-task" (proposal §11.1).
 *
 * The distinction the proposal draws: a checklist item is a step of YOUR work,
 * a sub-task is work somebody else can own, schedule and be measured on. The
 * moment a step needs its own owner or due date it has outgrown the checklist,
 * and retyping it into a new task is the friction that stops people doing it.
 *
 * The new task inherits from the parent (contact, type, priority, owner) unless
 * the step already carried its own assignee or due date, in which case the
 * step's values win — that is why the user is converting it.
 *
 * Every event this produces is written by the database (task creation and the
 * `parent` edge each emit their own), so nothing here writes history directly.
 */
export const useConvertChecklistItem = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [isConverting, setIsConverting] = useState(false);

  const convert = async (item: TaskChecklistItem, parentTaskId: Identifier) => {
    if (isConverting) return;
    setIsConverting(true);

    try {
      const { data: parent } = await dataProvider.getOne<Task>("tasks", {
        id: parentTaskId,
      });

      const { data: subTask } = await dataProvider.create<Task>("tasks", {
        data: {
          title: item.label,
          // The legacy `text` / `type` shims are still what the create path
          // writes; the database resolves them to the new columns.
          text: item.label,
          type: parent.type ?? "none",
          contact_id: parent.contact_id,
          due_date: item.due_at ?? parent.due_date,
          priority_id: parent.priority_id,
          owner_sales_id: item.assignee_id ?? parent.owner_sales_id,
        },
      });

      // "A parent of B" means B is the sub-task, so the parent is the SOURCE.
      // Reversing this would make the child look like the container (§10.2).
      await dataProvider.create("task_dependencies", {
        data: {
          source_task_id: parentTaskId,
          target_task_id: subTask.id,
          kind: "parent",
        },
      });

      // The step now exists as a task. Keeping both would double-count the
      // work in the "3/7" counter and in every metric downstream of it.
      await dataProvider.update("task_checklist_items", {
        id: item.id,
        data: { deleted_at: new Date().toISOString() },
        previousData: item,
      });

      notify("resources.tasks.checklist.converted", { type: "info" });
      refresh();
    } catch {
      notify("resources.tasks.checklist.convert_error", { type: "error" });
    } finally {
      setIsConverting(false);
    }
  };

  return { convert, isConverting };
};
