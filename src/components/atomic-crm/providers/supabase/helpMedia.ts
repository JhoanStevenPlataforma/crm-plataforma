import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HELP_MEDIA_BUCKET,
  type HelpMediaKind,
  helpMediaExtensionOf,
  helpMediaTypeOf,
  isHelpMediaTooLarge,
} from "../../help/helpMedia";

/**
 * Uploads a tutorial's recording, poster or captions and returns the storage
 * path (docs/proposals/help-center.md).
 *
 * The name is a fresh uuid and nothing is ever overwritten (`upsert: false`):
 * the files are cached for a year, so a replaced recording has to be a new
 * address or whoever cached the old one keeps watching it. The bucket enforces
 * the same types and the size ceiling; checking here first gives a sentence
 * instead of an HTTP error.
 */
export const uploadHelpMedia = async (
  supabase: SupabaseClient,
  kind: HelpMediaKind,
  file: File,
): Promise<string> => {
  const type = helpMediaTypeOf(kind, file);
  const extension = type ? helpMediaExtensionOf(kind, type) : null;
  if (!type || !extension) {
    throw new Error("crm.help.errors.upload_type");
  }
  if (isHelpMediaTooLarge(kind, file)) {
    throw new Error("crm.help.errors.upload_too_large");
  }
  const path = `${kind}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(HELP_MEDIA_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: type,
      cacheControl: "31536000",
    });
  if (error) {
    console.error("uploadHelpMedia.error", error);
    throw new Error("crm.help.errors.upload_failed");
  }
  return path;
};
