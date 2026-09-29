/**
 * The week starts on Monday, everywhere a screen says "this week".
 *
 * `date-fns` defaults to Sunday, which puts the weekend at the start of the
 * week. Every locale this CRM ships (en, es, fr) works Monday to Friday, and
 * the calendar, the dashboard and the task list must agree on where the week
 * ends or the same task is "this week" on one screen and "later" on another.
 */
export const WEEK_OPTIONS = { weekStartsOn: 1 } as const;
