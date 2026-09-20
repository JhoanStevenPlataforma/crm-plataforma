/**
 * How often the customer's page asks whether its quotation changed
 * (docs/proposals/quotes-cpq-module.md §6.5, D2).
 *
 * Ten seconds is the honest latency of "the rep answered while you were
 * reading": the page has no socket to be told sooner, because Realtime honours
 * row level security and no policy grants `anon`. After a run of failures the
 * page slows to once a minute and says so, and after a longer one it stops and
 * leaves the next check to the customer — a page retrying forever against a
 * server that is down is a page nobody can reason about.
 *
 * Its own module so that a test can run the real loop on a faster clock.
 */

export const POLL_INTERVAL_MS = 10_000;

export const BACKOFF_INTERVAL_MS = 60_000;

/** Consecutive failed checks before the page slows down, and says so. */
export const BACKOFF_AFTER_FAILURES = 3;

/** Consecutive failed checks before the page stops asking on its own. */
export const GIVE_UP_AFTER_FAILURES = 6;

/** The wait before the next check, or null once the page has stopped asking. */
export const nextPollDelay = (failures: number): number | null => {
  if (failures >= GIVE_UP_AFTER_FAILURES) return null;
  return failures >= BACKOFF_AFTER_FAILURES
    ? BACKOFF_INTERVAL_MS
    : POLL_INTERVAL_MS;
};
