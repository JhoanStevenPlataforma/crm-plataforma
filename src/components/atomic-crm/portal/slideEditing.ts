import {
  MAX_ELEMENTS_PER_SLIDE,
  MIN_BOX_PERCENT,
  type SlideBox,
  type SlideElement,
  type SlideTextElement,
} from "../quotes/portal/portalSlides";

/**
 * The slide editor's arithmetic, kept out of the components so it can be
 * tested without a pointer (quote-portal-presentation.md §7). Every function
 * returns a NEW list or box; nothing is edited in place.
 *
 * Boxes are in percent of the 16:9 stage and always stay inside it: a box the
 * database would refuse is never produced here.
 */

/** Stage width divided by stage height. */
const STAGE_RATIO = 16 / 9;

/** Two decimals: precise to a fifth of a pixel on a 4K screen, and short. */
const round = (value: number) => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** A box moved inside the stage, and rounded. */
const fit = (box: SlideBox): SlideBox => {
  const w = clamp(box.w, MIN_BOX_PERCENT, 100);
  const h = clamp(box.h, MIN_BOX_PERCENT, 100);
  return {
    x: round(clamp(box.x, 0, 100 - w)),
    y: round(clamp(box.y, 0, 100 - h)),
    w: round(w),
    h: round(h),
  };
};

/** The box dragged by (`dx`, `dy`) percent of the stage. */
export const moveBox = (box: SlideBox, dx: number, dy: number): SlideBox =>
  fit({ ...box, x: box.x + dx, y: box.y + dy });

/** Which edges a resize handle drags: `n`orth, `s`outh, `e`ast, `w`est. */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RESIZE_HANDLES: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/**
 * The box resized from one handle by (`dx`, `dy`) percent. The opposite edge
 * stays where it was; no edge crosses it or leaves the stage.
 */
export const resizeBox = (
  box: SlideBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): SlideBox => {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (handle.includes("w")) {
    left = clamp(left + dx, 0, right - MIN_BOX_PERCENT);
  }
  if (handle.includes("e")) {
    right = clamp(right + dx, left + MIN_BOX_PERCENT, 100);
  }
  if (handle.includes("n")) {
    top = clamp(top + dy, 0, bottom - MIN_BOX_PERCENT);
  }
  if (handle.includes("s")) {
    bottom = clamp(bottom + dy, top + MIN_BOX_PERCENT, 100);
  }
  return fit({ x: left, y: top, w: right - left, h: bottom - top });
};

/** A fresh id for a box: unique within a slide, and what the schema allows. */
export const newElementId = (): string => crypto.randomUUID();

/** Whether one more box fits on the slide. */
export const canAddElement = (elements: SlideElement[]): boolean =>
  elements.length < MAX_ELEMENTS_PER_SLIDE;

/** A text box across the middle of the slide, on top of everything. */
export const addTextElement = (
  elements: SlideElement[],
  text: string,
): SlideElement[] => [
  ...elements,
  {
    id: newElementId(),
    kind: "text",
    x: 10,
    y: 40,
    w: 80,
    h: 20,
    text,
    size: "lg",
    align: "center",
    color: "light",
  },
];

/**
 * A picture or a video, centred and sized to its own proportions
 * (`aspect` = width / height), so nothing is cropped until somebody resizes it.
 */
export const addMediaElement = (
  elements: SlideElement[],
  media: { kind: "image" | "video"; path: string; aspect: number | null },
): SlideElement[] => {
  const aspect =
    media.aspect && Number.isFinite(media.aspect) && media.aspect > 0
      ? media.aspect
      : STAGE_RATIO;
  // Half the stage wide, unless that makes it taller than 80% of it.
  let w = 50;
  let h = (w * STAGE_RATIO) / aspect;
  if (h > 80) {
    h = 80;
    w = (h * aspect) / STAGE_RATIO;
  }
  const box = fit({ x: (100 - w) / 2, y: (100 - h) / 2, w, h });
  return [
    ...elements,
    { id: newElementId(), kind: media.kind, path: media.path, ...box },
  ];
};

/** The element with `id` replaced by `update(element)`, its box kept inside. */
export const updateElement = (
  elements: SlideElement[],
  id: string,
  update: (element: SlideElement) => SlideElement,
): SlideElement[] =>
  elements.map((element) => {
    if (element.id !== id) return element;
    const next = update(element);
    return { ...next, ...fit(next) } as SlideElement;
  });

/** A text box's own settings changed (text, size, alignment, colour). */
export const updateText = (
  elements: SlideElement[],
  id: string,
  patch: Partial<Pick<SlideTextElement, "text" | "size" | "align" | "color">>,
): SlideElement[] =>
  updateElement(elements, id, (element) =>
    element.kind === "text" ? { ...element, ...patch } : element,
  );

export const removeElement = (
  elements: SlideElement[],
  id: string,
): SlideElement[] => elements.filter((element) => element.id !== id);

/** Last in the list is drawn on top. */
export const bringToFront = (
  elements: SlideElement[],
  id: string,
): SlideElement[] => {
  const element = elements.find((candidate) => candidate.id === id);
  return element ? [...removeElement(elements, id), element] : elements;
};

export const sendToBack = (
  elements: SlideElement[],
  id: string,
): SlideElement[] => {
  const element = elements.find((candidate) => candidate.id === id);
  return element ? [element, ...removeElement(elements, id)] : elements;
};

/**
 * The positions a deck should have after a structural change: 0, 1, 2… in the
 * given order. Only the slides whose position actually changes are returned,
 * so a move writes two rows, not thirty.
 */
export const renumber = <T extends { id: number; position: number }>(
  slides: T[],
): Array<{ id: number; position: number }> =>
  slides
    .map((slide, index) => ({ id: slide.id, position: index }))
    .filter(({ id, position }) =>
      slides.some((slide) => slide.id === id && slide.position !== position),
    );

/** The deck with the slide at `from` moved to `to`. */
export const moveSlide = <T>(slides: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= slides.length || from === to) return slides;
  const next = [...slides];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
