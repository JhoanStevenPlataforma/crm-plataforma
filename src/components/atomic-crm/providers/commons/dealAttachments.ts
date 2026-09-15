import type { Identifier } from "ra-core";

import { buildScopedAttachmentPath } from "./attachmentPaths";

/**
 * The files that justify a deal stage move (`move_deal_stage`).
 *
 * They live in their OWN bucket, and it is private — the same call the task
 * module made, for the same reason. The `attachments` bucket that notes use was
 * created with `public = true`, so every object in it is served to whoever holds
 * the URL, signed in or not. Stage-change evidence is contracts, pricing and the
 * email that closed the deal; it has no business being world-readable while the
 * roles model promises a rep only sees their own records.
 *
 * Reads go through short-lived signed URLs minted at click time
 * (`dataProvider.getDealAttachmentUrl`), never a link rendered into the page
 * where it would outlive the reader's access to the deal.
 */
export const DEAL_ATTACHMENTS_BUCKET =
  import.meta.env.VITE_DEAL_ATTACHMENTS_BUCKET || "deal-attachments";

/** How long a generated download link stays valid, in seconds. */
export const DEAL_ATTACHMENT_URL_TTL = 60;

/** `<deal_id>/<random>.<ext>` — the deal id is what the storage policy reads. */
export const buildDealAttachmentPath = (
  dealId: Identifier,
  fileName: string,
): string => buildScopedAttachmentPath(dealId, fileName);
