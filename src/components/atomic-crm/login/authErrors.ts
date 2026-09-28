/**
 * Supabase Auth answers in English sentences ("Invalid login credentials").
 * Shown as they are, a Spanish user reads an English error on a Spanish
 * screen. The ones a user can actually cause map to our own i18n keys; any
 * other one becomes the generic failure, never the raw message.
 */
const KNOWN_AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, "crm.auth.errors.invalid_credentials"],
  [/email not confirmed/i, "crm.auth.errors.email_not_confirmed"],
  [/rate limit|too many requests/i, "crm.auth.errors.rate_limited"],
  [/user (is )?banned|disabled/i, "crm.auth.errors.account_disabled"],
  [/failed to fetch|network/i, "crm.auth.errors.network"],
];

export const authErrorKey = (
  error: unknown,
  fallback = "ra.auth.sign_in_error",
): string => {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error || (error && typeof error === "object")
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  const known = KNOWN_AUTH_ERRORS.find(([pattern]) => pattern.test(message));
  return known ? known[1] : fallback;
};
