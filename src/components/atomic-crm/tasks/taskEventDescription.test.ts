import { describe, expect, test } from "vitest";

import type { TaskEvent } from "../types";
import {
  describeTaskEvent,
  formatEventValue,
  isHumanEvent,
  rescheduleDeltaDays,
} from "./taskEventDescription";

const buildEvent = (overrides: Partial<TaskEvent> = {}): TaskEvent => ({
  id: 1,
  task_id: 10,
  event_type: "task.created",
  occurred_at: "2026-08-03T14:22:10.000Z",
  actor_sales_id: 5,
  actor_kind: "user",
  seq: 1,
  metadata: {},
  ...overrides,
});

describe("formatEventValue", () => {
  test("passes strings through untouched so the component can localise dates", () => {
    expect(formatEventValue("2026-08-10T09:00:00.000Z")).toBe(
      "2026-08-10T09:00:00.000Z",
    );
  });

  test("renders numbers and booleans", () => {
    expect(formatEventValue(3)).toBe("3");
    expect(formatEventValue(false)).toBe("false");
  });

  test("treats null and undefined as no value", () => {
    expect(formatEventValue(null)).toBeUndefined();
    expect(formatEventValue(undefined)).toBeUndefined();
  });
});

describe("describeTaskEvent", () => {
  test("unwraps a field change out of its jsonb envelope", () => {
    const event = buildEvent({
      event_type: "task.rescheduled",
      field: "due_date",
      old_value: { due_date: "2026-08-03T09:00:00.000Z" },
      new_value: { due_date: "2026-08-10T09:00:00.000Z" },
    });

    expect(describeTaskEvent(event)).toMatchObject({
      key: "task.rescheduled",
      from: "2026-08-03T09:00:00.000Z",
      to: "2026-08-10T09:00:00.000Z",
      isBare: false,
    });
  });

  test("prefers the readable status keys over the raw status ids", () => {
    const event = buildEvent({
      event_type: "task.completed",
      field: "status_id",
      old_value: { status_id: 3 },
      new_value: { status_id: 7 },
      metadata: { from_status: "in_progress", to_status: "completed" },
    });

    const described = describeTaskEvent(event);

    expect(described.from).toBe("in_progress");
    expect(described.to).toBe("completed");
  });

  test("surfaces the reason a transition required", () => {
    const event = buildEvent({
      event_type: "task.canceled",
      metadata: {
        from_status: "in_progress",
        to_status: "canceled",
        reason: "el cliente canceló el proyecto",
      },
    });

    expect(describeTaskEvent(event).reason).toBe(
      "el cliente canceló el proyecto",
    );
  });

  test("falls back to the free-text note when there is no reason", () => {
    const event = buildEvent({ note: "importado desde el CRM anterior" });

    expect(describeTaskEvent(event).reason).toBe(
      "importado desde el CRM anterior",
    );
  });

  test("marks an event with no values as bare, so the UI shows only its name", () => {
    expect(describeTaskEvent(buildEvent()).isBare).toBe(true);
  });

  test("does not invent values when the field is missing from the payload", () => {
    const event = buildEvent({
      field: "title",
      old_value: { description: "something else" },
      new_value: { description: "something else" },
    });

    const described = describeTaskEvent(event);

    expect(described.from).toBeUndefined();
    expect(described.to).toBeUndefined();
  });
});

describe("rescheduleDeltaDays", () => {
  test("converts the delta the database records into whole days", () => {
    const event = buildEvent({
      event_type: "task.rescheduled",
      metadata: { delta_seconds: 604800 },
    });

    expect(rescheduleDeltaDays(event)).toBe(7);
  });

  test("handles a task pulled forward", () => {
    const event = buildEvent({
      event_type: "task.rescheduled",
      metadata: { delta_seconds: -172800 },
    });

    expect(rescheduleDeltaDays(event)).toBe(-2);
  });

  test("returns undefined when there is no delta", () => {
    expect(rescheduleDeltaDays(buildEvent())).toBeUndefined();
  });
});

describe("isHumanEvent", () => {
  test("separates people from the system and automations", () => {
    expect(isHumanEvent(buildEvent({ actor_kind: "user" }))).toBe(true);
    expect(isHumanEvent(buildEvent({ actor_kind: "system" }))).toBe(false);
    expect(isHumanEvent(buildEvent({ actor_kind: "automation" }))).toBe(false);
    expect(isHumanEvent(buildEvent({ actor_kind: "import" }))).toBe(false);
  });
});
