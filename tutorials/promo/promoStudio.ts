import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { Director } from "../director";
import { installOverlay } from "../overlay";
import { PromoDirector } from "./promoDirector";
import { installPromoOverlay } from "./promoOverlay";

/**
 * The studio of the promotional film.
 *
 * Unlike the manual's studio (`../studio.ts`) it resets nothing and creates
 * nothing: the film shows the local development database as it is. It must
 * never import `e2e/fixtures`, whose reset empties whatever database it is
 * pointed at.
 *
 * It leaves, under `tutorials/.output/<slug>/`:
 *
 *   raw.webm      the recording, as the browser captured it
 *   captions.vtt  the narration, timed from the recording itself
 *   meta.json     every shot's real start and end, and the head to trim
 *
 * `produce.mjs` turns those into the film.
 */

/**
 * What the app lays out. The recorder never enlarges a page: it draws the
 * viewport in the top-left corner of the video and pads the rest, so
 * `produce.mjs` crops the recording to the viewport and scales THAT to VIDEO.
 */
export const VIEWPORT = { width: 1600, height: 900 };
export const SCALE = 1.2;
export const VIDEO = { width: 1920, height: 1080 };

export const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.output",
);

/** The person on screen: an administrator of the local stack. */
const PRESENTER_EMAIL = process.env.PROMO_PRESENTER || "steven@hermes.test";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";

export interface PromoStudio {
  page: Page;
  /** The manual's director: the pointer, the ring and the zoom. */
  director: Director;
  /** The film's clock, its slates and its shots. */
  promo: PromoDirector;
  /** The presenter's own API session, to read what a shot needs. */
  api: SupabaseClient;
}

/**
 * Signs the presenter in with a one-time link minted by the local service
 * role: no password is known, entered or changed.
 */
const signIn = async (): Promise<SupabaseClient> => {
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(
    SUPABASE_URL,
    process.env.PROMO_SERVICE_ROLE_KEY!,
    options,
  );
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: PRESENTER_EMAIL,
  });
  if (linkError) {
    throw new Error(`No sign-in link for the presenter: ${linkError.message}`);
  }
  const api = createClient(
    SUPABASE_URL,
    process.env.VITE_SB_PUBLISHABLE_KEY!,
    options,
  );
  const { error } = await api.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (error)
    throw new Error(`The presenter could not sign in: ${error.message}`);
  return api;
};

export const test = base.extend<{ studio: PromoStudio; kicker: string }>({
  kicker: ["Hermes CRM", { option: true }],

  studio: async ({ browser, baseURL, kicker }, provide, testInfo) => {
    const slug = testInfo.title;
    const outputDir = path.join(OUTPUT_DIR, slug);
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    const api = await signIn();
    const {
      data: { session },
    } = await api.auth.getSession();
    // The key supabase-js derives from the project URL.
    const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

    const context = await browser.newContext({
      baseURL,
      locale: "es-CO",
      timezoneId: "America/Bogota",
      colorScheme: "light",
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      permissions: ["clipboard-read", "clipboard-write"],
      recordVideo: { dir: outputDir, size: VIDEO },
    });
    // Signed in before the first frame: the film never shows a login form.
    await context.addInitScript(
      ([key, value]) => {
        if (localStorage.getItem(key) === null)
          localStorage.setItem(key, value);
      },
      [storageKey, JSON.stringify(session)] as const,
    );
    await context.addInitScript(installOverlay);
    await context.addInitScript(installPromoOverlay);

    const page = await context.newPage();
    // Leaving a form that was filled in and never saved asks first; the film
    // always means to leave.
    page.on("dialog", (dialog) => void dialog.accept());
    const director = new Director(page, kicker);
    const promo = new PromoDirector(page, director, kicker);

    await provide({ page, director, promo, api });

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
    // The captions are timed from second zero of the FILM, like the marks.
    await writeFile(path.join(outputDir, "captions.vtt"), director.toVtt());
    await writeFile(
      path.join(outputDir, "meta.json"),
      JSON.stringify(
        {
          slug,
          size: VIDEO,
          viewport: VIEWPORT,
          head_seconds: Number(promo.headSeconds().toFixed(3)),
          duration_seconds: Number(promo.now().toFixed(3)),
          marks: promo.marks,
          overruns: promo.overruns,
        },
        null,
        2,
      ),
    );
    for (const overrun of promo.overruns) console.warn(`OVERRUN ${overrun}`);
  },
});
