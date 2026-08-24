import { X } from "lucide-react";
import {
  useCreate,
  useGetList,
  useGetMany,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Task, TaskDependency } from "../types";

/**
 * What blocks this task, and what it blocks (proposal §10).
 *
 * The edges are directed and stored once, so "blocked by" is this task as the
 * TARGET and "blocking" is this task as the SOURCE — the inverse is derived
 * rather than stored, which is what keeps the graph consistent.
 *
 * Adding a blocker moves this task into `blocked` and completing the last
 * blocker releases it; both happen in the database, so this component only has
 * to write the edge (§10.2, §10.4).
 */
export const TaskDependencies = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [picked, setPicked] = useState<string>("");

  const { data: edges } = useGetList<TaskDependency>("task_dependencies", {
    filter: { "removed_at@is": null },
    sort: { field: "id", order: "ASC" },
    pagination: { page: 1, perPage: 200 },
  });

  const active = edges ?? [];
  const blockedBy = active.filter(
    (edge) => edge.kind === "blocks" && edge.target_task_id === taskId,
  );
  const blocking = active.filter(
    (edge) => edge.kind === "blocks" && edge.source_task_id === taskId,
  );

  const relatedIds = [
    ...blockedBy.map((edge) => edge.source_task_id),
    ...blocking.map((edge) => edge.target_task_id),
  ];
  const { data: relatedTasks } = useGetMany<Task>("tasks", { ids: relatedIds });

  // Candidate blockers: any other open task. A closed task cannot block
  // anything, so offering it would only produce a no-op edge.
  const { data: candidates } = useGetList<Task>("tasks", {
    filter: { "deleted_at@is": null },
    sort: { field: "due_date", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const isMutating = isCreating || isUpdating;

  const onError = () =>
    notify("resources.tasks.dependencies.error", { type: "error" });

  const titleOf = (id: Identifier) =>
    relatedTasks?.find((task) => task.id === id)?.title ?? `#${id}`;

  const addBlocker = () => {
    if (!picked || isMutating) return;
    create(
      "task_dependencies",
      {
        data: {
          source_task_id: Number(picked),
          target_task_id: taskId,
          kind: "blocks",
        },
      },
      { onSuccess: () => refresh(), onError },
    );
    setPicked("");
  };

  // An edge is closed, never deleted: the history that references it must keep
  // resolving (§10.1).
  const removeEdge = (edge: TaskDependency) =>
    update(
      "task_dependencies",
      {
        id: edge.id,
        data: { removed_at: new Date().toISOString() },
        previousData: edge,
      },
      { onSuccess: () => refresh(), onError },
    );

  const alreadyLinked = new Set(relatedIds.map(String));
  const options = (candidates ?? []).filter(
    (task) =>
      task.id !== taskId &&
      !alreadyLinked.has(String(task.id)) &&
      task.status_is_open !== false,
  );

  const renderEdges = (
    list: TaskDependency[],
    otherEnd: (e: TaskDependency) => Identifier,
  ) =>
    list.map((edge) => (
      <li key={edge.id} className="flex items-center gap-2 text-sm">
        <span className="flex-1">{titleOf(otherEnd(edge))}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          aria-label={translate("resources.tasks.dependencies.remove", {
            title: titleOf(otherEnd(edge)),
          })}
          onClick={() => removeEdge(edge)}
        >
          <X className="h-3 w-3" />
        </Button>
      </li>
    ));

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          {translate("resources.tasks.dependencies.blocked_by")}
          {blockedBy.length > 0 && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              {blockedBy.length}
            </Badge>
          )}
        </h4>
        {blockedBy.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.tasks.dependencies.no_blockers")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {renderEdges(blockedBy, (edge) => edge.source_task_id)}
          </ul>
        )}
      </section>

      {blocking.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            {translate("resources.tasks.dependencies.blocking")}
          </h4>
          <ul className="flex flex-col gap-1">
            {renderEdges(blocking, (edge) => edge.target_task_id)}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger
            className="flex-1"
            aria-label={translate("resources.tasks.dependencies.add_blocker")}
          >
            <SelectValue
              placeholder={translate(
                "resources.tasks.dependencies.add_blocker",
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((task) => (
              <SelectItem key={task.id} value={String(task.id)}>
                {task.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          onClick={addBlocker}
          disabled={!picked || isMutating}
        >
          {translate("resources.tasks.dependencies.add")}
        </Button>
      </div>
    </div>
  );
};
