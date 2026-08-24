import type {
  ReminderChannel,
  ReminderRecipients,
  ReminderScheduleKind,
  TaskReminder,
} from "../types";

/**
 * The reminder schedules offered in the UI (proposal §9.2).
 *
 * Users pick a preset, not an RRULE. The string is an implementation detail
 * that buys iCal export later (§9.2); asking a rep to type
 * `FREQ=WEEKLY;BYDAY=MO;BYHOUR=9` is how a feature goes unused. A free-form
 * escape hatch is not offered on purpose — every preset here maps onto the
 * subset `next_rrule_occurrence` actually implements, so anything the form can
 * produce is something the scheduler can fire.
 */
export type ReminderPresetKey =
  | "15_min_before"
  | "1_hour_before"
  | "1_day_before"
  | "1_week_before"
  | "1_hour_after"
  | "1_day_after"
  | "daily_9"
  | "weekly_monday_9"
  | "absolute";

export type ReminderPreset = {
  key: ReminderPresetKey;
  schedule_kind: ReminderScheduleKind;
  offset_minutes?: number;
  rrule?: string;
  /** True when the user must also supply a date (the `absolute` preset). */
  needsDate?: boolean;
};

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  {
    key: "15_min_before",
    schedule_kind: "relative_before_due",
    offset_minutes: 15,
  },
  {
    key: "1_hour_before",
    schedule_kind: "relative_before_due",
    offset_minutes: 60,
  },
  {
    key: "1_day_before",
    schedule_kind: "relative_before_due",
    offset_minutes: 1440,
  },
  {
    key: "1_week_before",
    schedule_kind: "relative_before_due",
    offset_minutes: 10080,
  },
  {
    key: "1_hour_after",
    schedule_kind: "relative_after_due",
    offset_minutes: 60,
  },
  {
    key: "1_day_after",
    schedule_kind: "relative_after_due",
    offset_minutes: 1440,
  },
  {
    key: "daily_9",
    schedule_kind: "recurring",
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
  },
  {
    key: "weekly_monday_9",
    schedule_kind: "recurring",
    rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
  },
  { key: "absolute", schedule_kind: "absolute", needsDate: true },
] as const;

export const findReminderPreset = (key: string): ReminderPreset | undefined =>
  REMINDER_PRESETS.find((preset) => preset.key === key);

/** What `TaskReminders` sends to the data provider. */
export type NewReminderInput = {
  taskId: TaskReminder["task_id"];
  presetKey: string;
  channels: ReminderChannel[];
  recipients?: ReminderRecipients;
  /** ISO string, required by the `absolute` preset and ignored by the others. */
  absoluteAt?: string | null;
  timezone?: string;
};

export type NewReminderPayload = {
  task_id: TaskReminder["task_id"];
  schedule_kind: ReminderScheduleKind;
  offset_minutes: number | null;
  rrule: string | null;
  absolute_at: string | null;
  channels: ReminderChannel[];
  recipients: ReminderRecipients;
  timezone: string;
};

/**
 * Turn a preset choice into the row the database expects.
 *
 * Returns `null` when the choice cannot produce a valid rule — an unknown
 * preset, no channel, or the `absolute` preset with no date. The caller shows
 * the error; building a half-filled row and letting the check constraint reject
 * it server-side would surface as an opaque 400 instead of a field message.
 */
export const buildReminderPayload = (
  input: NewReminderInput,
): NewReminderPayload | null => {
  const preset = findReminderPreset(input.presetKey);
  if (!preset) return null;
  if (input.channels.length === 0) return null;
  if (preset.needsDate && !input.absoluteAt) return null;

  return {
    task_id: input.taskId,
    schedule_kind: preset.schedule_kind,
    offset_minutes: preset.offset_minutes ?? null,
    rrule: preset.rrule ?? null,
    absolute_at: preset.needsDate ? (input.absoluteAt ?? null) : null,
    channels: input.channels,
    recipients: input.recipients ?? "owner",
    // The database stores the zone the rule was written in, so a recurring
    // "every day at 9" keeps meaning 9 in the author's morning rather than
    // drifting with the server's locale.
    timezone:
      input.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC",
  };
};

/**
 * The preset a stored reminder came from, for rendering it back as a label.
 *
 * Falls back to `undefined` for a rule written by an automation or by hand
 * through the API, which the UI renders from its raw fields instead of
 * pretending it was one of the presets.
 */
export const matchReminderPreset = (
  reminder: Pick<TaskReminder, "schedule_kind" | "offset_minutes" | "rrule">,
): ReminderPreset | undefined =>
  REMINDER_PRESETS.find((preset) => {
    if (preset.schedule_kind !== reminder.schedule_kind) return false;
    if (preset.schedule_kind === "recurring") {
      return preset.rrule === reminder.rrule;
    }
    if (preset.schedule_kind === "absolute") return true;
    return preset.offset_minutes === reminder.offset_minutes;
  });
