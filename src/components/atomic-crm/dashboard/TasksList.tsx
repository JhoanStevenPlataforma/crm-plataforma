import { useTranslate } from "ra-core";

import { SectionCard } from "../misc/SectionCard";
import { AddTask } from "../tasks/AddTask";
import { TasksListContent } from "../tasks/TasksListContent";

export const TasksList = () => {
  const translate = useTranslate();

  return (
    <SectionCard
      title={translate("crm.dashboard.upcoming_tasks", {
        _: "Upcoming Tasks",
      })}
      action={<AddTask display="icon" selectContact />}
    >
      <TasksListContent />
    </SectionCard>
  );
};
