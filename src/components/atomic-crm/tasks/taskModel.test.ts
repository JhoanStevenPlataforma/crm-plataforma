import { describe, expect, test } from "vitest";

import type { TaskStatusKey } from "../types";
import {
  completionTarget,
  isPriorityWorthShowing,
  isStatusWorthShowing,
  QUICK_TRANSITIONS,
  requiresReason,
  STATUS_DOT_CLASS,
} from "./taskModel";

describe("priority display", () => {
  test("hides the default priority so it does not add noise to every row", () => {
    expect(isPriorityWorthShowing("normal")).toBe(false);
  });

  test("shows the priorities that carry information", () => {
    expect(isPriorityWorthShowing("urgent")).toBe(true);
    expect(isPriorityWorthShowing("high")).toBe(true);
    expect(isPriorityWorthShowing("low")).toBe(true);
  });

  test("tolerates a missing priority", () => {
    expect(isPriorityWorthShowing(undefined)).toBe(false);
  });
});

describe("status display", () => {
  test("hides pending and completed, which the row already conveys", () => {
    expect(isStatusWorthShowing("pending")).toBe(false);
    expect(isStatusWorthShowing("completed")).toBe(false);
  });

  test("shows the states a manager needs to spot without opening the task", () => {
    expect(isStatusWorthShowing("blocked")).toBe(true);
    expect(isStatusWorthShowing("waiting")).toBe(true);
    expect(isStatusWorthShowing("in_progress")).toBe(true);
    expect(isStatusWorthShowing("canceled")).toBe(true);
  });

  test("every lifecycle state has a dot colour", () => {
    const states: TaskStatusKey[] = [
      "pending",
      "scheduled",
      "in_progress",
      "waiting",
      "blocked",
      "rescheduled",
      "completed",
      "canceled",
      "archived",
    ];

    for (const state of states) {
      expect(STATUS_DOT_CLASS[state]).toBeTruthy();
    }
  });
});

describe("completionTarget", () => {
  test("checking a pending task completes it", () => {
    expect(completionTarget("pending")).toBe("completed");
  });

  test("un-checking REOPENS instead of blanking the completion (fixes W3)", () => {
    // The original code set `done_date = null`, destroying the record that the
    // task had ever been completed. Reopening is a transition, so the
    // completion event survives in the audit trail.
    expect(completionTarget("completed")).toBe("in_progress");
  });
});

describe("quick transitions", () => {
  test("never offers a move out of an archived task", () => {
    expect(QUICK_TRANSITIONS.archived).toEqual([]);
  });

  test("offers reopening from a terminal state", () => {
    expect(QUICK_TRANSITIONS.completed).toContain("in_progress");
    expect(QUICK_TRANSITIONS.canceled).toContain("pending");
  });

  test("never offers a task its own current state", () => {
    for (const [from, targets] of Object.entries(QUICK_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });

  test("cancellation always requires a reason", () => {
    expect(requiresReason("canceled")).toBe(true);
    expect(requiresReason("completed")).toBe(false);
  });
});
