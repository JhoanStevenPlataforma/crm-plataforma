import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskDependencies } from "./TaskDependencies";
import type { Task, TaskDependency } from "../types";

const contact = buildContact({ id: 1 });

// Adding an edge fans out through the callbacks standing in for the database
// triggers — events on both tasks, then the automatic block — so the effect
// lands several round-trips after the click.
const SETTLE = { timeout: 15000 };

/** The task under inspection, plus a candidate blocker. */
const blocked = buildTask({ id: 1, title: "Enviar la propuesta" });
const blocker = buildTask({ id: 2, title: "Conseguir el precio" });

const buildEdge = (
  overrides: Partial<TaskDependency> = {},
): TaskDependency => ({
  id: 1,
  source_task_id: 2,
  target_task_id: 1,
  kind: "blocks",
  created_by: 0,
  created_at: "2026-08-01T09:00:00.000Z",
  removed_at: null,
  ...overrides,
});

const renderDependencies = async (
  edges: TaskDependency[] = [],
  tasks: Task[] = [blocked, blocker],
) => {
  let dataProvider: DataProvider | null = null;
  const Listener = () => {
    dataProvider = useDataProvider();
    return null;
  };

  const screen = await render(
    <StoryWrapper
      data={{ tasks, contacts: [contact], task_dependencies: edges }}
    >
      <Listener />
      <TaskDependencies taskId={1} />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const listEdges = async (dataProvider: DataProvider) => {
  const { data } = await dataProvider.getList<TaskDependency>(
    "task_dependencies",
    {
      filter: {},
      pagination: { page: 1, perPage: 50 },
      sort: { field: "id", order: "ASC" },
    },
  );
  return data;
};

describe("TaskDependencies", () => {
  it("says when nothing is blocking the task", async () => {
    const { screen } = await renderDependencies([]);

    await expect
      .element(screen.getByText(/nothing is blocking this task/i))
      .toBeInTheDocument();
  });

  it("lists what blocks this task", async () => {
    const { screen } = await renderDependencies([buildEdge()]);

    await expect
      .element(screen.getByText("Conseguir el precio"))
      .toBeInTheDocument();
  });

  it("lists what this task is blocking, from the same directed edge", async () => {
    // The inverse is derived, never stored twice — that is what keeps the
    // graph consistent (§10.1).
    const { screen } = await renderDependencies([
      buildEdge({ source_task_id: 1, target_task_id: 2 }),
    ]);

    await expect.element(screen.getByText(/^blocking$/i)).toBeInTheDocument();
    await expect
      .element(screen.getByText("Conseguir el precio"))
      .toBeInTheDocument();
  });

  it("adds a blocker and blocks the task with it", async () => {
    // The behaviour that makes a dependency more than a note: the system
    // enforces it rather than trusting the user to remember (§10.2).
    const { screen, getDataProvider } = await renderDependencies([]);

    await screen.getByRole("combobox").click();
    await screen.getByRole("option", { name: "Conseguir el precio" }).click();
    await screen.getByRole("button", { name: /^add$/i }).click();

    await expect
      .poll(async () => (await listEdges(getDataProvider()))[0], SETTLE)
      .toMatchObject({ source_task_id: 2, target_task_id: 1, kind: "blocks" });

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getOne<Task>("tasks", {
          id: 1,
        });
        return data.status_key;
      }, SETTLE)
      .toBe("blocked");
  });

  it("closes an edge instead of deleting it", async () => {
    // The history references the edge, so it has to keep resolving (§10.1).
    const { screen, getDataProvider } = await renderDependencies([buildEdge()]);

    await screen
      .getByRole("button", { name: /remove the dependency/i })
      .click();

    await expect
      .poll(
        async () => (await listEdges(getDataProvider()))[0]?.removed_at,
        SETTLE,
      )
      .not.toBeNull();

    expect(await listEdges(getDataProvider())).toHaveLength(1);
  });

  it("does not offer the task itself as its own blocker", async () => {
    const { screen } = await renderDependencies([]);

    await screen.getByRole("combobox").click();

    await expect
      .element(screen.getByRole("option", { name: "Conseguir el precio" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("option", { name: "Enviar la propuesta" }))
      .not.toBeInTheDocument();
  });
});
