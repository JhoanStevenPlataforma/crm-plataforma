import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BrowserContextOptions, Page } from "@playwright/test";

import { expect, test as base } from "../e2e/fixtures";
import { Director } from "./director";
import { installOverlay } from "./overlay";

/**
 * The recording studio: everything a tutorial needs before its first frame.
 *
 * A tutorial is a Playwright "test" only because that is what gives it the
 * e2e stack's reset and factories (`../e2e/fixtures`) -- every recording
 * starts from the same empty database, so re-recording after a UI change is
 * running the file again. It asserts nothing; it produces four files under
 * `tutorials/.output/<slug>/`:
 *
 *   raw.webm      the recording, as the browser captured it
 *   poster.jpg    the opening card
 *   captions.vtt  the captions, timed from the recording itself
 *   meta.json     how long it runs
 *
 * `encode.mjs` turns `raw.webm` into the MP4 that is published.
 */

export const SIZE = { width: 1600, height: 900 };
export const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".output",
);

/** The person on screen. A manager: they price the catalogue AND quote. */
export const PRESENTER = {
  first_name: "Laura",
  last_name: "Pérez",
  email: "laura@ejemplo.test",
  password: "password",
  role: "manager",
} as const;

export interface Studio {
  page: Page;
  director: Director;
  /** The presenter's `sales.id`, to own the records a tutorial starts from. */
  presenterId: number;
  /**
   * Opens the first screen under the opening card, so the film starts on the
   * title instead of on a page loading.
   */
  open: (route: string, title: string, subtitle: string) => Promise<void>;
}

export const test = base.extend<{ studio: Studio; eyebrow: string }>({
  eyebrow: ["Manual", { option: true }],

  studio: async (
    { browser, baseURL, createSales, eyebrow },
    provide,
    testInfo,
  ) => {
    const slug = testInfo.title;
    const outputDir = path.join(OUTPUT_DIR, slug);
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    const presenter = await createSales(PRESENTER);

    const options = {
      baseURL,
      locale: "es-CO",
      timezoneId: "America/Bogota",
      colorScheme: "light" as const,
      viewport: SIZE,
      // "Copy the link" writes to the clipboard, which a headless page may
      // not do unless it is told it can.
      permissions: ["clipboard-read", "clipboard-write"],
    } satisfies BrowserContextOptions;

    // Signed in off camera: the film opens on the CRM, not on a login form.
    const backstage = await browser.newContext(options);
    const login = await backstage.newPage();
    await login.goto("/");
    await login.getByPlaceholder("nombre@empresa.com").fill(PRESENTER.email);
    await login.locator('input[type="password"]').fill(PRESENTER.password);
    await login.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(
      login.getByRole("link", { name: "Cotizaciones", exact: true }),
    ).toBeVisible();
    const storageState = await backstage.storageState();
    await backstage.close();

    const context = await browser.newContext({
      ...options,
      storageState,
      recordVideo: { dir: outputDir, size: SIZE },
    });
    await context.addInitScript(installOverlay);
    const page = await context.newPage();
    const director = new Director(page, eyebrow);

    await provide({
      page,
      director,
      presenterId: presenter.id,
      open: async (route, title, subtitle) => {
        await page.goto(`/#${route}`);
        const introShown = director.intro(title, subtitle);
        await page.waitForTimeout(700);
        await page.screenshot({
          path: path.join(outputDir, "poster.jpg"),
          type: "jpeg",
          quality: 84,
        });
        await introShown;
        await director.reveal();
      },
    });

    // A script that broke leaves what it was looking at, so the locator that
    // no longer matches can be found without replaying the film.
    if (testInfo.status !== testInfo.expectedStatus) {
      await page
        .screenshot({ path: path.join(outputDir, "failure.png") })
        .catch(() => undefined);
      await writeFile(
        path.join(outputDir, "failure.yml"),
        await page
          .locator("body")
          .ariaSnapshot()
          .catch(() => "no snapshot"),
      );
    }

    const video = page.video();
    await context.close();
    if (video) {
      await rename(await video.path(), path.join(outputDir, "raw.webm"));
    }
    await writeFile(path.join(outputDir, "captions.vtt"), director.toVtt());
    await writeFile(
      path.join(outputDir, "meta.json"),
      JSON.stringify(
        {
          slug,
          duration_seconds: director.duration(),
          size: SIZE,
        },
        null,
        2,
      ),
    );
  },
});
