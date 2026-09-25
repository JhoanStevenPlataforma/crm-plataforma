import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  PORTAL_MEDIA_BUCKET,
  mediaExtensionOf,
  mediaKindOf,
} from "../../quotes/portal/portalSlides";

/**
 * Uploads a picture or a video for a portal slide and returns its storage path
 * (quote-portal-presentation.md §7).
 *
 * The name is a fresh uuid — the original file name never reaches a public
 * address — and nothing is ever overwritten (`upsert: false`), so a quotation
 * issued with the old file keeps showing it. The bucket enforces the same type
 * and size limits; checking them here first gives a sentence instead of an
 * HTTP error.
 */
export const uploadPortalMedia = async (
  supabase: SupabaseClient,
  file: File,
): Promise<string> => {
  const kind = mediaKindOf(file);
  const extension = mediaExtensionOf(file);
  if (!kind || !extension) {
    throw new Error("crm.portal_slides.errors.upload_type");
  }
  if (file.size > (kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
    throw new Error("crm.portal_slides.errors.upload_too_large");
  }
  const path = `slides/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(PORTAL_MEDIA_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "31536000",
    });
  if (error) {
    console.error("uploadPortalMedia.error", error);
    throw new Error("crm.portal_slides.errors.upload_failed");
  }
  return path;
};
