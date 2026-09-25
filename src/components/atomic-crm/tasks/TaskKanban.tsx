import {
  DragDropContext,
  Draggable,
  Droppable,
  type OnDragEndResponder,
} from "@hello-pangea/dnd";
import { useGetList, useTranslate, type Identifier } from "ra-core";
import { useState, type CSSProperties } from "react";

import type { Task, TaskStatusKey } from "../types";
import { TaskEdit } from "./TaskEdit";
import { TaskPriorityBadge, TaskTraceabilityBadges } from "./TaskBadges";
import {
  KANBAN_COLUMN_CLASS,
  KANBAN_COLUMNS,
  resolveKanbanDrop,
} from "./taskViews";
import { useTransitionTask } from "./useTransitionTask";
import { cn } from "@/lib/utils";

/**
 * The task board (proposal §15.4, deliverable 2.9).
 *
 * Columns are lifecycle states, and a drop is a **transition**, never a column
 * write: `useTransitionTask` calls `public.transition_task()`, so an illegal
 * move is rejected by the database with a toast explaining why, and every legal
 * one lands in the audit trail like any other status change (§4.5).
 *
 * There is no drag-to-reorder. Tasks have no manual index — a board position
 * within a column would be a fourth ordering nobody asked for, competing with
 * the due date that actually decides what to do next.
 */
export const TaskKanban = ({ filter }: { filter: Record<string, unknown> }) => {
  const translate = useTranslate();
  const [openTaskId, setOpenTaskId] = useState<Identifier | null>(null);
  const { mutate: transition } = useTransitionTask();

  const { data, isPending } = useGetList<Task>("tasks", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "due_date", order: "ASC" },
    filter: { "deleted_at@is": null, ...filter },
  });

  if (isPending) return null;

  const tasks = data ?? [];
  const byColumn = (status: TaskStatusKey) =>
    tasks.filter((task) => task.status_key === status);

  const onDragEnd: OnDragEndResponder = (result) => {
    const move = resolveKanbanDrop(result);
    if (move) transition(move);
  };

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((status) => {
            const columnTasks = byColumn(status);
            return (
              // A lane, drawn exactly like the deals board's: a tinted track,
              // its name and count on one line, a coloured top edge.
              <div
                key={status}
                className="relative flex min-w-60 flex-1 flex-col self-start overflow-hidden rounded-2xl border border-border/60 bg-muted/45 p-2 dark:bg-surface/60"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 top-0 h-[3px]",
                    KANBAN_COLUMN_CLASS[status],
                  )}
                />
                <h3 className="flex items-center gap-2 px-1.5 pt-1 pb-1 text-sm font-semibold">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      KANBAN_COLUMN_CLASS[status],
                    )}
                  />
                  {translate(`resources.tasks.statuses.${status}`)}
                  <span className="rounded-full bg-background px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums dark:bg-surface-muted">
                    {columnTasks.length}
                  </span>
                </h3>

                <Droppable droppableId={status}>
                  {(droppableProvided, snapshot) => (
                    <div
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                      className={cn(
                        "mt-1.5 flex min-h-24 flex-col gap-2 rounded-xl transition-colors",
                        snapshot.isDraggingOver &&
                          "bg-brand-tint/60 ring-1 ring-brand/30",
                      )}
                    >
                      {columnTasks.map((task, index) => (
                        <Draggable
                          key={task.id}
                          draggableId={String(task.id)}
                          index={index}
                        >
                          {({
                            innerRef,
                            draggableProps: { style, ...draggableProps },
                            dragHandleProps,
                          }) => (
                            // One element, not a button nested in the drag
                            // handle: the handle already carries `role="button"`
                            // and `tabIndex`, and nesting a second button inside
                            // it gives two controls with the same accessible
                            // name. Space is the library's "lift", so Enter is
                            // the keyboard way to open the task.
                            //
                            // `style` is pulled out and cast because this
                            // project augments `CSSProperties` with Radix custom
                            // properties, which `DraggableStyle` does not carry.
                            <div
                              ref={innerRef}
                              {...draggableProps}
                              {...dragHandleProps}
                              style={style as CSSProperties}
                              aria-label={translate(
                                "resources.tasks.action.open",
                                { title: task.title },
                              )}
                              onClick={() => setOpenTaskId(task.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  setOpenTaskId(task.id);
                                }
                              }}
                              className="cursor-pointer rounded-xl border bg-card p-3 text-sm font-medium shadow-card transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-raised"
                            >
                              <span className="line-clamp-2">{task.title}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-1 font-normal">
                                <TaskPriorityBadge task={task} />
                                <TaskTraceabilityBadges task={task} />
                              </span>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {openTaskId != null && (
        <TaskEdit taskId={openTaskId} open close={() => setOpenTaskId(null)} />
      )}
    </>
  );
};
