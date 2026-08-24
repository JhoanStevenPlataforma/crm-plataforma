import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskCalendar } from "./TaskCalendar";
import type { Task } from "../types";

const contact = buildContact({ id: 1 });

/** Noon on a fixed day of the current month, so the grid always contains it. */
const dayInThisMonth = (day: number) => {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    day,
    12,
    0,
    0,
  ).toISOString();
};

const renderCalendar = async (tasks: Task[]) => {
  const screen = await render(
    <StoryWrapper data={{ tasks, contacts: [contact] }}>
      <TaskCalendar filter={{}} />
    </StoryWrapper>,
  );
  return { screen };
};

describe("TaskCalendar", () => {
  it("places a task on its due date", async () => {
    const { screen } = await renderCalendar([
      buildTask({ id: 1, title: "Llamar a Ana", due_date: dayInThisMonth(10) }),
    ]);

    await expect.element(screen.getByText("Llamar a Ana")).toBeInTheDocument();
  });

  it("collapses a crowded day rather than growing the cell", async () => {
    // Four tasks on one day: three chips and a count, so a busy Monday does
    // not blow the row height out and push the rest of the month off screen.
    const { screen } = await renderCalendar(
      [1, 2, 3, 4].map((id) =>
        buildTask({
          id,
          title: `Tarea ${id}`,
          due_date: dayInThisMonth(15),
        }),
      ),
    );

    await expect.element(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("opens the task when a chip is clicked", async () => {
    const { screen } = await renderCalendar([
      buildTask({ id: 1, title: "Llamar a Ana", due_date: dayInThisMonth(10) }),
    ]);

    await screen.getByRole("button", { name: "Llamar a Ana" }).click();

    await expect.element(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("leaves a task with no due date off the calendar", async () => {
    // It belongs to the list view's "no due date" bucket; inventing a day for
    // it would be a due date the user never set.
    const { screen } = await renderCalendar([
      buildTask({ id: 1, title: "Sin fecha", due_date: undefined }),
    ]);

    await expect.element(screen.getByText("Sin fecha")).not.toBeInTheDocument();
  });
});
