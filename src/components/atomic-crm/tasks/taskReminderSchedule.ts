import type { TaskReminder } from "../types";

/**
 * Demo-mode stand-in for `public.compute_reminder_next_fire` (proposal §9).
 *
 * The database is authoritative: in the real backend this arithmetic happens in
 * a trigger, and nothing the client computes is trusted. This exists so demo
 * mode shows a plausible "next: Monday 09:00" instead of a blank, matching the
 * parity the other FakeRest callbacks keep.
 *
 * The RRULE support is narrower than the SQL one on purpose — it covers FREQ,
 * BYDAY, BYHOUR and BYMINUTE, which is every rule the preset picker can emit.
 * A rule outside that set returns null rather than guessing, so the demo never
 * shows a fire time the real scheduler would disagree with.
 */

export type ReminderScheduleFields = Pick<
  TaskReminder,
  "schedule_kind" | "offset_minutes" | "rrule" | "absolute_at" | "until_at"
>;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const parseRrule = (rrule: string): Map<string, string> => {
  const parts = new Map<string, string>();
  for (const chunk of rrule.toUpperCase().replace(/\s/g, "").split(";")) {
    const [key, value] = chunk.split("=");
    if (key && value) parts.set(key, value);
  }
  return parts;
};

/**
 * The next occurrence of a recurring rule strictly after `after`.
 *
 * Walks day by day (capped at a year) and takes the first BYHOUR/BYMINUTE slot
 * that lands in the future — the same shape as the SQL walk, so the two agree
 * on the rules both understand.
 */
const nextRecurrence = (rrule: string, after: Date): Date | null => {
  const parts = parseRrule(rrule);
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY") return null;

  const hours = (parts.get("BYHOUR") ?? "9").split(",").map(Number);
  const minutes = (parts.get("BYMINUTE") ?? "0").split(",").map(Number);
  const days = parts.get("BYDAY")?.split(",");

  for (let offset = 0; offset <= 366; offset += 1) {
    const day = new Date(after.getTime() + offset * DAY_MS);

    if (freq === "WEEKLY" && days) {
      if (!days.includes(WEEKDAYS[day.getDay()])) continue;
    }

    for (const hour of [...hours].sort((a, b) => a - b)) {
      for (const minute of [...minutes].sort((a, b) => a - b)) {
        const candidate = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          hour,
          minute,
          0,
          0,
        );
        if (candidate.getTime() > after.getTime()) return candidate;
      }
    }
  }

  return null;
};

/**
 * When does this rule fire next? `null` means "never again", which is what
 * deactivates the reminder.
 *
 * `firedCount` matters: a one-shot that already fired must not fire twice, the
 * same rule the SQL applies.
 */
export const computeNextFireAt = (
  reminder: ReminderScheduleFields,
  dueDate: string | null | undefined,
  now: Date = new Date(),
  firedCount = 0,
): string | null => {
  let next: Date | null = null;

  if (reminder.schedule_kind === "absolute") {
    if (firedCount === 0 && reminder.absolute_at) {
      next = new Date(reminder.absolute_at);
    }
  } else if (
    reminder.schedule_kind === "relative_before_due" ||
    reminder.schedule_kind === "relative_after_due"
  ) {
    if (!dueDate || firedCount > 0) return null;
    const due = new Date(dueDate).getTime();
    const offset = (reminder.offset_minutes ?? 0) * MINUTE_MS;

    if (reminder.schedule_kind === "relative_before_due") {
      const candidate = new Date(due - offset);
      // "One hour before" a due date already in the past is noise, not a
      // reminder: dropped rather than fired late.
      next = candidate.getTime() > now.getTime() ? candidate : null;
    } else {
      // The chase reminder is the opposite: a due date that slipped fires on
      // the next tick.
      next = new Date(due + offset);
    }
  } else if (reminder.schedule_kind === "recurring" && reminder.rrule) {
    next = nextRecurrence(reminder.rrule, now);
  }

  if (!next) return null;
  if (
    reminder.until_at &&
    next.getTime() > new Date(reminder.until_at).getTime()
  ) {
    return null;
  }

  return next.toISOString();
};
