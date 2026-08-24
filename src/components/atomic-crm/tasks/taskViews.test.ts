import { describe, expect, it } from "vitest";

import { KANBAN_COLUMNS, parseTaskView, resolveKanbanDrop } from "./taskViews";

describe("parseTaskView", () => {
  it("reads the view from the URL", () => {
    expect(parseTaskView("kanban")).toBe("kanban");
    expect(parseTaskView("calendar")).toBe("calendar");
  });

  it("falls back to the list for an absent or unknown value", () => {
    // A hand-edited or stale URL must still render something usable.
    expect(parseTaskView(null)).toBe("list");
    expect(parseTaskView("gantt")).toBe("list");
  });
});

describe("KANBAN_COLUMNS", () => {
  it("excludes the states a drag cannot legally produce", () => {
    // Cancelling requires a reason (§4.4) and a drag has none to give, so a
    // `canceled` column would be a drop target that always fails.
    expect(KANBAN_COLUMNS).not.toContain("canceled");
    expect(KANBAN_COLUMNS).not.toContain("archived");
  });

  it("keeps completed as a drop target, since closing work is the point", () => {
    expect(KANBAN_COLUMNS).toContain("completed");
  });
});

describe("resolveKanbanDrop", () => {
  it("turns a cross-column drop into a transition to that column's status", () => {
    expect(
      resolveKanbanDrop({
        draggableId: "42",
        source: { droppableId: "pending" },
        destination: { droppableId: "in_progress" },
      }),
    ).toEqual({ taskId: 42, to: "in_progress" });
  });

  it("writes nothing when the card is released outside a column", () => {
    // A cancelled gesture that emitted an audit event would be a lie in the
    // timeline.
    expect(
      resolveKanbanDrop({
        draggableId: "42",
        source: { droppableId: "pending" },
        destination: null,
      }),
    ).toBeNull();
  });

  it("writes nothing when the card is dropped back in its own column", () => {
    expect(
      resolveKanbanDrop({
        draggableId: "42",
        source: { droppableId: "pending" },
        destination: { droppableId: "pending" },
      }),
    ).toBeNull();
  });
});
