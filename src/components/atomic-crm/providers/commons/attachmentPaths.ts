import type { Identifier } from "ra-core";

/**
 * `<scope_id>/<random>.<ext>` — the layout every private attachment bucket uses.
 *
 * The scope id is the first folder because the storage policy reads it back out
 * of the object name to answer "may this user download this?". The stored file
 * name is random rather than the user's: two people uploading `contrato.pdf` to
 * the same record must not collide, and the real name is kept on the row.
 *
 * Shared by tasks and deals so the two cannot drift into different layouts —
 * the policies that parse these paths are written once per bucket and a
 * mismatch would deny every download instead of failing loudly.
 */
export const buildScopedAttachmentPath = (
  scopeId: Identifier,
  fileName: string,
): string => {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()}` : "";
  const random = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scopeId}/${random}${extension}`;
};
