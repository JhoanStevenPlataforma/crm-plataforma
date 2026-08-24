import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskKanban } from "./TaskKanban";
import type { Task } from "../types";

const contact = buildContact({ id: 1 });

const pending = buildTask({
  id: 1,
  title: "Llamar a Ana",
  status_key: "pending",
  status_id: 1,
});
const inProgress = buildTask({
  id: 2,
  title: "Enviar la propuesta",
  status_key: "in_progress",
  status_id: 3,
});

const renderKanban = async (tasks: Task[] = [pending, inProgress]) => {
  const screen = await render(
    <StoryWrapper data={{ tasks, contacts: [contact] }}>
      <TaskKanban filter={{}} />
    </StoryWrapper>,
  );

  return { screen };
};

describe("TaskKanban", () => {
  it("renders one column per lifecycle state a card can be dropped into", async () => {
    const { screen } = await renderKanban();

    await expect.element(screen.getByText("Pending")).toBeInTheDocument();
    await expect.element(screen.getByText("In progress")).toBeInTheDocument();
    await expect.element(screen.getByText("Blocked")).toBeInTheDocument();
    await expect.element(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("omits the columns a drag cannot legally produce", async () => {
    // Cancelling requires a reason (§4.4) and a drag cannot supply one, so the
    // column would be a drop target that always fails.
    const { screen } = await renderKanban();

    await expect.element(screen.getByText("Cancelled")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Archived")).not.toBeInTheDocument();
  });

  it("shows each task once, under its own status", async () => {
    const { screen } = await renderKanban();

    await expect.element(screen.getByText("Llamar a Ana")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Enviar la propuesta"))
      .toBeInTheDocument();
  });

  it("opens the task when its card is clicked", async () => {
    const { screen } = await renderKanban();

    await screen.getByRole("button", { name: /open llamar a ana/i }).click();

    await expect.element(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
