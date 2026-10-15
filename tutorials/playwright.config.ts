import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env.e2e") });

/**
 * Records the manual's tutorials (docs/proposals/help-center.md).
 *
 * Separate from the e2e suite on purpose: these files produce recordings, not
 * verdicts, and must never run as part of `playwright test`. They share the
 * e2e stack (the throwaway database and the app on :5175) and its factories.
 *
 *   npm run tutorials:record                  every tutorial
 *   npm run tutorials:record -- -g <slug>     one of them
 */
export default defineConfig({
  testDir: here,
  testMatch: "**/*.tutorial.ts",
  outputDir: path.resolve(here, ".output/.playwright"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // A film runs for minutes; the e2e default would cut it short.
  timeout: 6 * 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5175",
    headless: true,
    actionTimeout: 10_000,
  },
  projects: [{ name: "recording", use: { ...devices["Desktop Chrome"] } }],
});
