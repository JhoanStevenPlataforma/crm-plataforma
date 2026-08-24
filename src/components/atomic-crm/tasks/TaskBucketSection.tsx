import { useGetList, useTranslate } from "ra-core";
import { useState } from "react";

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
}: {
  title: string;
  filter: Record<string, unknown>;
  showContact?: boolean;
  perPage?: number;
  enabled?: boolean;
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
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
        {title}
        {total != null && total > data.length ? ` (${total})` : ""}
      </p>

      <div className="space-y-4 md:space-y-2">
        {data.map((task) => (
          <Task task={task} showContact={showContact} key={task.id} />
        ))}
      </div>

      {total != null && total > perPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setPerPage(perPage + 10)}
            className="text-sm underline hover:no-underline cursor-pointer"
          >
            {translate("crm.common.load_more")}
          </button>
        </div>
      )}
    </div>
  );
};
