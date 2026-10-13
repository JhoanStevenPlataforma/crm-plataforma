import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env.development") });

/**
 * Records the promotional video (docs/video/guion-promocional.md).
 *
 * A config of its own, and on purpose: the tutorials run on the e2e stack,
 * whose fixtures EMPTY the database before every recording. This film shows
 * the data of the local development stack, so it must never share a config,
 * a fixture or a `testMatch` with them. Nothing under this folder imports
 * `e2e/`.
 *
 *   npm run promo:record                 the film
 *   npm run promo:record -- -g scout     a still of every screen it visits
 */
export default defineConfig({
  testDir: here,
  testMatch: "**/*.promo.ts",
  outputDir: path.resolve(here, "../.output/.playwright-promo"),
  globalSetup: path.resolve(here, "globalSetup.ts"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 6 * 60_000,
  use: {
    baseURL: process.env.PROMO_BASE_URL || "http://localhost:5173",
    headless: true,
    actionTimeout: 10_000,
  },
  projects: [{ name: "recording", use: { ...devices["Desktop Chrome"] } }],
});
