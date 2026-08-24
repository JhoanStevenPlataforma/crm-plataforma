import { describe, expect, test } from "vitest";

import {
  categorizeTimelineEvent,
  isDefaultVisible,
} from "./timelineEventCategory";

describe("categorizeTimelineEvent", () => {
  test("a note is communication", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "note.created",
        actor_kind: "user",
      }),
    ).toBe("communication");
  });

  test("a reminder delivery is communication", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "reminder.sent",
        actor_kind: "system",
      }),
    ).toBe("communication");
  });

  test("a comment is collaboration", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "comment.created",
        actor_kind: "user",
      }),
    ).toBe("collaboration");
  });

  test("a reassignment is collaboration, not a field edit", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "task.reassigned",
        actor_kind: "user",
      }),
    ).toBe("collaboration");
  });

  test("a deal stage change is a change, not system noise", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "deal.stage_changed",
        actor_kind: "user",
      }),
    ).toBe("changes");
  });

  test("a lifecycle transition is a change", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "task.completed",
        actor_kind: "user",
      }),
    ).toBe("changes");
  });

  test("a field edit is a change", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "task.priority_changed",
        actor_kind: "user",
      }),
    ).toBe("changes");
  });

  test("anything an automation did is system, whatever it touched", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "task.completed",
        actor_kind: "automation",
      }),
    ).toBe("system");
  });

  test("an unknown event type falls back to system rather than throwing", () => {
    expect(
      categorizeTimelineEvent({
        event_type: "something.new",
        actor_kind: "user",
      }),
    ).toBe("system");
  });
});

describe("isDefaultVisible", () => {
  test("shows communication by default", () => {
    expect(
      isDefaultVisible({ event_type: "note.created", actor_kind: "user" }),
    ).toBe(true);
  });

  test("shows collaboration by default", () => {
    expect(
      isDefaultVisible({ event_type: "comment.created", actor_kind: "user" }),
    ).toBe(true);
  });

  test("shows a lifecycle transition by default", () => {
    expect(
      isDefaultVisible({ event_type: "task.blocked", actor_kind: "user" }),
    ).toBe(true);
  });

  test("shows a system-caused unblock: the user needs to know it happened", () => {
    expect(
      isDefaultVisible({ event_type: "task.unblocked", actor_kind: "system" }),
    ).toBe(true);
  });

  test("collapses a field-level edit", () => {
    // Showing every column write next to a logged phone call is what makes an
    // audit feed unreadable (§6.4).
    expect(
      isDefaultVisible({
        event_type: "task.description_changed",
        actor_kind: "user",
      }),
    ).toBe(false);
  });

  test("collapses automation noise", () => {
    expect(
      isDefaultVisible({
        event_type: "automation.applied",
        actor_kind: "automation",
      }),
    ).toBe(false);
  });

  test("shows a deal stage change by default", () => {
    // On a deal, the move from one stage to the next is the story, and it is
    // the entry carrying the reason somebody typed on purpose. Collapsing it
    // behind "show all changes" would hide the one thing the dialog exists to
    // collect.
    expect(
      isDefaultVisible({
        event_type: "deal.stage_changed",
        actor_kind: "user",
      }),
    ).toBe(true);
  });
});
