import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import type {
  SlideBox,
  SlideTextElement,
  TextAlign,
  TextColor,
  TextSize,
} from "./portalSlides";

/**
 * Type size in `cqw` — percent of the STAGE's width, not the screen's — so a
 * text box wraps at the same word on a phone, in the editor and full screen.
 */
const TEXT_SIZE: Record<TextSize, string> = {
  sm: "1.6cqw",
  md: "2.3cqw",
  lg: "3.6cqw",
  xl: "5.6cqw",
};

const TEXT_WEIGHT: Record<TextSize, string> = {
  sm: "font-normal leading-normal",
  md: "font-normal leading-snug",
  lg: "font-semibold leading-tight tracking-tight",
  xl: "font-bold leading-[1.05] tracking-tight",
};

const TEXT_ALIGN: Record<TextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const TEXT_COLOR: Record<TextColor, string> = {
  light: "text-white",
  dark: "text-neutral-950",
};

/** A text box's type, shared with the editor's in-place textarea. */
export const slideTextClass = (element: SlideTextElement): string =>
  cn(
    "whitespace-pre-wrap wrap-break-word",
    TEXT_WEIGHT[element.size],
    TEXT_ALIGN[element.align],
    TEXT_COLOR[element.color],
  );

export const slideTextStyle = (element: SlideTextElement): CSSProperties => ({
  fontSize: TEXT_SIZE[element.size],
});

/** Where a box sits, in percent of the stage. */
export const boxStyle = (box: SlideBox): CSSProperties => ({
  left: `${box.x}%`,
  top: `${box.y}%`,
  width: `${box.w}%`,
  height: `${box.h}%`,
});
