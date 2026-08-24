import { addDays } from "date-fns/addDays";
import { isValid } from "date-fns/isValid";
import { set } from "date-fns/set";
import { startOfDay } from "date-fns/startOfDay";

export type PostponePreset = "tomorrow" | "next_week";

const PRESET_DAYS: Record<PostponePreset, number> = {
  tomorrow: 1,
  next_week: 7,
};

/**
 * Compute the new due date of a postponed task.
 *
 * The original implementation was `new Date(Date.now() + 24h).toISOString().slice(0, 10)`,
 * which had three defects at once (proposal §1.3 W4):
 *
 *  1. `.slice(0, 10)` dropped the time on a `timestamptz` column, so a task due
 *     tomorrow at 10:30 silently became tomorrow at 00:00.
 *  2. It counted from *now* rather than from the task's own schedule, so the
 *     time of day was lost even when the date was right.
 *  3. Nothing recorded that a postponement had happened — that part is now
 *     fixed in the database, which emits `task.rescheduled` and increments
 *     `reschedule_count` on any due-date change.
 *
 * The rule implemented here: the target *day* is relative to today (that is
 * what "tomorrow" and "next week" mean to a user, including for an already
 * overdue task), and the *time of day* is carried over from the current due
 * date so a 09:00 call stays a 09:00 call.
 */
export const postponeDueDate = (
  dueDate: string | Date | null | undefined,
  preset: PostponePreset,
  now: Date = new Date(),
): string => {
  const source = dueDate ? new Date(dueDate) : now;
  const timeSource = isValid(source) ? source : now;

  const target = addDays(startOfDay(now), PRESET_DAYS[preset]);

  return set(target, {
    hours: timeSource.getHours(),
    minutes: timeSource.getMinutes(),
    seconds: 0,
    milliseconds: 0,
  }).toISOString();
};
