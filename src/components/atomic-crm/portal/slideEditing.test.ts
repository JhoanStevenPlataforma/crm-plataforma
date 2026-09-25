import { slideElementSchema } from "../quotes/portal/portalSlides";
import {
  addMediaElement,
  addTextElement,
  bringToFront,
  moveBox,
  moveSlide,
  renumber,
  resizeBox,
  sendToBack,
  updateText,
} from "./slideEditing";

const box = { x: 10, y: 20, w: 30, h: 40 };

describe("moveBox", () => {
  it("moves a box by the dragged distance", () => {
    expect(moveBox(box, 5, -5)).toEqual({ x: 15, y: 15, w: 30, h: 40 });
  });

  it("stops at the stage's edges instead of leaving it", () => {
    expect(moveBox(box, 500, 500)).toEqual({ x: 70, y: 60, w: 30, h: 40 });
    expect(moveBox(box, -500, -500)).toEqual({ x: 0, y: 0, w: 30, h: 40 });
  });
});

describe("resizeBox", () => {
  it("grows from the bottom-right corner and keeps the top-left where it was", () => {
    expect(resizeBox(box, "se", 10, 10)).toEqual({
      x: 10,
      y: 20,
      w: 40,
      h: 50,
    });
  });

  it("grows from the top-left corner and keeps the bottom-right where it was", () => {
    expect(resizeBox(box, "nw", -5, -10)).toEqual({
      x: 5,
      y: 10,
      w: 35,
      h: 50,
    });
  });

  it("changes only the dragged side from an edge handle", () => {
    expect(resizeBox(box, "e", 10, 99)).toEqual({ x: 10, y: 20, w: 40, h: 40 });
  });

  it("never lets an edge cross the opposite one or leave the stage", () => {
    expect(resizeBox(box, "w", 100, 0)).toEqual({ x: 39, y: 20, w: 1, h: 40 });
    expect(resizeBox(box, "se", 500, 500)).toEqual({
      x: 10,
      y: 20,
      w: 90,
      h: 80,
    });
  });
});

describe("adding boxes", () => {
  it("adds a text box the database accepts, on top of the others", () => {
    const elements = addTextElement([], "Hello");

    expect(elements).toHaveLength(1);
    expect(slideElementSchema.safeParse(elements[0]).success).toBe(true);
    expect(elements[0]).toMatchObject({ kind: "text", text: "Hello" });
  });

  it("sizes a picture to its own proportions, centred", () => {
    // A square picture: half the stage wide is 50% of 16 units, so 8 units
    // high out of 9 -- 88.9% -- which is capped to 80% and narrowed to match.
    const [element] = addMediaElement([], {
      kind: "image",
      path: "slides/11111111-1111-4111-8111-111111111111.webp",
      aspect: 1,
    });

    expect(element).toMatchObject({ x: 27.5, y: 10, w: 45, h: 80 });
    expect(slideElementSchema.safeParse(element).success).toBe(true);
  });

  it("falls back to the stage's shape when a video's size is unknown", () => {
    const [element] = addMediaElement([], {
      kind: "video",
      path: "slides/11111111-1111-4111-8111-111111111111.mp4",
      aspect: null,
    });

    expect(element).toMatchObject({ w: 50, h: 50 });
  });
});

describe("editing boxes", () => {
  const two = addTextElement(addTextElement([], "first"), "second");
  const [first, second] = two;

  it("changes a text box's settings without touching the others", () => {
    const next = updateText(two, first.id, { size: "xl", color: "dark" });

    expect(next[0]).toMatchObject({ size: "xl", color: "dark", text: "first" });
    expect(next[1]).toBe(second);
    expect(two[0]).toMatchObject({ size: "lg" });
  });

  it("brings a box to the front and sends it to the back", () => {
    expect(bringToFront(two, first.id).map((e) => e.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(sendToBack(two, second.id).map((e) => e.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});

describe("reordering slides", () => {
  const deck = [
    { id: 7, position: 0 },
    { id: 8, position: 1 },
    { id: 9, position: 2 },
  ];

  it("moves a slide and writes only the rows whose position changed", () => {
    const moved = moveSlide(deck, 2, 1);

    expect(moved.map((slide) => slide.id)).toEqual([7, 9, 8]);
    expect(renumber(moved)).toEqual([
      { id: 9, position: 1 },
      { id: 8, position: 2 },
    ]);
  });

  it("ignores a move past either end", () => {
    expect(moveSlide(deck, 0, -1)).toBe(deck);
    expect(moveSlide(deck, 2, 3)).toBe(deck);
  });

  it("closes the gap a deleted slide leaves", () => {
    expect(renumber([deck[0], deck[2]])).toEqual([{ id: 9, position: 1 }]);
  });
});
