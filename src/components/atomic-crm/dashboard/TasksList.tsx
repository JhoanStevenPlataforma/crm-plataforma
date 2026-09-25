import { ArrowRight } from "lucide-react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { SectionCard } from "../misc/SectionCard";
import { AddTask } from "../tasks/AddTask";
import { TasksListByDueDate } from "../tasks/TasksListByDueDate";

/**
 * The rep's next moves, compact: three tasks per due-date section, one line
 * each, and a link to the task page for the rest. Listing all of them here
 * made this one panel longer than the rest of the dashboard together.
 */
export const TasksList = () => {
  const translate = useTranslate();

  return (
    <SectionCard
      title={translate("crm.dashboard.upcoming_tasks", {
        _: "Upcoming Tasks",
      })}
      action={<AddTask display="icon" selectContact />}
      contentClassName="p-0"
    >
      <div className="p-4">
        <TasksListByDueDate
          compact
          emptyPlaceholder={
            <p className="text-sm">
              {translate("resources.tasks.empty_list_hint")}
            </p>
          }
        />
      </div>
      <Link
        to="/tasks"
        className="flex items-center justify-center gap-1.5 border-t border-border/70 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        {translate("crm.common.see_all_tasks")}
        <ArrowRight className="size-3.5" />
      </Link>
    </SectionCard>
  );
};
