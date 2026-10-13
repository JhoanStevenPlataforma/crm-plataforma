import {
  formatEmailDate,
  formatEmailMoney,
  type EmailLanguage,
} from "./renderEmail.ts";

/**
 * Filling a template's `{{variables}}` (docs/proposals/outbound-email.md).
 *
 * Pure, and shared for the same reason `renderEmail.ts` is: the compose dialog
 * fills a template for a person to edit, the dispatcher fills the one an
 * automation queued, and a total or a date must read the same in both.
 *
 * `{{name}}` is the only syntax, the same one `email_text_variables()` reads.
 * The result is PLAIN TEXT; `renderEmail` escapes it into the layout, so
 * nothing here needs to.
 */

export const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
export const QUOTE_LINK_VARIABLE = "quote_link";
const DATE_VARIABLES = new Set(["issue_date", "valid_until"]);

export type EmailVariables = Record<string, string | number | null | undefined>;

const display = (
  name: string,
  value: string | number | null | undefined,
  language: EmailLanguage,
): string => {
  if (value == null) return "";
  if (DATE_VARIABLES.has(name)) return formatEmailDate(String(value), language);
  // The stored total, formatted for reading. Never recomputed.
  if (name === "total") return formatEmailMoney(value, null, language);
  return String(value);
};

/**
 * Replaces every variable the record has a value for, in ONE pass: a value is
 * never read as a template. The quotation link is left as its marker: only the
 * server knows it, and it resolves it while sending. A variable with no value
 * becomes nothing rather than staying as braces.
 */
export const fillTemplate = (
  text: string,
  variables: EmailVariables,
  language: EmailLanguage,
): string =>
  text.replace(VARIABLE_PATTERN, (marker, name: string) =>
    name === QUOTE_LINK_VARIABLE
      ? marker
      : display(name, variables[name], language),
  );
