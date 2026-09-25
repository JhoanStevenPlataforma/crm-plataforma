import { describe, expect, it } from "vitest";

import type { Task } from "../types";
import { nextTaskByEntity } from "./nextOpenTask";

const task = (overrides: Partial<Task>): Task =>
  ({
    id: 1,
    title: "Task",
    primary_entity_type: "contact",
    ...overrides,
  }) as Task;

describe("nextTaskByEntity", () => {
  it("keeps the soonest due task, whatever order the tasks arrive in", () => {
    const result = nextTaskByEntity([
      task({ id: 1, primary_entity_id: 10, due_date: "2026-10-05T09:00:00Z" }),
      task({ id: 2, primary_entity_id: 10, due_date: "2026-09-20T09:00:00Z" }),
      task({ id: 3, primary_entity_id: 10, due_date: "" }),
    ]);

    expect(result.get(10)?.id).toBe(2);
  });
});
