import { endOfMonth } from "date-fns/endOfMonth";
import { startOfMonth } from "date-fns/startOfMonth";
import { startOfYear } from "date-fns/startOfYear";
import { subMonths } from "date-fns/subMonths";

/**
 * The analytics filter state, and the only place it is parsed.
 *
 * It lives in the URL query string rather than in a context or the react-admin
 * store, for three reasons: a dashboard is something people send each other, so
 * the link has to carry what the sender was looking at; a reload must not reset
 * a manager's analysis; and the browser back button then works as an undo for
 * filter changes.
 *
 * Everything here is pure and date-injectable, so the tests do not depend on
 * the day they run.
 */
export interface AnalyticsFilters {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to: string;
  /** Owner filter. Only ever set by an admin or a manager — for a rep the
   * control is not rendered, because RLS already restricts them to their own
   * rows and a control that changes nothing is worse than no control. */
  salesId: number | null;
  /** Deals only. Tasks have no team column, so the Productivity tab does not
   * offer this. */
  teamId: number | null;
}

export const ANALYTICS_PRESETS = [
  "this_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "this_year",
] as const;

export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];

/**
 * Six months, matching the window `DealsChart` has always used.
 *
 * A quarter would make this a forecasting tool rather than a trend tool. The
 * choice is a product decision, and it is made in exactly one place because
 * every card inherits it.
 */
export const DEFAULT_PRESET: AnalyticsPreset = "last_6_months";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `Date` -> `YYYY-MM-DD`, in local time — the same day the user picked. */
const toIsoDay = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * A range always starts at a month boundary and ends at one.
 *
 * Half a month at each end makes the first and last bars of every monthly chart
 * shorter than the others for a reason the axis does not show, which reads as a
 * drop in the business rather than a truncated bucket.
 */
export const rangeForPreset = (
  preset: AnalyticsPreset,
  today: Date = new Date(),
): { from: string; to: string } => {
  const end = toIsoDay(endOfMonth(today));

  switch (preset) {
    case "this_month":
      return { from: toIsoDay(startOfMonth(today)), to: end };
    case "last_3_months":
      return { from: toIsoDay(startOfMonth(subMonths(today, 2))), to: end };
    case "last_12_months":
      return { from: toIsoDay(startOfMonth(subMonths(today, 11))), to: end };
    case "this_year":
      return { from: toIsoDay(startOfYear(today)), to: end };
    case "last_6_months":
    default:
      return { from: toIsoDay(startOfMonth(subMonths(today, 5))), to: end };
  }
};

export const defaultAnalyticsFilters = (
  today: Date = new Date(),
): AnalyticsFilters => ({
  ...rangeForPreset(DEFAULT_PRESET, today),
  salesId: null,
  teamId: null,
});

/** A real calendar day, not merely something shaped like one. */
const isValidDay = (value: string | null): value is string => {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && toIsoDay(parsed) === value;
};

const parseId = (value: string | null): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Read the filters out of a query string.
 *
 * Validation happens HERE and nowhere else, because this is the module's only
 * untrusted input surface — a hand-edited URL reaches SQL parameters otherwise.
 * Anything malformed falls back to the default rather than throwing: a bad link
 * should show the default dashboard, not an error page.
 */
export const parseAnalyticsFilters = (
  search: URLSearchParams,
  today: Date = new Date(),
): AnalyticsFilters => {
  const fallback = defaultAnalyticsFilters(today);
  const from = search.get("from");
  const to = search.get("to");

  // Both ends must be valid AND ordered. A reversed range is not an empty
  // dashboard, it is a typo, and every chart would render "no data" for it.
  const hasRange = isValidDay(from) && isValidDay(to) && from <= to;

  return {
    from: hasRange ? from : fallback.from,
    to: hasRange ? to : fallback.to,
    salesId: parseId(search.get("sales_id")),
    teamId: parseId(search.get("team_id")),
  };
};

/**
 * The inverse, kept next to the parser so the two cannot drift.
 *
 * The default range is written out explicitly rather than omitted: a link
 * shared today must still show the same six months when it is opened next
 * month, and an implicit "last 6 months" would silently slide.
 */
export const analyticsFiltersToSearch = (
  filters: AnalyticsFilters,
): URLSearchParams => {
  const search = new URLSearchParams();
  search.set("from", filters.from);
  search.set("to", filters.to);
  if (filters.salesId != null) search.set("sales_id", String(filters.salesId));
  if (filters.teamId != null) search.set("team_id", String(filters.teamId));
  return search;
};

/** Which preset the current range corresponds to, or null for a custom one. */
export const presetOf = (
  filters: AnalyticsFilters,
  today: Date = new Date(),
): AnalyticsPreset | null =>
  ANALYTICS_PRESETS.find((preset) => {
    const range = rangeForPreset(preset, today);
    return range.from === filters.from && range.to === filters.to;
  }) ?? null;

/** The parameters every deal and task RPC takes, derived once. */
export const rangeParams = (
  filters: AnalyticsFilters,
): { p_from: string; p_to: string } => ({
  p_from: filters.from,
  p_to: filters.to,
});
