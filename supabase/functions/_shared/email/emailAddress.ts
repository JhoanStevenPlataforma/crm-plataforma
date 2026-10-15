import type { EmailParty } from "./types.ts";

/**
 * The same rule as `public.is_valid_email()`: deliberately narrower than the
 * RFC, so an address can never carry whitespace, a quote, a comment or a
 * second header. Keep the two identical.
 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const MAX_EMAIL_LENGTH = 320;
// Every C0 control character and DEL: a CR or an LF in a header value is how
// one header becomes two.
const CONTROL_CHARACTERS = /[\p{Cc}]/u;

export const isValidEmail = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 3 &&
  value.length <= MAX_EMAIL_LENGTH &&
  EMAIL_PATTERN.test(value);

export const isHeaderSafe = (value: string): boolean =>
  !CONTROL_CHARACTERS.test(value);

/**
 * `"Name" <address>`, or the bare address when there is no usable name.
 *
 * A name is dropped rather than repaired when it holds anything that could
 * end the quoted string or the header: showing no name is harmless, guessing
 * what the caller meant is not.
 */
export const formatAddress = ({ email, name }: EmailParty): string => {
  const clean = (name ?? "").trim();
  if (!clean || !isHeaderSafe(clean) || /["<>\\]/.test(clean)) {
    return email;
  }
  return `"${clean}" <${email}>`;
};
