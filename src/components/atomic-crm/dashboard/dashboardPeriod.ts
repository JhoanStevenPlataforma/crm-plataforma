import { endOfMonth } from "date-fns/endOfMonth";
import { endOfQuarter } from "date-fns/endOfQuarter";
import { endOfWeek } from "date-fns/endOfWeek";
import { endOfYear } from "date-fns/endOfYear";
import { startOfMonth } from "date-fns/startOfMonth";
import { startOfQuarter } from "date-fns/startOfQuarter";
import { startOfWeek } from "date-fns/startOfWeek";
import { startOfYear } from "date-fns/startOfYear";

/**
 * The dashboard's period selector, and the only place its ranges are computed.
 *
 * Separate from `analytics/analyticsFilters.ts` on purpose. That module offers
 * trailing windows (last 3 / 6 / 12 months) because a trend chart needs enough
 * points to have a shape. This one offers *calendar* periods — today, this
 * week, this month, this quarter, this year — because the dashboard answers
 * "how are we doing right now", and "this quarter" is the unit a commercial
 * team is actually measured on. Merging the two lists would put "last 6 months"
 * in front of someone asking about today, and "today" in front of a trend chart
 * that would then draw a single bar.
 *
 * Only the period NAME goes in the URL, not the resolved dates: a link shared
 * today and opened next week should show that reader's week, not a frozen one.
 * That is the opposite of the analytics module's choice, which writes the dates
 * out explicitly — there, a shared link is a shared *analysis* and must not
 * slide. Here it is a shared *screen*.
 *
 * Everything is pure and date-injectable, so the tests do not depend on the day
 * they run.
 */

export const DASHBOARD_PERIODS = [
  "today",
  "this_week",
  "this_month",
  "this_quarter",
  "this_year",
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/**
 * A month. Short enough that the figures describe the current push, long enough
 * that a quiet Tuesday does not read as a collapse.
 */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = "this_month";

/** The query-string key. */
export const DASHBOARD_PERIOD_PARAM = "period";

/** `Date` -> `YYYY-MM-DD`, in local time — the same day the user picked. */
const toIsoDay = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * The week starts on Monday.
 *
 * `date-fns` defaults to Sunday, which would put the weekend at the *start* of
 * "this week" and make Monday morning report two idle days as the period's
 * opening. Every locale this CRM ships (en, fr, es) treats the working week as
 * Monday to Friday.
 */
const WEEK_STARTS_ON = 1 as const;

export const rangeForDashboardPeriod = (
  period: DashboardPeriod,
  today: Date = new Date(),
): { from: string; to: string } => {
  switch (period) {
    case "today":
      return { from: toIsoDay(today), to: toIsoDay(today) };
    case "this_week":
      return {
        from: toIsoDay(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON })),
        to: toIsoDay(endOfWeek(today, { weekStartsOn: WEEK_STARTS_ON })),
      };
    case "this_quarter":
      return {
        from: toIsoDay(startOfQuarter(today)),
        to: toIsoDay(endOfQuarter(today)),
      };
    case "this_year":
      return {
        from: toIsoDay(startOfYear(today)),
        to: toIsoDay(endOfYear(today)),
      };
    case "this_month":
    default:
      return {
        from: toIsoDay(startOfMonth(today)),
        to: toIsoDay(endOfMonth(today)),
      };
  }
};

/**
 * Read the period out of the query string.
 *
 * Anything unrecognised falls back to the default rather than throwing: a
 * hand-edited or stale link should show the default dashboard, not an error
 * page. This is the module's only untrusted input, and the value reaches SQL
 * parameters through `rangeForDashboardPeriod`, so the whitelist is the
 * validation.
 */
export const parseDashboardPeriod = (value: string | null): DashboardPeriod =>
  DASHBOARD_PERIODS.includes(value as DashboardPeriod)
    ? (value as DashboardPeriod)
    : DEFAULT_DASHBOARD_PERIOD;

/**
 * Which greeting the time of day calls for.
 *
 * Here rather than in the component because it is a rule, not markup, and
 * because a component that reads the clock cannot be tested without freezing
 * it. Boundaries at 06:00 / 12:00 / 20:00: "good evening" at 18:00 is wrong in
 * the Spanish-speaking markets this CRM is aimed at, where the afternoon runs
 * well past it.
 */
export type Greeting = "morning" | "afternoon" | "evening";

export const greetingFor = (now: Date = new Date()): Greeting => {
  const hour = now.getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 20) return "afternoon";
  return "evening";
};
