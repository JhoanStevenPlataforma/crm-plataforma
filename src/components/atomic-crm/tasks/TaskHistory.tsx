import { useGetList, useTranslate, type Identifier } from "ra-core";
import { useState } from "react";

import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";

import type { Sale, TaskEvent } from "../types";
import { describeTaskEvent, rescheduleDeltaDays } from "./taskEventDescription";

const eventLabelKey = (eventType: string) =>
  `resources.tasks.history.events.${eventType.replace(/\./g, "_")}`;

/**
 * The audit trail of a single task (proposal §5, §15.3).
 *
 * This tab is the product differentiator: a complete, immutable, attributed
 * history that an end user can read, not an admin-only compliance export. The
 * rows come straight from `task_events`, which the database writes from
 * triggers — no write path, not even psql, can produce a task change that is
 * missing from this list.
 */
export const TaskHistory = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const [perPage, setPerPage] = useState(20);

  const { data, total, isPending, error } = useGetList<TaskEvent>(
    "task_events",
    {
      filter: { task_id: taskId },
      sort: { field: "seq", order: "DESC" },
      pagination: { page: 1, perPage },
    },
  );

  if (isPending) return null;

  if (error || !data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate("resources.tasks.history.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {data.map((event) => {
          const described = describeTaskEvent(event);
          const deltaDays = rescheduleDeltaDays(event);

          return (
            <li
              key={event.id}
              className="flex flex-col gap-0.5 border-l-2 pl-3 py-0.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">
                  {translate(eventLabelKey(event.event_type), {
                    _: event.event_type,
                  })}
                </span>

                {event.actor_sales_id != null ? (
                  <ReferenceField<TaskEvent, Sale>
                    source="actor_sales_id"
                    reference="sales"
                    record={event}
                    className="inline text-sm text-muted-foreground"
                    render={({ referenceRecord }) =>
                      referenceRecord ? (
                        <>
                          {translate("resources.tasks.history.by", {
                            name: `${referenceRecord.first_name} ${referenceRecord.last_name}`,
                          })}
                        </>
                      ) : null
                    }
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {translate("resources.tasks.history.system")}
                  </span>
                )}

                {event.actor_kind !== "user" && (
                  <Badge variant="outline" className="text-[10px]">
                    {event.actor_kind}
                  </Badge>
                )}
              </div>

              {!described.isBare && (
                <p className="text-xs text-muted-foreground break-words">
                  {described.from ??
                    translate("resources.tasks.history.empty_value")}
                  {" → "}
                  {described.to ??
                    translate("resources.tasks.history.empty_value")}
                  {deltaDays != null && deltaDays !== 0 && (
                    <span className="ml-1">
                      ({deltaDays > 0 ? "+" : ""}
                      {deltaDays}d)
                    </span>
                  )}
                </p>
              )}

              {described.reason && (
                <p className="text-xs italic text-muted-foreground break-words">
                  “{described.reason}”
                </p>
              )}

              <DateField
                source="occurred_at"
                record={event}
                showDate
                showTime
                className="text-xs text-muted-foreground"
              />
            </li>
          );
        })}
      </ol>

      {total != null && total > perPage && (
        <button
          type="button"
          onClick={() => setPerPage(perPage + 20)}
          className="text-sm underline hover:no-underline cursor-pointer self-center"
        >
          {translate("resources.tasks.history.load_more")}
        </button>
      )}
    </div>
  );
};
