import { authErrorKey } from "./authErrors";

/**
 * M13 (QA audit): Supabase Auth answers in English sentences, and the login
 * page used to show them as they came. Each one a user can cause maps to a
 * translated key; anything else is the generic failure, never the raw text.
 */
describe("authErrorKey", () => {
  it.each([
    ["Invalid login credentials", "crm.auth.errors.invalid_credentials"],
    ["Email not confirmed", "crm.auth.errors.email_not_confirmed"],
    ["Request rate limit reached", "crm.auth.errors.rate_limited"],
    ["User is banned", "crm.auth.errors.account_disabled"],
    ["Failed to fetch", "crm.auth.errors.network"],
  ])("names %j in the reader's language", (message, key) => {
    expect(authErrorKey(new Error(message))).toBe(key);
  });

  it("never shows an unknown server sentence", () => {
    expect(authErrorKey(new Error("Database error granting user"))).toBe(
      "ra.auth.sign_in_error",
    );
  });

  it("reads a plain object or a string as well as an Error", () => {
    expect(authErrorKey({ message: "Invalid login credentials" })).toBe(
      "crm.auth.errors.invalid_credentials",
    );
    expect(authErrorKey("Email not confirmed")).toBe(
      "crm.auth.errors.email_not_confirmed",
    );
  });
});
