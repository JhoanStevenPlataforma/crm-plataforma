import { MoreVertical } from "lucide-react";
import {
  useDeleteWithUndoController,
  useLocaleState,
  useNotify,
  useTranslate,
  useUpdate,
} from "ra-core";
import { useState } from "react";
import { DateField } from "@/components/admin/date-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { calendarDaysBetween, formatRelativeDay } from "../misc/relativeTime";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Task as TData, TaskStatusKey } from "../types";
import { CancelTaskDialog } from "./CancelTaskDialog";
import { postponeDueDate, type PostponePreset } from "./postponeTask";
import { TaskEdit } from "./TaskEdit";
import { TaskEditSheet } from "./TaskEditSheet";
import {
  TaskPriorityBadge,
  TaskStatusBadge,
  TaskTraceabilityBadges,
} from "./TaskBadges";
import { TaskRelatedLink } from "./TaskRelatedLink";
import {
  completionTarget,
  QUICK_TRANSITIONS,
  requiresReason,
} from "./taskModel";
import { useTransitionTask } from "./useTransitionTask";

export const Task = ({
  task,
  showContact,
  compact = false,
}: {
  task: TData;
  showContact?: boolean;
  /**
   * One line of title and a relative due date ("tomorrow", "5 months ago"):
   * the dashboard panel, where a timestamp to the second and three lines of
   * description turned a to-do list into a wall of text.
   */
  compact?: boolean;
}) => {
  const isMobile = useIsMobile();
  const { taskTypes } = useConfigurationContext();
  const notify = useNotify();
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();

  const [openEdit, setOpenEdit] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<TaskStatusKey | null>(
    null,
  );

  const [update, { isPending: isUpdatePending }] = useUpdate();
  const { mutate: transition, isPending: isTransitionPending } =
    useTransitionTask();

  const { handleDelete } = useDeleteWithUndoController({
    record: task,
    redirect: false,
    mutationOptions: {
      onSuccess() {
        notify("resources.tasks.deleted", { undoable: true });
      },
    },
  });

  const isBusy = isUpdatePending || isTransitionPending;
  const isDone = task.status_key === "completed";

  /**
   * Completion is a lifecycle transition, not a column write. Un-checking
   * reopens the task instead of blanking `done_date`, so the completion stays
   * in the audit trail (§1.3 W3).
   */
  const handleToggleDone = () => {
    transition({ taskId: task.id, to: completionTarget(task.status_key) });
  };

  const handleTransition = (to: TaskStatusKey) => {
    if (requiresReason(to)) {
      setPendingCancel(to);
      return;
    }
    transition({ taskId: task.id, to });
  };

  /**
   * Postponing keeps the time of day and counts from the task's own schedule
   * (§1.3 W4). The database records the move as a `task.rescheduled` event and
   * bumps `reschedule_count`, which is what the badge on the row renders.
   */
  const handlePostpone = (preset: PostponePreset) => {
    update("tasks", {
      id: task.id,
      data: { due_date: postponeDueDate(task.due_date, preset) },
      previousData: task,
    });
  };

  const typeLabel =
    task.type_label ??
    taskTypes.find((taskType) => taskType.value === task.type_key)?.label ??
    task.type_key;

  const labelId = `checkbox-list-label-${task.id}`;
  const quickTransitions = QUICK_TRANSITIONS[task.status_key] ?? [];

  return (
    <>
      <div className="flex items-start justify-between">
        <div
          className="flex min-w-0 items-start gap-2 flex-1"
          onClick={isMobile ? handleToggleDone : undefined}
        >
          <Checkbox
            id={labelId}
            checked={isDone}
            onCheckedChange={handleToggleDone}
            // On mobile the whole row toggles too; without this a tap on the
            // box reached both handlers and sent the transition twice.
            onClick={(event) => event.stopPropagation()}
            disabled={isBusy}
            className="mt-1"
            aria-label={translate("resources.tasks.actions.complete")}
          />
          <div
            className={cn(
              // min-w-0 always: a flex item defaults to its content's width,
              // so one long unbroken word (a pasted URL, a code) stretched the
              // whole page sideways.
              "grow min-w-0",
              isDone && "line-through",
            )}
          >
            <div
              className={cn(
                "text-sm flex items-center gap-x-1.5 gap-y-1",
                compact ? "min-w-0" : "flex-wrap",
              )}
            >
              {typeLabel && task.type_key !== "none" && (
                <span className="font-semibold text-sm shrink-0">
                  {typeLabel}
                </span>
              )}
              <span
                className={cn(
                  "min-w-0",
                  compact ? "truncate" : "[overflow-wrap:anywhere]",
                )}
              >
                {task.title}
              </span>
              <TaskPriorityBadge task={task} />
              <TaskStatusBadge task={task} />
            </div>

            {!compact && task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              {compact ? (
                <CompactDue dueDate={task.due_date} locale={locale} />
              ) : (
                <span>
                  {translate("resources.tasks.fields.due_short")}
                  &nbsp;
                  <DateField
                    source="due_date"
                    record={task}
                    showDate
                    showTime
                  />
                </span>
              )}
              {showContact && <TaskRelatedLink task={task} />}
              {compact ? null : <TaskTraceabilityBadges task={task} />}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 pr-0! size-8 cursor-pointer"
              aria-label={translate("resources.tasks.actions.title")}
            >
              <MoreVertical className="size-5 md:size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={() => handlePostpone("tomorrow")}
            >
              {translate("resources.tasks.actions.postpone_tomorrow")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={() => handlePostpone("next_week")}
            >
              {translate("resources.tasks.actions.postpone_next_week")}
            </DropdownMenuItem>

            {quickTransitions.length > 0 && <DropdownMenuSeparator />}
            {quickTransitions.map((to) => (
              <DropdownMenuItem
                key={to}
                className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
                onClick={() => handleTransition(to)}
              >
                {translate(`resources.tasks.transitions.${to}`)}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={() => setOpenEdit(true)}
            >
              {translate("ra.action.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={handleDelete}
            >
              {translate("ra.action.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CancelTaskDialog
        open={pendingCancel != null}
        onOpenChange={(open) => !open && setPendingCancel(null)}
        onConfirm={(reason) => {
          if (!pendingCancel) return;
          transition({ taskId: task.id, to: pendingCancel, reason });
          setPendingCancel(null);
        }}
      />

      {isMobile ? (
        <TaskEditSheet
          taskId={task.id}
          open={openEdit}
          onOpenChange={setOpenEdit}
        />
      ) : (
        <TaskEdit
          taskId={task.id}
          open={openEdit}
          close={() => setOpenEdit(false)}
        />
      )}
    </>
  );
};

const CompactDue = ({
  dueDate,
  locale,
}: {
  dueDate?: string | null;
  locale: string;
}) => {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  const now = new Date();
  return (
    <time
      dateTime={dueDate}
      title={date.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      })}
      className={cn(
        "text-xs tabular-nums",
        calendarDaysBetween(date, now) < 0 && "font-medium text-destructive",
      )}
    >
      {formatRelativeDay(date, locale, now)}
    </time>
  );
};
