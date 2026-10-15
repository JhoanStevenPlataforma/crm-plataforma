// Saves still frames of a recording, to judge it without playing it:
//
//   node tutorials/frames.mjs <slug> 5 14 27      frames at those seconds
//
// The stills land next to the recording as frame-<second>.png. They are read
// from the file that would be published (the MP4 when it exists), decoded by
// a real browser, so what they show is what a viewer gets -- compression
// included.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const [slug, ...seconds] = process.argv.slice(2);
if (!slug || seconds.length === 0) {
  console.error("usage: node tutorials/frames.mjs <slug> <second> [...]");
  process.exit(1);
}

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".output",
  slug,
);
const mp4 = path.join(dir, "video.mp4");
const source = existsSync(mp4) ? mp4 : path.join(dir, "raw.webm");

// The bundled Chromium has no H.264 decoder; an installed Chrome does.
const browser = await chromium.launch({
  headless: true,
  ...(source === mp4 ? { channel: "chrome" } : {}),
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
});
// Opened as its own document: a page at about:blank may not load a file.
await page.goto(pathToFileURL(source).href);
const video = page.locator("video");
await video.evaluate((element) => {
  element.pause();
  element.controls = false;
  element.style.cssText = "position:fixed;inset:0;width:1600px;height:900px";
});
for (const second of seconds) {
  await video.evaluate(
    (element, time) =>
      new Promise((resolve) => {
        element.addEventListener("seeked", resolve, { once: true });
        element.currentTime = time;
      }),
    Number(second),
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(dir, `frame-${second}.png`) });
}
await browser.close();
