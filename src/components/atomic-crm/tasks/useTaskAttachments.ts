import {
  useDataProvider,
  useNotify,
  useRefresh,
  type Identifier,
} from "ra-core";
import { useState } from "react";

import type { CrmDataProvider } from "../providers/types";
import type { TaskAttachment } from "../types";

/**
 * Uploading, opening and removing the files of a task (proposal §3.2, §8.2).
 *
 * Two writes per file, in this order: the bytes go into the private
 * `task-attachments` bucket, then the row that describes them. A row created
 * first would be an audit entry for a file nobody can open if the upload
 * failed.
 *
 * Nothing here writes history: the `attachment.added` / `attachment.removed`
 * events and `tasks.attachment_count` are the database's, so a file attached
 * by any other client is recorded the same way.
 */
export const useTaskAttachments = (taskId: Identifier) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [isUploading, setIsUploading] = useState(false);

  /** Uploads files and registers them, optionally against a comment. */
  const upload = async (files: File[], commentId?: Identifier) => {
    if (files.length === 0 || isUploading) return;
    setIsUploading(true);

    try {
      for (const file of files) {
        const uploaded = await dataProvider.uploadTaskAttachment(taskId, file);
        await dataProvider.create<TaskAttachment>("task_attachments", {
          data: {
            task_id: taskId,
            comment_id: commentId ?? null,
            ...uploaded,
          } as Partial<TaskAttachment>,
        });
      }
      refresh();
    } catch {
      notify("resources.tasks.attachments.error", { type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Removal is soft, like everywhere else in this module: the row stays so the
   * `attachment.removed` event still resolves the file it refers to. The
   * stored object is left in place — a retention job owns the bytes, not the
   * person who tidied up a task.
   */
  const remove = async (attachment: TaskAttachment) => {
    try {
      await dataProvider.update("task_attachments", {
        id: attachment.id,
        data: { deleted_at: new Date().toISOString() },
        previousData: attachment,
      });
      refresh();
    } catch {
      notify("resources.tasks.attachments.error", { type: "error" });
    }
  };

  /**
   * Opens a file through a freshly signed URL. The link is minted per click
   * rather than rendered into the list: the bucket is private, and the storage
   * policy re-checks task visibility at that moment.
   */
  const open = async (attachment: TaskAttachment) => {
    try {
      const url = await dataProvider.getTaskAttachmentUrl(
        attachment.storage_path,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      notify("resources.tasks.attachments.open_error", { type: "error" });
    }
  };

  return { upload, remove, open, isUploading };
};
