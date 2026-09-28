/**
 * Soft format checks for free-text fields that are really numbers.
 *
 * "Soft" on purpose: phone formats differ by country and people type
 * extensions, spaces and brackets, so the phone check only refuses what cannot
 * be dialled (letters, too few or too many digits). Both accept an empty value;
 * whether the field is required is a separate rule.
 */

type ValidationError = { message: string; args: { _: string } };

/** E.164 allows 15 digits; fewer than 6 is not a reachable number anywhere. */
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 15;
const PHONE_SHAPE = /^\+?[\d\s().\-/]+(\s*(ext\.?|x)\s*\d+)?$/i;

export const isPhoneNumber = (
  value?: string | null,
): ValidationError | undefined => {
  if (!value || !value.trim()) return undefined;
  const main = value.replace(/\s*(ext\.?|x)\s*\d+$/i, "");
  const digits = main.replace(/\D/g, "").length;
  if (
    PHONE_SHAPE.test(value.trim()) &&
    digits >= PHONE_MIN_DIGITS &&
    digits <= PHONE_MAX_DIGITS
  ) {
    return undefined;
  }
  return {
    message: "crm.validation.invalid_phone",
    args: { _: "Enter a phone number: digits, spaces, +, - or brackets" },
  };
};

/**
 * An amount, optionally with a currency sign, separators and a K / M / B
 * scale: "$1M", "250.000", "1,5 MM". Refuses words ("a lot", "unknown").
 */
const REVENUE_SHAPE =
  /^[$€£]?\s*\d+([.,\s]\d+)*\s*(k|m|mm|b|mil|millones)?\s*$/i;

export const isRevenue = (
  value?: string | null,
): ValidationError | undefined => {
  if (!value || !value.trim()) return undefined;
  if (REVENUE_SHAPE.test(value.trim())) return undefined;
  return {
    message: "crm.validation.invalid_revenue",
    args: { _: "Enter an amount, e.g. 250000 or $1M" },
  };
};
