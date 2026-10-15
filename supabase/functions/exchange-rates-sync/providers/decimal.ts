const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * A number from a JSON payload as the exact decimal string the source printed,
 * or null. Kept as a string so no JavaScript float rounds it on the way to a
 * `numeric` column. Validation proper is `fx_record_rates()`'s, which records
 * every refusal on the run with its reason.
 */
export const decimalString = (value: unknown): string | null => {
  if (typeof value === "string" && DECIMAL.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // JSON numbers print in their shortest round-trip form: the figure sent.
    const printed = String(value);
    return DECIMAL.test(printed) ? printed : null;
  }
  return null;
};
