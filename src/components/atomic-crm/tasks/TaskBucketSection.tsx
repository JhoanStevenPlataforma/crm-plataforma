import { useGetList, useTranslate } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Task as TData } from "../types";
import { Task } from "./Task";

/**
 * One due-date section of a task list (proposal §1.5, §18.5).
 *
 * Each section owns its query. That is the whole point: the previous
 * implementation fetched up to 1000 rows in a single call and split them in
 * JavaScript, which meant a multi-megabyte payload at enterprise volume and
 * silently wrong buckets past row 1000. Six small indexed queries running in
 * parallel through React Query return ten rows each and page independently.
 */
export const TaskBucketSection = ({
  title,
  filter,
  showContact,
  perPage: initialPerPage = 5,
  enabled = true,
  framed = false,
  compact = false,
}: {
  title: string;
  filter: Record<string, unknown>;
  showContact?: boolean;
  perPage?: number;
  enabled?: boolean;
  /**
   * The tasks page draws each bucket as a card of rows; the narrow panels on a
   * contact or a deal keep the plain list, which a card would crowd.
   */
  framed?: boolean;
  /** One line per task and no "load more": the panel links to the full list. */
  compact?: boolean;
}) => {
  const translate = useTranslate();
  const [perPage, setPerPage] = useState(initialPerPage);

  const { data, total, isPending } = useGetList<TData>(
    "tasks",
    {
      pagination: { page: 1, perPage },
      sort: { field: "due_date", order: "ASC" },
      filter,
    },
    { enabled },
  );

  if (isPending || !data?.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          "flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase",
          framed ? "px-1" : "mb-2",
        )}
      >
        {title}
        {(framed || compact) && total != null ? (
          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] tracking-normal tabular-nums normal-case">
            {total}
          </span>
        ) : total != null && total > data.length ? (
          ` (${total})`
        ) : (
          ""
        )}
      </p>

      <div
        className={cn(
          framed
            ? "divide-y overflow-hidden rounded-xl border border-border/80 bg-card shadow-card [&>*]:px-4 [&>*]:py-3 [&>*]:transition-colors [&>*:hover]:bg-muted/30"
            : compact
              ? "flex flex-col gap-2.5"
              : "space-y-4 md:space-y-2",
        )}
      >
        {data.map((task) => (
          <Task
            task={task}
            showContact={showContact}
            compact={compact}
            key={task.id}
          />
        ))}
      </div>

      {!compact && total != null && total > perPage && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPerPage(perPage + 10)}
            className="text-muted-foreground"
          >
            {translate("crm.common.load_more")}
          </Button>
        </div>
      )}
    </div>
  );
};
