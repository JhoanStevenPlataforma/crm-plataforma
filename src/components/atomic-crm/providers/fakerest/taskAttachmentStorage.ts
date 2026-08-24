import type { Identifier } from "ra-core";

import {
  buildTaskAttachmentPath,
  describeUpload,
} from "../commons/taskAttachments";
import type { TaskAttachmentUpload } from "../../types";

/**
 * Demo-mode stand-in for the private `task-attachments` bucket (§17.3).
 *
 * The bytes stay in the browser as object URLs, keyed by the same
 * `<task_id>/<random>.<ext>` path the real bucket uses, so the rest of the
 * frontend cannot tell the two providers apart. Like the rest of demo mode it
 * is lost on reload — the fake data provider resets there anyway.
 */
const objectUrls = new Map<string, string>();

export const uploadTaskAttachment = async (
  taskId: Identifier,
  file: File,
): Promise<TaskAttachmentUpload> => {
  const path = buildTaskAttachmentPath(taskId, file.name);
  objectUrls.set(path, URL.createObjectURL(file));
  return describeUpload(path, file);
};

export const getTaskAttachmentUrl = async (
  storagePath: string,
): Promise<string> => {
  const url = objectUrls.get(storagePath);
  if (!url) {
    // Generated demo data references files that were never uploaded in this
    // session. Saying so beats opening a broken tab.
    throw new Error("This attachment is not available in demo mode");
  }
  return url;
};
