/**
 * The largest file Storage accepts: `file_size_limit` in
 * `supabase/config.toml` (50 MiB). Checked in the browser so an oversized file
 * is refused with a sentence before the upload starts, instead of failing
 * half-way with Storage's own error.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** "50 MB" — what the refusal quotes. */
export const MAX_UPLOAD_LABEL = "50 MB";

export const splitBySize = (
  files: File[],
  limit: number = MAX_UPLOAD_BYTES,
): { accepted: File[]; tooLarge: File[] } => ({
  accepted: files.filter((file) => file.size <= limit),
  tooLarge: files.filter((file) => file.size > limit),
});
