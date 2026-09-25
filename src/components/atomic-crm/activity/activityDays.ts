/**
 * Day grouping for the activity feed.
 *
 * A feed of twenty rows each carrying "14/9/2026 8:22" makes the reader parse
 * every date to find where yesterday ends. Grouped under "Today", "Yesterday",
 * "Monday, 14 September", each row only needs its time.
 */

/** Local calendar day, `YYYY-MM-DD`: the group key. */
export const localDayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const startOfLocalDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today" / "Yesterday" through `Intl.RelativeTimeFormat`, so the words come
 * from the locale and need no catalog entry; older days get the weekday and
 * date, with the year only when it is not the current one.
 */
export const formatDayLabel = (
  date: Date,
  locale: string,
  now: Date = new Date(),
): string => {
  const diffDays = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / DAY_MS,
  );
  if (diffDays === 0 || diffDays === 1) {
    const label = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(-diffDays, "day");
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  }
  const label = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
};

export const formatTimeOfDay = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

export interface DayGroup<T> {
  key: string;
  date: Date;
  items: T[];
}

/**
 * Consecutive items sharing a local day, in the order given. The feed is
 * already sorted newest first; grouping must not re-sort it, or a page loaded
 * with "load more" would shuffle what the reader already saw.
 */
export const groupByDay = <T>(
  items: readonly T[],
  getDate: (item: T) => string,
): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const date = new Date(getDate(item));
    const key = localDayKey(date);
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, date, items: [item] });
    }
  }
  return groups;
};
