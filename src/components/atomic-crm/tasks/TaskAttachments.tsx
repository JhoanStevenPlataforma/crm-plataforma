import { useGetList, useTranslate, type Identifier } from "ra-core";

import type { TaskAttachment } from "../types";
import { TaskAttachmentFileInput } from "./TaskAttachmentFileInput";
import { TaskAttachmentList } from "./TaskAttachmentList";
import { useTaskAttachments } from "./useTaskAttachments";

/**
 * The files hanging off the task itself (proposal §3.2).
 *
 * Comment attachments are the same rows with `comment_id` set, so they are
 * excluded here and rendered inside the thread instead — a file dropped in a
 * conversation belongs to that message, not to a flat list where the reason it
 * was sent is missing.
 */
export const TaskAttachments = ({ taskId }: { taskId: Identifier }) => {
  const translate = useTranslate();
  const { upload, remove, open, isUploading } = useTaskAttachments(taskId);

  const { data, isPending } = useGetList<TaskAttachment>("task_attachments", {
    filter: {
      task_id: taskId,
      "comment_id@is": null,
      "deleted_at@is": null,
    },
    sort: { field: "uploaded_at", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });

  const attachments = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {!isPending && attachments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {translate("resources.tasks.attachments.empty")}
        </p>
      )}

      <TaskAttachmentList
        attachments={attachments}
        onOpen={open}
        onRemove={remove}
        isPending={isUploading}
      />

      <TaskAttachmentFileInput
        isPending={isUploading}
        onSelect={(files) => upload(files)}
      />
    </div>
  );
};
