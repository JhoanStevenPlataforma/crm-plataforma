import { addMonths } from "date-fns/addMonths";
import { eachDayOfInterval } from "date-fns/eachDayOfInterval";
import { endOfMonth } from "date-fns/endOfMonth";
import { endOfWeek } from "date-fns/endOfWeek";
import { isSameDay } from "date-fns/isSameDay";
import { isSameMonth } from "date-fns/isSameMonth";
import { startOfMonth } from "date-fns/startOfMonth";
import { startOfWeek } from "date-fns/startOfWeek";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useGetList,
  useLocaleState,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Task } from "../types";
import { TaskEdit } from "./TaskEdit";
import { STATUS_DOT_CLASS } from "./taskModel";

/** Sunday-first, matching the `this_week` bucket semantics in `taskBuckets`. */
const WEEK_OPTIONS = { weekStartsOn: 0 } as const;

const MAX_CHIPS_PER_DAY = 3;

/**
 * The month view (proposal §15.1 V7, deliverable 2.9).
 *
 * `due_date` has been a timestamp since Phase 1 and nothing ever drew it on a
 * calendar — the one view where "what does my week actually look like" is a
 * glance rather than a query.
 *
 * The query is bounded by the visible grid, not by a page size: a month is a
 * closed range, so this cannot degrade the way the old 1000-row fetch did
 * (§1.5). Tasks with no due date are absent by construction; they live in the
 * list view's "no due date" bucket.
 */
export const TaskCalendar = ({
  filter,
}: {
  filter: Record<string, unknown>;
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [openTaskId, setOpenTaskId] = useState<Identifier | null>(null);

  const { gridStart, gridEnd, days } = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), WEEK_OPTIONS);
    const end = endOfWeek(endOfMonth(month), WEEK_OPTIONS);
    return {
      gridStart: start,
      gridEnd: end,
      days: eachDayOfInterval({ start, end }),
    };
  }, [month]);

  const { data } = useGetList<Task>("tasks", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "due_date", order: "ASC" },
    filter: {
      "deleted_at@is": null,
      "due_date@gte": gridStart.toISOString(),
      "due_date@lte": gridEnd.toISOString(),
      ...filter,
    },
  });

  const tasks = data ?? [];
  const today = new Date();

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={translate("resources.tasks.calendar.previous_month")}
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={translate("resources.tasks.calendar.next_month")}
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            {translate("resources.tasks.calendar.today")}
          </Button>
          <span className="ml-2 text-sm font-medium capitalize">
            {monthLabel}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {days.slice(0, 7).map((day) => (
            <div
              key={`head-${day.toISOString()}`}
              className="bg-muted px-2 py-1 text-center text-xs font-medium capitalize text-muted-foreground"
            >
              {weekdayFormat.format(day)}
            </div>
          ))}

          {days.map((day) => {
            const dayTasks = tasks.filter(
              (task) =>
                task.due_date && isSameDay(new Date(task.due_date), day),
            );
            const hidden = dayTasks.length - MAX_CHIPS_PER_DAY;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-24 bg-background p-1",
                  !isSameMonth(day, month) && "bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full text-xs",
                    isSameDay(day, today)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {day.getDate()}
                </span>

                <div className="mt-1 flex flex-col gap-0.5">
                  {dayTasks.slice(0, MAX_CHIPS_PER_DAY).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setOpenTaskId(task.id)}
                      title={task.title}
                      className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          STATUS_DOT_CLASS[task.status_key ?? "pending"],
                        )}
                      />
                      <span className="truncate">{task.title}</span>
                    </button>
                  ))}
                  {hidden > 0 && (
                    <span className="px-1 text-xs text-muted-foreground">
                      {translate("resources.tasks.calendar.more", {
                        smart_count: hidden,
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openTaskId != null && (
        <TaskEdit taskId={openTaskId} open close={() => setOpenTaskId(null)} />
      )}
    </>
  );
};
