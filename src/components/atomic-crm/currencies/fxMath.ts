/**
 * Currency conversion, in the browser (docs/proposals/multi-currency-fx.md).
 *
 * THE SERVER OWNS EVERY CONVERTED FIGURE. `quote_lines_fx_convert` computes a
 * converted `unit_price`, and `refresh_quote_version_totals()` the base
 * equivalents; nothing here is written back. This module exists so the editor
 * can show what the save WILL produce, and like `quotes/quoteMath.ts` its one
 * requirement is to agree with Postgres digit for digit.
 *
 * The rate convention is the database's: `rate` = units of the BASE currency
 * per ONE unit of the currency. Converting X to Y is `amount * rate_X / rate_Y`.
 *
 * Rates carry ten decimals (`numeric(20,10)`), so the arithmetic runs on
 * BigInt: a price in cents times a rate in 1e-10 units overflows the 2^53 a
 * float holds exactly long before it overflows a peso. The quotient is rounded
 * exactly (half away from zero, as `round(numeric, int)` does). Postgres
 * rounds a numeric division to at least 16 significant digits before the final
 * `round()`, so a quotient within 1e-16 of a half cent could round differently
 * there; no realistic price and rate pair lands on that.
 */

const RATE_DECIMALS = 10;
const MONEY_DECIMALS = 2;

const pow10 = (exponent: number): bigint => 10n ** BigInt(exponent);

/**
 * A decimal to an integer at `decimals` places, rounded half away from zero
 * the way a `numeric(p, decimals)` column stores it. Accepts the number
 * PostgREST returns or the string a form holds.
 */
export const toScaled = (
  value: number | string | null | undefined,
  decimals: number,
): bigint => {
  if (value === null || value === undefined || value === "") return 0n;
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? value.toFixed(Math.min(decimals + 2, 20))
        : "0"
      : value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return 0n;
  const [, sign, whole = "", fraction = ""] = match;
  const padded = (fraction + "0".repeat(decimals + 1)).slice(0, decimals + 1);
  const raw = BigInt((whole || "0") + padded);
  // One extra digit, then half away from zero.
  const rounded = (raw + 5n) / 10n;
  return sign === "-" ? -rounded : rounded;
};

/** Half away from zero for a non-negative quotient. */
const divideRounded = (numerator: bigint, denominator: bigint): bigint =>
  (2n * numerator + denominator) / (2n * denominator);

const fromScaled = (value: bigint, decimals: number): number =>
  Number(value) / 10 ** decimals;

/** The decimals an amount in `currencyDecimals` is rounded to: capped at 2. */
const effectiveDecimals = (currencyDecimals: number | null | undefined) =>
  Math.max(0, Math.min(currencyDecimals ?? MONEY_DECIMALS, MONEY_DECIMALS));

/**
 * A price from a list in one currency, in another:
 * `round(source * sourceRate / targetRate, least(decimals, 2))` --
 * `quote_lines_fx_convert`, exactly.
 */
export const convertPrice = (
  sourcePrice: number | string,
  sourceRate: number | string,
  targetRate: number | string,
  targetDecimals?: number | null,
): number => {
  const cents = toScaled(sourcePrice, MONEY_DECIMALS);
  const from = toScaled(sourceRate, RATE_DECIMALS);
  const to = toScaled(targetRate, RATE_DECIMALS);
  if (to <= 0n || from <= 0n || cents < 0n) return 0;

  const step = pow10(MONEY_DECIMALS - effectiveDecimals(targetDecimals));
  // cents × from / to, expressed in units of `step` cents, rounded once.
  const units = divideRounded(cents * from, to * step);
  return fromScaled(units * step, MONEY_DECIMALS);
};

/**
 * A total in the quotation's currency, in the base:
 * `round(total * rate, least(baseDecimals, 2))` -- what
 * `refresh_quote_version_totals()` writes into `*_base`.
 */
export const toBase = (
  amount: number | string,
  rate: number | string,
  baseDecimals?: number | null,
): number => {
  const cents = toScaled(amount, MONEY_DECIMALS);
  const scaledRate = toScaled(rate, RATE_DECIMALS);
  if (scaledRate <= 0n || cents < 0n) return 0;

  const step = pow10(MONEY_DECIMALS - effectiveDecimals(baseDecimals));
  const units = divideRounded(cents * scaledRate, pow10(RATE_DECIMALS) * step);
  return fromScaled(units * step, MONEY_DECIMALS);
};

/** Whole calendar days from one ISO day to another (`date - date` in SQL). */
const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

/**
 * Whether a rate is stale on a day -- `fx_rate_is_stale()`, THE rule, which the
 * resolver, the view and the issue gate apply on the server, mirrored here for
 * the screens and the demo backend:
 *
 *   official with a validity the source states (the TRM covers weekends and
 *   holidays): stale once `validUntil` has passed; official with none (the
 *   ECB): stale once older than `staleAfterDays` calendar days; commercial:
 *   stale once its expiry has passed; custom and base: never.
 *
 * Days are ISO strings (`YYYY-MM-DD`), so they compare as text.
 */
export const rateIsStale = ({
  kind,
  effectiveDate,
  validUntil,
  on,
  staleAfterDays,
}: {
  kind: string | null | undefined;
  effectiveDate: string | null | undefined;
  validUntil: string | null | undefined;
  on: string;
  staleAfterDays: number | null | undefined;
}): boolean => {
  if (kind === "official") {
    if (validUntil != null) return validUntil < on;
    if (effectiveDate == null) return false;
    return daysBetween(effectiveDate, on) > (staleAfterDays ?? 3);
  }
  if (kind === "commercial") return validUntil != null && validUntil < on;
  return false;
};

/**
 * How far a rate is from a reference, in percent: what the rep's tolerance
 * is measured on (`set_quote_version_rate()` compares the same figure).
 */
export const deviationPercent = (
  rate: number,
  reference: number,
): number | null =>
  reference > 0 && Number.isFinite(rate)
    ? Math.abs(rate / reference - 1) * 100
    : null;
