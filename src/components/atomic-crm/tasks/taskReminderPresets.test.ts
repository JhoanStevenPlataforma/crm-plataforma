import { describe, expect, test } from "vitest";

import {
  buildReminderPayload,
  matchReminderPreset,
  REMINDER_PRESETS,
} from "./taskReminderPresets";

describe("buildReminderPayload", () => {
  test("turns a relative preset into an offset in minutes", () => {
    // Arrange / Act
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "1_day_before",
      channels: ["in_app"],
      timezone: "Europe/Madrid",
    });

    // Assert
    expect(payload).toMatchObject({
      task_id: 7,
      schedule_kind: "relative_before_due",
      offset_minutes: 1440,
      rrule: null,
      absolute_at: null,
      recipients: "owner",
      timezone: "Europe/Madrid",
    });
  });

  test("turns a recurring preset into an rrule and no offset", () => {
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "weekly_monday_9",
      channels: ["in_app", "email"],
      timezone: "UTC",
    });

    expect(payload).toMatchObject({
      schedule_kind: "recurring",
      rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
      offset_minutes: null,
      channels: ["in_app", "email"],
    });
  });

  test("carries the date through for the absolute preset", () => {
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "absolute",
      channels: ["in_app"],
      absoluteAt: "2026-09-01T08:00:00.000Z",
      timezone: "UTC",
    });

    expect(payload).toMatchObject({
      schedule_kind: "absolute",
      absolute_at: "2026-09-01T08:00:00.000Z",
      offset_minutes: null,
      rrule: null,
    });
  });

  test("returns null when the absolute preset has no date", () => {
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "absolute",
      channels: ["in_app"],
      timezone: "UTC",
    });

    expect(payload).toBeNull();
  });

  test("returns null when no channel is selected", () => {
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "1_hour_before",
      channels: [],
      timezone: "UTC",
    });

    expect(payload).toBeNull();
  });

  test("returns null for an unknown preset", () => {
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "whenever",
      channels: ["in_app"],
      timezone: "UTC",
    });

    expect(payload).toBeNull();
  });

  test("defaults the recipients to the owner", () => {
    const payload = buildReminderPayload({
      taskId: 7,
      presetKey: "1_hour_before",
      channels: ["in_app"],
      timezone: "UTC",
    });

    expect(payload?.recipients).toBe("owner");
  });
});

describe("matchReminderPreset", () => {
  test("recognises a stored relative rule", () => {
    const preset = matchReminderPreset({
      schedule_kind: "relative_before_due",
      offset_minutes: 60,
      rrule: null,
    });

    expect(preset?.key).toBe("1_hour_before");
  });

  test("recognises a stored recurring rule by its rrule", () => {
    const preset = matchReminderPreset({
      schedule_kind: "recurring",
      offset_minutes: null,
      rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
    });

    expect(preset?.key).toBe("daily_9");
  });

  test("returns undefined for a rule the UI cannot express", () => {
    const preset = matchReminderPreset({
      schedule_kind: "recurring",
      offset_minutes: null,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    });

    expect(preset).toBeUndefined();
  });

  test("returns undefined for an offset no preset offers", () => {
    const preset = matchReminderPreset({
      schedule_kind: "relative_before_due",
      offset_minutes: 37,
      rrule: null,
    });

    expect(preset).toBeUndefined();
  });
});

describe("REMINDER_PRESETS", () => {
  test("every preset carries exactly the field its schedule kind needs", () => {
    for (const preset of REMINDER_PRESETS) {
      if (preset.schedule_kind === "recurring") {
        expect(preset.rrule, preset.key).toBeTruthy();
        expect(preset.offset_minutes, preset.key).toBeUndefined();
      } else if (preset.schedule_kind === "absolute") {
        expect(preset.needsDate, preset.key).toBe(true);
      } else {
        expect(preset.offset_minutes, preset.key).toBeGreaterThan(0);
        expect(preset.rrule, preset.key).toBeUndefined();
      }
    }
  });

  test("preset keys are unique", () => {
    const keys = REMINDER_PRESETS.map((preset) => preset.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
