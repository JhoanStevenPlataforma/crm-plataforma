import { ArrowUpRight, Trash2 } from "lucide-react";
import {
  useCreate,
  useGetList,
  useNotify,
  useRefresh,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import type { TaskChecklistItem } from "../types";
import { useConvertChecklistItem } from "./useConvertChecklistItem";

/**
 * The checklist of a task (proposal §11).
 *
 * Every tick is attributed and timestamped by the database, and lands in the
 * same `task_events` stream as everything else — so "who ticked this, and
 * when" is answerable, and the History tab shows the steps next to the field
 * changes. The `n/total` badge on the task row reads the counters the same
 * writes maintain (§3.4), so the list never has to query this table.
 */
export const TaskChecklist = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [label, setLabel] = useState("");

  const { data, isPending } = useGetList<TaskChecklistItem>(
    "task_checklist_items",
    {
      filter: { task_id: taskId, "deleted_at@is": null },
      sort: { field: "position", order: "ASC" },
      pagination: { page: 1, perPage: 100 },
    },
  );

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const { convert, isConverting } = useConvertChecklistItem();
  const isMutating = isCreating || isUpdating || isConverting;

  const onError = () =>
    notify("resources.tasks.checklist.error", { type: "error" });

  const add = () => {
    const trimmed = label.trim();
    if (!trimmed || isMutating) return;
    // `position` is left out on purpose: the database appends to the end, so
    // the everyday path of typing steps in order needs no rank arithmetic.
    create(
      "task_checklist_items",
      { data: { task_id: taskId, label: trimmed } },
      { onSuccess: () => refresh(), onError },
    );
    setLabel("");
  };

  const toggle = (item: TaskChecklistItem) =>
    update(
      "task_checklist_items",
      {
        id: item.id,
        data: { is_done: !item.is_done },
        previousData: item,
      },
      { onSuccess: () => refresh(), onError },
    );

  // Removal is soft, like everywhere else in this module: the step stays on
  // disk so the history that references it still resolves.
  const remove = (item: TaskChecklistItem) =>
    update(
      "task_checklist_items",
      {
        id: item.id,
        data: { deleted_at: new Date().toISOString() },
        previousData: item,
      },
      { onSuccess: () => refresh(), onError },
    );

  const items = data ?? [];
  const done = items.filter((item) => item.is_done).length;

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {translate("resources.tasks.checklist.progress", {
            done,
            total: items.length,
          })}
        </p>
      )}

      {!isPending && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {translate("resources.tasks.checklist.empty")}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 group">
            <Checkbox
              id={`checklist-${item.id}`}
              checked={item.is_done}
              disabled={isMutating}
              onCheckedChange={() => toggle(item)}
            />
            <label
              htmlFor={`checklist-${item.id}`}
              className={`text-sm flex-1 cursor-pointer ${
                item.is_done ? "line-through text-muted-foreground" : ""
              }`}
            >
              {item.label}
            </label>
            {/* Only for a step that is still open: promoting something already
                done would create a sub-task nobody needs to do (§11.1). */}
            {!item.is_done && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={translate("resources.tasks.checklist.convert", {
                  label: item.label,
                })}
                disabled={isMutating}
                onClick={() => convert(item, taskId)}
              >
                <ArrowUpRight className="h-3 w-3" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={translate("resources.tasks.checklist.remove", {
                label: item.label,
              })}
              onClick={() => remove(item)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Input
          value={label}
          placeholder={translate("resources.tasks.checklist.placeholder")}
          aria-label={translate("resources.tasks.checklist.placeholder")}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={add}
          disabled={!label.trim() || isMutating}
        >
          {translate("resources.tasks.checklist.add")}
        </Button>
      </div>
    </div>
  );
};
