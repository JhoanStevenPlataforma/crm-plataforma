import { sectionForKey } from "./useQuotePortalKeyboard";

const sectionIds = ["cover", "team", "video", "quotation"];

const press = (key: string, activeId: string | null, isAtQuotationTop = true) =>
  sectionForKey({
    key,
    sectionIds,
    activeId,
    quotationId: "quotation",
    isAtQuotationTop,
  });

describe("sectionForKey", () => {
  it("moves one slide down with the arrow, page and space keys", () => {
    expect(press("ArrowDown", "cover")).toBe("team");
    expect(press("PageDown", "team")).toBe("video");
    expect(press(" ", "video")).toBe("quotation");
  });

  it("moves one slide up", () => {
    expect(press("ArrowUp", "video")).toBe("team");
    expect(press("PageUp", "team")).toBe("cover");
  });

  it("jumps to the cover and to the quotation", () => {
    expect(press("Home", "video")).toBe("cover");
    expect(press("End", "cover")).toBe("quotation");
  });

  it("leaves the keys to the browser while the reader is inside the quotation", () => {
    expect(press("ArrowDown", "quotation")).toBeNull();
    expect(press("ArrowUp", "quotation", false)).toBeNull();
  });

  it("goes back to the last slide from the top of the quotation", () => {
    expect(press("ArrowUp", "quotation", true)).toBe("video");
  });

  it("ignores every other key, and stops at the ends", () => {
    expect(press("a", "cover")).toBeNull();
    expect(press("ArrowUp", "cover")).toBeNull();
  });
});
