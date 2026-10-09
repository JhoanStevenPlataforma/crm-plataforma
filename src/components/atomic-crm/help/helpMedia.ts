/**
 * The files behind a tutorial: a recording, its poster and its captions, in
 * the public `help-media` bucket (docs/proposals/help-center.md).
 *
 * The three kinds, their folders and their extensions are also written in the
 * bucket's insert policy and in the `*_path` checks of `help_tutorials`; the
 * three must agree, or the uploader produces a name the database refuses.
 */

export const HELP_MEDIA_BUCKET = "help-media";

export type HelpMediaKind = "video" | "poster" | "captions";

/** MIME type → storage extension, per kind. Never read from the file name. */
const EXTENSIONS: Record<HelpMediaKind, Record<string, string>> = {
  video: { "video/mp4": "mp4", "video/webm": "webm" },
  poster: { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" },
  captions: { "text/vtt": "vtt" },
};

/** The ceilings the form checks before an upload (the bucket caps at 50 MB). */
const MAX_BYTES: Record<HelpMediaKind, number> = {
  video: 50 * 1024 * 1024,
  poster: 2 * 1024 * 1024,
  captions: 512 * 1024,
};

/** What the file picker offers for each kind. */
export const HELP_MEDIA_ACCEPT: Record<HelpMediaKind, string> = {
  video: "video/mp4,video/webm",
  poster: "image/webp,image/jpeg,image/png",
  captions: "text/vtt,.vtt",
};

/**
 * The MIME type a file is stored with. Windows reports no type at all for a
 * `.vtt` file, so captions -- and only captions -- fall back to the extension.
 */
export const helpMediaTypeOf = (
  kind: HelpMediaKind,
  file: Pick<File, "type" | "name">,
): string | null => {
  if (EXTENSIONS[kind][file.type]) return file.type;
  if (kind === "captions" && file.type === "" && /\.vtt$/i.test(file.name)) {
    return "text/vtt";
  }
  return null;
};

export const helpMediaExtensionOf = (
  kind: HelpMediaKind,
  type: string,
): string | null => EXTENSIONS[kind][type] ?? null;

export const isHelpMediaTooLarge = (
  kind: HelpMediaKind,
  file: Pick<File, "size">,
): boolean => file.size > MAX_BYTES[kind];

/**
 * The address of a tutorial's file. `VITE_HELP_MEDIA_BASE_URL` moves every
 * recording to a CDN or another object store without touching a row: the
 * paths stay, only what they are appended to changes.
 */
export const helpMediaUrl = (path: string): string => {
  const base =
    import.meta.env.VITE_HELP_MEDIA_BASE_URL ||
    `${import.meta.env.VITE_SUPABASE_URL ?? ""}/storage/v1/object/public/${HELP_MEDIA_BUCKET}`;
  return `${base.replace(/\/+$/, "")}/${path}`;
};

/** `95` → `1:35`. A tutorial is minutes long, so there are no hours. */
export const formatDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** A recording's length, read in the browser before it is uploaded. */
export const durationOf = (file: File): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
    video.onerror = () => done(null);
    video.src = url;
  });
