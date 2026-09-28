import { markdownToPlainText } from "./markdownText";

describe("markdownToPlainText", () => {
  it("shows a note's words without its Markdown markup", () => {
    expect(markdownToPlainText("Call **Ada** about the _renewal_")).toBe(
      "Call Ada about the renewal",
    );
  });

  it("drops raw HTML instead of printing its source", () => {
    expect(
      markdownToPlainText('<img src=x onerror="window.__xss=1"> hello'),
    ).toBe("hello");
  });

  it("collapses line breaks for a one-line preview", () => {
    expect(markdownToPlainText("first line\n\nsecond line")).toBe(
      "first line second line",
    );
  });
});
