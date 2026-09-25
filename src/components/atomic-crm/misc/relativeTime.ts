/**
 * "3 days ago", "tomorrow", "in 2 weeks" — the phrasing a panel row wants when
 * a full timestamp ("15/4/2026, 11:26:34 a. m.") would make the reader do the
 * arithmetic.
 *
 * Counted in CALENDAR days, not in 24-hour spans: something due at 09:00
 * tomorrow is "tomorrow" at 23:00 tonight, although it is only ten hours away.
 * The words come from `Intl.RelativeTimeFormat`, so they need no catalog entry.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfLocalDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Whole calendar days from `now` to `date`: negative in the past. */
export const calendarDaysBetween = (date: Date, now: Date): number =>
  Math.round((startOfLocalDay(date) - startOfLocalDay(now)) / DAY_MS);

export const formatRelativeDay = (
  date: Date,
  locale: string,
  now: Date = new Date(),
): string => {
  const days = calendarDaysBetween(date, now);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const size = Math.abs(days);

  if (size < 7) return format.format(days, "day");
  if (size < 30) return format.format(Math.trunc(days / 7), "week");
  if (size < 365) return format.format(Math.trunc(days / 30), "month");
  return format.format(Math.trunc(days / 365), "year");
};
