import { addDays } from "date-fns/addDays";
import { endOfWeek } from "date-fns/endOfWeek";
import { startOfDay } from "date-fns/startOfDay";

/**
 * Server-side due-date buckets (proposal §1.5, §18.4).
 *
 * The due-date vocabulary — overdue / today / tomorrow / this week / later — is
 * the part of the original UX worth keeping. What changes is *where* it is
 * computed: `TasksListByDueDate` used to fetch up to 1000 rows and bucket them
 * in JavaScript with `date-fns`, which is a multi-megabyte payload at
 * enterprise volume and silently wrong past row 1000.
 *
 * These filters push the same buckets into Postgres. The "open" predicate is
 * expressed with the exact columns of the `tasks_owner_open_due` /
 * `tasks_overdue` partial indexes (§18.3) so the planner can still use them —
 * filtering on the view's derived `status_is_open` would not match the index
 * predicate.
 */
export type TaskBucketKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "this_week"
  | "later"
  | "no_due_date";

export const TASK_BUCKET_KEYS: TaskBucketKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "later",
  "no_due_date",
];

/**
 * "Still open work": not completed, not cancelled, not soft-deleted. Matches
 * the partial-index predicate exactly.
 */
export const OPEN_TASK_FILTER: Record<string, null> = {
  "completed_at@is": null,
  "canceled_at@is": null,
  "deleted_at@is": null,
};

export const buildBucketFilter = (
  bucket: TaskBucketKey,
  now: Date = new Date(),
): Record<string, unknown> => {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  // weekStartsOn: 0 keeps the original `tasksPredicate` semantics.
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

  switch (bucket) {
    case "overdue":
      return { ...OPEN_TASK_FILTER, "due_date@lt": today.toISOString() };
    case "today":
      return {
        ...OPEN_TASK_FILTER,
        "due_date@gte": today.toISOString(),
        "due_date@lt": tomorrow.toISOString(),
      };
    case "tomorrow":
      return {
        ...OPEN_TASK_FILTER,
        "due_date@gte": tomorrow.toISOString(),
        "due_date@lt": dayAfterTomorrow.toISOString(),
      };
    case "this_week":
      return {
        ...OPEN_TASK_FILTER,
        "due_date@gte": dayAfterTomorrow.toISOString(),
        "due_date@lte": weekEnd.toISOString(),
      };
    case "later":
      return { ...OPEN_TASK_FILTER, "due_date@gt": weekEnd.toISOString() };
    case "no_due_date":
      return { ...OPEN_TASK_FILTER, "due_date@is": null };
  }
};

/**
 * How long a completed task stays visible in its own section.
 *
 * The original list kept a just-checked task on screen for five minutes
 * (`isRecentlyDone`) so it did not vanish under the user's cursor. That grace
 * window was worth keeping, but it cannot be done by holding rows client-side
 * once the buckets are server-side. It becomes its own small query instead,
 * which is both cheaper and clearer: "esto es lo que acabas de cerrar".
 */
export const RECENTLY_DONE_WINDOW_MS = 5 * 60 * 1000;

export const buildRecentlyDoneFilter = (
  now: Date = new Date(),
): Record<string, unknown> => ({
  "deleted_at@is": null,
  "completed_at@gte": new Date(
    now.getTime() - RECENTLY_DONE_WINDOW_MS,
  ).toISOString(),
});

/**
 * `this_week` is empty by construction from Friday onwards (the day after
 * tomorrow is already past the end of the week), so the section is hidden
 * rather than rendered empty — the behaviour the original `isBeforeFriday`
 * guard produced.
 */
export const hasThisWeekBucket = (now: Date = new Date()): boolean =>
  addDays(startOfDay(now), 2).getTime() <=
  endOfWeek(now, { weekStartsOn: 0 }).getTime();
