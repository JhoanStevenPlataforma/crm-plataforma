import { z } from "zod";

import certificationsImage from "./assets/certifications.webp";
import companyImage from "./assets/company.webp";
import coverImage from "./assets/cover.webp";
import purposeImage from "./assets/purpose.webp";

/**
 * The customer portal's slides (docs/proposals/quote-portal-presentation.md §7).
 *
 * Slides are grouped in TEMPLATES, edited by admins at `/portal`; the active
 * template is frozen into the version when a quotation is issued and served in
 * the portal payload. "Predeterminada" ships with the build, locked. A slide
 * is a free canvas: an ordered list of boxes (first = bottom), each an image, a
 * video or a text, placed in PERCENT of a 16:9 stage — so the same numbers draw
 * the same slide on a phone, in the editor and on a projector.
 *
 * This file is the TypeScript mirror of `portal_slide_element_is_valid()`
 * (02_functions.sql): the portal validates what it renders, the editor only
 * writes what the database accepts.
 */

export const MAX_SLIDES = 30;
export const MAX_ELEMENTS_PER_SLIDE = 20;
export const MAX_TEXT_LENGTH = 2000;
export const MIN_BOX_PERCENT = 1;

export const PORTAL_MEDIA_BUCKET = "portal-media";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const IMAGE_EXTENSIONS = ["webp", "jpg", "png", "gif", "avif"] as const;
export const VIDEO_EXTENSIONS = ["mp4", "webm"] as const;
/**
 * The pictures bundled with the app, which the default template uses. A closed
 * list: `builtin/<name>.webp` resolves here and nowhere else.
 */
const BUILTIN_MEDIA: Record<string, string> = {
  "builtin/cover.webp": coverImage,
  "builtin/company.webp": companyImage,
  "builtin/purpose.webp": purposeImage,
  "builtin/certifications.webp": certificationsImage,
};
const IMAGE_PATH = new RegExp(
  `^(slides/${UUID}\\.(${IMAGE_EXTENSIONS.join("|")})|builtin/(cover|company|purpose|certifications)\\.webp)$`,
);
const VIDEO_PATH = new RegExp(
  `^slides/${UUID}\\.(${VIDEO_EXTENSIONS.join("|")})$`,
);

export const TEXT_SIZES = ["sm", "md", "lg", "xl"] as const;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const TEXT_COLORS = ["light", "dark"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export type TextColor = (typeof TEXT_COLORS)[number];

const box = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(MIN_BOX_PERCENT).max(100),
  h: z.number().min(MIN_BOX_PERCENT).max(100),
};

const alt = z.string().max(200).optional();

export const slideElementSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("image"),
    ...box,
    path: z.string().regex(IMAGE_PATH),
    alt,
  }),
  z.strictObject({
    kind: z.literal("video"),
    ...box,
    path: z.string().regex(VIDEO_PATH),
    alt,
  }),
  z.strictObject({
    kind: z.literal("text"),
    ...box,
    text: z.string().max(MAX_TEXT_LENGTH),
    size: z.enum(TEXT_SIZES),
    align: z.enum(TEXT_ALIGNS),
    color: z.enum(TEXT_COLORS),
  }),
]);

export type SlideElement = z.infer<typeof slideElementSchema>;
export type SlideTextElement = Extract<SlideElement, { kind: "text" }>;
export type SlideMediaElement = Extract<
  SlideElement,
  { kind: "image" | "video" }
>;
export type SlideBox = Pick<SlideElement, "x" | "y" | "w" | "h">;

/** One slide as the portal payload carries it (`portal_slides_snapshot()`). */
export const portalSlideSchema = z.object({
  elements: z.array(slideElementSchema).max(MAX_ELEMENTS_PER_SLIDE),
});

export type PortalSlideContent = z.infer<typeof portalSlideSchema>;

/** A row of `public.portal_slides`, as the editor reads it. */
export type PortalSlide = PortalSlideContent & {
  id: number;
  template_id: number;
  position: number;
};

/** A row of `public.portal_templates`. */
export type PortalTemplate = {
  id: number;
  name: string;
  /** The one every quotation issued from now on shows. */
  is_active: boolean;
  /** The template the build ships: never edited, renamed or deleted. */
  is_system: boolean;
};

/** What a text box's `{placeholders}` are filled with, per quotation. */
export type SlidePlaceholderValues = {
  company: string;
  contact: string;
  quote: string;
  brand: string;
};

const PLACEHOLDER = /\{(company|contact|quote|brand)\}/g;

/**
 * The slides as THIS customer reads them: `{company}`, `{contact}`, `{quote}`
 * and `{brand}` in any text box replaced by the quotation's own values. Plain
 * text in, plain text out — it is rendered as React text. Returns new objects.
 */
export const fillSlidePlaceholders = (
  slides: PortalSlideContent[],
  values: SlidePlaceholderValues,
): PortalSlideContent[] =>
  slides.map((slide) => ({
    elements: slide.elements.map((element) =>
      element.kind === "text"
        ? {
            ...element,
            text: element.text
              .replace(PLACEHOLDER, (_, key: keyof SlidePlaceholderValues) =>
                values[key].trim(),
              )
              // An empty value must not leave "for , the" behind.
              .replace(/[ \t]+([,.;:])/g, "$1")
              .replace(/[ \t]{2,}/g, " "),
          }
        : element,
    ),
  }));

/**
 * The address of a slide's file: a bundled picture, or the public bucket (a
 * customer has no session). The path was checked by the schema above, so
 * nothing but `slides/<uuid>.<ext>` is ever put in a storage URL.
 */
export const portalMediaUrl = (path: string): string =>
  BUILTIN_MEDIA[path] ??
  `${import.meta.env.VITE_SUPABASE_URL ?? ""}/storage/v1/object/public/${PORTAL_MEDIA_BUCKET}/${path}`;

/** Whether a file can go on a slide, and as what. */
export const mediaKindOf = (
  file: Pick<File, "type">,
): "image" | "video" | null => {
  if (/^image\/(webp|jpeg|png|gif|avif)$/.test(file.type)) return "image";
  if (/^video\/(mp4|webm)$/.test(file.type)) return "video";
  return null;
};

/** The storage extension for a file, from its type (never from its name). */
export const mediaExtensionOf = (file: Pick<File, "type">): string | null => {
  const subtype = file.type.split("/")[1];
  if (subtype === "jpeg") return "jpg";
  return (
    [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].find((ext) => ext === subtype) ??
    null
  );
};

/** The ceilings the editor checks before an upload (the bucket enforces them). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
