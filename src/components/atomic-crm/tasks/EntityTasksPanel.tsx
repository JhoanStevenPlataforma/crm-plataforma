import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  CreateBase,
  Form,
  useDataProvider,
  useGetIdentity,
  useNotify,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useMemo, useState } from "react";

import { SaveButton } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { CrmDataProvider } from "../providers/types";
import type { Task, TaskEntityType } from "../types";
import { TaskFormContent } from "./TaskFormContent";
import { TasksListByDueDate } from "./TasksListByDueDate";

/**
 * The task panel of a Deal / Company / Lead (proposal §1.10, §14.5).
 *
 * This is the single largest functional gap the audit found: `tasks.contact_id`
 * was NOT NULL, so a task could only ever hang off a contact. "Call the CFO
 * about the renewal" had nowhere to live on the renewal deal. The panel reads
 * the task's primary link and writes it through `link_task_to_entity()`.
 */
export const EntityTasksPanel = ({
  entityType,
  entityId,
  entityLabel,
  emptyPlaceholder,
}: {
  entityType: TaskEntityType;
  entityId: Identifier;
  entityLabel?: string | null;
  emptyPlaceholder?: React.ReactNode;
}) => {
  const translate = useTranslate();

  const entityFilter = useMemo(
    () => ({
      primary_entity_type: entityType,
      primary_entity_id: entityId,
    }),
    [entityType, entityId],
  );

  return (
    <div className="flex flex-col gap-2">
      <TasksListByDueDate
        entityFilter={entityFilter}
        showContact={false}
        emptyPlaceholder={
          emptyPlaceholder ?? (
            <p className="text-sm text-muted-foreground">
              {translate("resources.tasks.empty")}
            </p>
          )
        }
      />
      <AddEntityTask
        entityType={entityType}
        entityId={entityId}
        entityLabel={entityLabel}
      />
    </div>
  );
};

/**
 * Creating a task straight onto a record.
 *
 * Two steps on purpose: the task row is created first (so the database can
 * apply its defaults and emit `task.created`), then the link is attached. The
 * link call is idempotent, so a failed retry cannot produce duplicates.
 */
const AddEntityTask = ({
  entityType,
  entityId,
  entityLabel,
}: {
  entityType: TaskEntityType;
  entityId: Identifier;
  entityLabel?: string | null;
}) => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { mutateAsync: linkTask } = useMutation({
    mutationFn: (taskId: Identifier) =>
      dataProvider.linkTaskToEntity(taskId, entityType, entityId, {
        label: entityLabel ?? null,
      }),
  });

  if (!identity) return null;

  const handleSuccess = async (task: Task) => {
    setOpen(false);
    try {
      await linkTask(task.id);
    } catch (error) {
      notify((error as Error).message, { type: "error" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    notify("resources.tasks.added");
  };

  return (
    <>
      <div className="my-2">
        <Button
          variant="outline"
          className="h-6 cursor-pointer"
          onClick={() => setOpen(true)}
          size="sm"
        >
          <Plus className="w-4 h-4" />
          {translate("resources.tasks.action.add")}
        </Button>
      </div>

      <CreateBase
        resource="tasks"
        record={{
          type: "none",
          due_date: new Date().toISOString(),
          sales_id: identity.id,
        }}
        mutationOptions={{ onSuccess: handleSuccess }}
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="lg:max-w-xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
            <Form className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {translate("resources.tasks.dialog.create")}
                </DialogTitle>
              </DialogHeader>
              <TaskFormContent />
              <DialogFooter className="w-full justify-end">
                <SaveButton />
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      </CreateBase>
    </>
  );
};
