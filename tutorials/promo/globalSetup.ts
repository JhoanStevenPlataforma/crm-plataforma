import { execSync } from "node:child_process";

/**
 * Reads the local stack's service-role key from the Supabase CLI, so the key
 * is never written to a file: the studio needs it once, to sign the presenter
 * in without a password.
 */
export default function globalSetup(): void {
  if (process.env.PROMO_SERVICE_ROLE_KEY) return;
  const output = execSync("npx supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const key = /^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m.exec(output)?.[1];
  if (!key) {
    throw new Error(
      "The local Supabase stack did not report a service-role key. Is it running (make start)?",
    );
  }
  process.env.PROMO_SERVICE_ROLE_KEY = key;
}
