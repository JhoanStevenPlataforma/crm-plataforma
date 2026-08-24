import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { Task } from "./Task";
import type { Task as TData } from "../types";

const contact = buildContact({
  id: 1,
  first_name: "Ada",
  last_name: "Lovelace",
});

const renderTask = async (task: TData) => {
  let dataProvider: DataProvider | null = null;
  const Listener = () => {
    dataProvider = useDataProvider();
    return null;
  };

  const screen = await render(
    <StoryWrapper data={{ contacts: [contact], tasks: [task] }}>
      <Listener />
      <Task task={task} />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const readTask = async (dataProvider: DataProvider, id: number) => {
  const { data } = await dataProvider.getOne<TData>("tasks", { id });
  return data;
};

describe("Task row", () => {
  it("shows the title rather than a wall of description text", async () => {
    const { screen } = await renderTask(
      buildTask({
        title: "Call Ada about the renewal",
        description: "Long context that belongs in the detail panel",
      }),
    );

    await expect
      .element(screen.getByText("Call Ada about the renewal"))
      .toBeInTheDocument();
  });

  it("completes a task through a lifecycle transition, recording the completion", async () => {
    const { screen, getDataProvider } = await renderTask(
      buildTask({ id: 1, status_key: "pending", completed_at: null }),
    );

    await screen.getByRole("checkbox").click();

    await expect
      .poll(async () => (await readTask(getDataProvider(), 1)).status_key)
      .toBe("completed");

    const task = await readTask(getDataProvider(), 1);
    expect(task.completed_at).not.toBeNull();
  });

  it("reopens a completed task instead of blanking its completion (fixes W3)", async () => {
    const { screen, getDataProvider } = await renderTask(
      buildTask({
        id: 1,
        status_key: "completed",
        completed_at: "2025-01-04T10:00:00.000Z",
        done_date: "2025-01-04T10:00:00.000Z",
      }),
    );

    await screen.getByRole("checkbox").click();

    // The original implementation set `done_date = null` and left everything
    // else untouched, so nothing recorded that the task had ever been done.
    // Un-checking is now a real `completed -> in_progress` transition.
    await expect
      .poll(async () => (await readTask(getDataProvider(), 1)).status_key)
      .toBe("in_progress");
  });

  it("postpones without losing the time of day (fixes W4)", async () => {
    const { screen, getDataProvider } = await renderTask(
      buildTask({ id: 1, due_date: "2025-01-03T09:30:00.000Z" }),
    );

    await screen.getByRole("button", { name: /task actions/i }).click();
    await screen.getByText("Postpone to tomorrow").click();

    await expect
      .poll(async () => (await readTask(getDataProvider(), 1)).due_date)
      .not.toBe("2025-01-03T09:30:00.000Z");

    const task = await readTask(getDataProvider(), 1);
    const original = new Date("2025-01-03T09:30:00.000Z");
    const updated = new Date(task.due_date);

    expect(updated.getHours()).toBe(original.getHours());
    expect(updated.getMinutes()).toBe(original.getMinutes());
  });

  it("surfaces the reschedule count on the row", async () => {
    const { screen } = await renderTask(
      buildTask({ title: "Chased task", reschedule_count: 3 }),
    );

    await expect.element(screen.getByText("Chased task")).toBeInTheDocument();
    await expect.element(screen.getByText("×3")).toBeInTheDocument();
  });

  it("does not render a badge for the default priority", async () => {
    const { screen } = await renderTask(
      buildTask({ title: "Ordinary task", priority_key: "normal" }),
    );

    await expect.element(screen.getByText("Ordinary task")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Normal", { exact: true }))
      .not.toBeInTheDocument();
  });

  it("renders a badge for an urgent task", async () => {
    const { screen } = await renderTask(
      buildTask({
        title: "Urgent task",
        priority_key: "urgent",
        priority_label: "Urgent",
      }),
    );

    await expect
      .element(screen.getByText("Urgent", { exact: true }))
      .toBeInTheDocument();
  });

  it("shows the lifecycle state when it is not the default", async () => {
    const { screen } = await renderTask(
      buildTask({ title: "Blocked task", status_key: "blocked" }),
    );

    await expect
      .element(screen.getByText("Blocked", { exact: true }))
      .toBeInTheDocument();
  });
});
