import { cleanTutorial } from "./helpForm";
import {
  formatDuration,
  helpMediaExtensionOf,
  helpMediaTypeOf,
  helpMediaUrl,
  isHelpMediaTooLarge,
} from "./helpMedia";

describe("help media", () => {
  it("stores a file under the extension of its type, never of its name", () => {
    const type = helpMediaTypeOf("video", {
      type: "video/mp4",
      name: "final.mov",
    });

    expect(type).toBe("video/mp4");
    expect(helpMediaExtensionOf("video", "video/mp4")).toBe("mp4");
    expect(helpMediaExtensionOf("poster", "image/jpeg")).toBe("jpg");
  });

  it("refuses a file of another kind", () => {
    expect(
      helpMediaTypeOf("video", { type: "image/png", name: "a.png" }),
    ).toBeNull();
    expect(
      helpMediaTypeOf("poster", { type: "image/svg+xml", name: "a.svg" }),
    ).toBeNull();
    expect(
      helpMediaTypeOf("captions", { type: "video/mp4", name: "a.vtt" }),
    ).toBeNull();
  });

  it("accepts captions the system reports no type for, by their extension", () => {
    expect(helpMediaTypeOf("captions", { type: "", name: "es.VTT" })).toBe(
      "text/vtt",
    );
    // Only captions get that fallback: a typeless file is not a recording.
    expect(helpMediaTypeOf("video", { type: "", name: "a.mp4" })).toBeNull();
  });

  it("caps a poster well below a recording", () => {
    const fiveMegabytes = { size: 5 * 1024 * 1024 };

    expect(isHelpMediaTooLarge("poster", fiveMegabytes)).toBe(true);
    expect(isHelpMediaTooLarge("video", fiveMegabytes)).toBe(false);
    expect(isHelpMediaTooLarge("video", { size: 51 * 1024 * 1024 })).toBe(true);
  });

  it("appends the path to the storage address", () => {
    expect(helpMediaUrl("video/abc.mp4")).toMatch(
      /\/storage\/v1\/object\/public\/help-media\/video\/abc\.mp4$/,
    );
  });

  it("writes a duration as minutes and seconds", () => {
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(7.6)).toBe("0:08");
  });

  it("drops the blank lines typed between steps", () => {
    const cleaned = cleanTutorial({ steps: [" Open Products. ", "", "  "] });

    expect(cleaned.steps).toEqual(["Open Products."]);
  });
});
