/**
 * Display helpers for the currency module. Formatting only: no figure is
 * computed here (conversion is `fxMath.ts`, mirroring the database).
 */

/** A rate as people read it: grouped, up to four decimals, never rounded away. */
export const formatRate = (
  rate: number | string | null | undefined,
  locale = "en-US",
): string => {
  if (rate == null || rate === "") return "—";
  const value = Number(rate);
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 6 : 4,
  });
};

/**
 * A calendar date (`YYYY-MM-DD`) in the reader's language. Formatted in UTC:
 * the value is a day, not an instant, and reading it in a timezone behind UTC
 * would print the day before.
 */
export const formatDay = (
  day: string | null | undefined,
  locale = "en-US",
): string => {
  if (!day) return "—";
  const time = Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(time)) return day;
  return new Date(time).toLocaleDateString(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/** An instant, to the minute, in the reader's own timezone. */
export const formatInstant = (
  instant: string | null | undefined,
  locale = "en-US",
): string => {
  if (!instant) return "—";
  const time = Date.parse(instant);
  if (Number.isNaN(time)) return instant;
  return new Date(time).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** A signed percentage with up to two decimals: `+2.5%`, `-0.13%`. */
export const formatPercentDiff = (
  value: number | null | undefined,
  locale = "en-US",
): string => {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const text = Math.abs(number).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${text}%`;
};

/**
 * Today as `YYYY-MM-DD`, on the SERVER's calendar: the database's
 * `current_date`, which is UTC. `fx_resolve_rate()`, `fx_rate_is_stale()` and
 * the issue gate all reason on that day, so every screen that dates a rate or
 * judges one stale must use it too. The reader's own calendar is a day behind
 * it every evening west of Greenwich (from 19:00 in Bogota): a rate typed in
 * then and dated locally was dated the day BEFORE the server's current rate
 * and never became current, and the stale badge contradicted the issue gate.
 */
export const serverToday = (): string => new Date().toISOString().slice(0, 10);
