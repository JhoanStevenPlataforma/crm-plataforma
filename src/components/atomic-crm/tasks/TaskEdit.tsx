import {
  EditBase,
  Form,
  useNotify,
  useTranslate,
  type Identifier,
} from "ra-core";
import { DeleteButton } from "@/components/admin/delete-button";
import { SaveButton } from "@/components/admin/form";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TaskAttachments } from "./TaskAttachments";
import { TaskChecklist } from "./TaskChecklist";
import { TaskComments } from "./TaskComments";
import { TaskDependencies } from "./TaskDependencies";
import { TaskFormContent } from "./TaskFormContent";
import { TaskHistory } from "./TaskHistory";
import { TaskParticipants } from "./TaskParticipants";
import { TaskReminders } from "./TaskReminders";

/**
 * The task detail dialog (proposal §15.3).
 *
 * The History tab is the point: the audit trail is not an admin-only export
 * buried in a settings screen, it sits next to the fields it explains. Editing
 * stays on the first tab, so the everyday path is unchanged.
 */
export const TaskEdit = ({
  open,
  close,
  taskId,
}: {
  taskId: Identifier;
  open: boolean;
  close: () => void;
}) => {
  const notify = useNotify();
  const translate = useTranslate();
  return (
    <Dialog open={open} onOpenChange={close}>
      {open && taskId && (
        <EditBase
          id={taskId}
          resource="tasks"
          className="mt-0"
          mutationOptions={{
            onSuccess: () => {
              close();
              notify("resources.tasks.updated", {
                type: "info",
                undoable: true,
              });
            },
          }}
          redirect={false}
        >
          <DialogContent className="lg:max-w-xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
            <DialogHeader>
              <DialogTitle>
                {translate("resources.tasks.action.edit")}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="detail">
              <TabsList>
                <TabsTrigger value="detail">
                  {translate("resources.tasks.history.tabs.detail")}
                </TabsTrigger>
                <TabsTrigger value="checklist">
                  {translate("resources.tasks.history.tabs.checklist")}
                </TabsTrigger>
                <TabsTrigger value="people">
                  {translate("resources.tasks.history.tabs.people")}
                </TabsTrigger>
                <TabsTrigger value="comments">
                  {translate("resources.tasks.history.tabs.comments")}
                </TabsTrigger>
                <TabsTrigger value="attachments">
                  {translate("resources.tasks.history.tabs.attachments")}
                </TabsTrigger>
                <TabsTrigger value="reminders">
                  {translate("resources.tasks.history.tabs.reminders")}
                </TabsTrigger>
                <TabsTrigger value="history">
                  {translate("resources.tasks.history.tabs.history")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="detail">
                <Form className="flex flex-col gap-4">
                  <TaskFormContent />
                  <DialogFooter className="w-full sm:justify-between gap-4">
                    <DeleteButton
                      mutationOptions={{
                        onSuccess: () => {
                          close();
                          notify("resources.tasks.deleted", {
                            type: "info",
                            undoable: true,
                          });
                        },
                      }}
                      redirect={false}
                    />
                    <SaveButton label="ra.action.save" />
                  </DialogFooter>
                </Form>
              </TabsContent>

              <TabsContent value="checklist">
                <div className="flex flex-col gap-6">
                  <TaskChecklist taskId={taskId} />
                  {/* Steps and blockers answer the same question — "what is
                      left before this can be done" — so they sit together. */}
                  <TaskDependencies taskId={taskId} />
                </div>
              </TabsContent>

              <TabsContent value="people">
                <TaskParticipants taskId={taskId} />
              </TabsContent>

              <TabsContent value="comments">
                <TaskComments taskId={taskId} />
              </TabsContent>

              <TabsContent value="attachments">
                <TaskAttachments taskId={taskId} />
              </TabsContent>

              <TabsContent value="reminders">
                <TaskReminders taskId={taskId} />
              </TabsContent>

              <TabsContent value="history">
                <TaskHistory taskId={taskId} />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </EditBase>
      )}
    </Dialog>
  );
};
