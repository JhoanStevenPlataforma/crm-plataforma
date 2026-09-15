import type { Identifier } from "ra-core";

import { buildScopedAttachmentPath } from "./attachmentPaths";

import type { TaskAttachmentUpload } from "../../types";

/**
 * Shared upload plumbing for task attachments (proposal §3.2, §17.3).
 *
 * Both data providers produce the same `TaskAttachmentUpload` shape, so the UI
 * never has to know whether it is talking to Supabase storage or to demo mode.
 */

/**
 * Task files live in their OWN bucket, and it is private.
 *
 * The `attachments` bucket used by notes is public: any object in it is served
 * to whoever holds the URL, signed in or not, so path-scoped policies on it
 * would gate the API and leave the object path open. A private bucket plus
 * short-lived signed URLs is what actually makes a task file follow the task's
 * visibility.
 */
export const TASK_ATTACHMENTS_BUCKET =
  import.meta.env.VITE_TASK_ATTACHMENTS_BUCKET || "task-attachments";

/** How long a generated download link stays valid, in seconds. */
export const TASK_ATTACHMENT_URL_TTL = 60;

/**
 * `<task_id>/<random>.<ext>`.
 *
 * The layout itself is shared with deal attachments (`buildScopedAttachmentPath`):
 * both buckets' policies parse the first folder back out to decide who may
 * download an object, so the two must not drift apart.
 */
export const buildTaskAttachmentPath = (
  taskId: Identifier,
  fileName: string,
): string => buildScopedAttachmentPath(taskId, fileName);

/**
 * SHA-256 of the bytes, as lowercase hex.
 *
 * Recorded at upload time because it cannot be recovered later — once a
 * retention job has moved the object, the checksum is the only evidence of
 * what the file was. Returns null where `crypto.subtle` is unavailable (an
 * insecure context) rather than failing the upload over metadata.
 */
export const fileChecksum = async (file: Blob): Promise<string | null> => {
  if (!globalThis.crypto?.subtle) {
    return null;
  }
  try {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
};

/** The metadata half of an upload, shared by both providers. */
export const describeUpload = async (
  storagePath: string,
  file: File,
): Promise<TaskAttachmentUpload> => ({
  storage_path: storagePath,
  file_name: file.name,
  mime_type: file.type || null,
  size_bytes: file.size,
  checksum: await fileChecksum(file),
});
