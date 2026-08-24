import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify, type Identifier } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { TaskStatusKey } from "../types";

export type TransitionTaskInput = {
  taskId: Identifier;
  to: TaskStatusKey;
  reason?: string;
};

/**
 * Move a task through the lifecycle (proposal §4.5).
 *
 * Status is never written with a plain `update`: a database guard rejects it,
 * because a status change has to validate against `task_transitions`, check the
 * §17.1 capabilities and emit its own audit event. Everything the UI does to a
 * task's state goes through here.
 *
 * On success the task lists are invalidated, plus `contacts_summary` — its
 * `nb_tasks` counter changes whenever a task opens or closes.
 */
export const useTransitionTask = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, to, reason }: TransitionTaskInput) =>
      dataProvider.transitionTask(taskId, to, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks_summary"] });
      queryClient.invalidateQueries({ queryKey: ["contacts_summary"] });
      queryClient.invalidateQueries({ queryKey: ["task_events"] });
    },
    onError: (error: Error) => {
      notify(error.message || "resources.tasks.transition.error", {
        type: "error",
      });
    },
  });
};
