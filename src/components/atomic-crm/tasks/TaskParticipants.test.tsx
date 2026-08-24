import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskParticipants } from "./TaskParticipants";
import type { Sale, TaskAssignment, Team } from "../types";

const contact = buildContact({ id: 1 });
const task = buildTask({ id: 1, owner_sales_id: 0, owner_name: "John Doe" });

// Adding a participant fans out through the callbacks standing in for the
// database triggers (the row, then the event), so the effect lands a couple of
// round-trips after the click.
const SETTLE = { timeout: 15000 };

const teammate: Sale = {
  id: 7,
  user_id: "7",
  first_name: "Laura",
  last_name: "Mendez",
  email: "laura@example.com",
  password: "demo",
  role: "rep",
  disabled: false,
};

const team: Team = { id: 3, name: "Renewals" };

const renderParticipants = async (assignments: TaskAssignment[] = []) => {
  let dataProvider: DataProvider | null = null;
  const Listener = () => {
    dataProvider = useDataProvider();
    return null;
  };

  const screen = await render(
    <StoryWrapper
      data={{
        tasks: [task],
        contacts: [contact],
        teams: [team],
        sales: [teammate],
        task_assignments: assignments,
      }}
    >
      <Listener />
      <TaskParticipants taskId={1} />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const listAssignments = async (dataProvider: DataProvider) => {
  const { data } = await dataProvider.getList<TaskAssignment>(
    "task_assignments",
    {
      filter: {},
      pagination: { page: 1, perPage: 50 },
      sort: { field: "id", order: "ASC" },
    },
  );
  return data;
};

const buildAssignment = (
  overrides: Partial<TaskAssignment> = {},
): TaskAssignment => ({
  id: 1,
  task_id: 1,
  sales_id: 7,
  team_id: null,
  role: "watcher",
  assigned_at: "2026-08-01T09:00:00.000Z",
  assigned_by: 0,
  unassigned_at: null,
  ...overrides,
});

describe("TaskParticipants", () => {
  it("shows the owner separately from the roles it manages", async () => {
    const { screen } = await renderParticipants([]);

    await expect.element(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("lists an active watcher by name", async () => {
    const { screen } = await renderParticipants([buildAssignment()]);

    await expect.element(screen.getByText("Laura Mendez")).toBeInTheDocument();
  });

  it("ignores an assignment that was already closed", async () => {
    // A closed row is history, not current state — showing it would say
    // somebody is on the task who left it (§7.2).
    const { screen } = await renderParticipants([
      buildAssignment({ unassigned_at: "2026-08-02T09:00:00.000Z" }),
    ]);

    await expect
      .element(screen.getByText("Laura Mendez"))
      .not.toBeInTheDocument();
  });

  it("adds a collaborator with the role chosen in the picker", async () => {
    const { screen, getDataProvider } = await renderParticipants([]);

    await screen.getByRole("combobox", { name: /add someone/i }).click();
    await screen.getByRole("option", { name: "Laura Mendez" }).click();
    await screen.getByRole("button", { name: /^add$/i }).click();

    await expect
      .poll(async () => (await listAssignments(getDataProvider()))[0], SETTLE)
      .toMatchObject({ task_id: 1, sales_id: 7, role: "collaborator" });
  });

  it("closes an assignment instead of deleting it", async () => {
    // Removing somebody must not erase that they were ever on the task: the
    // row is closed, and the timeline keeps the event (§7.2).
    const { screen, getDataProvider } = await renderParticipants([
      buildAssignment(),
    ]);

    await screen.getByRole("button", { name: /remove laura mendez/i }).click();

    await expect
      .poll(
        async () =>
          (await listAssignments(getDataProvider()))[0]?.unassigned_at,
        SETTLE,
      )
      .not.toBeNull();

    expect(await listAssignments(getDataProvider())).toHaveLength(1);
  });

  it("offers teams instead of people once the team role is picked", async () => {
    const { screen } = await renderParticipants([]);

    await screen.getByRole("combobox", { name: /role/i }).click();
    await screen.getByRole("option", { name: "Teams" }).click();

    await screen.getByRole("combobox", { name: /add someone/i }).click();
    await expect
      .element(screen.getByRole("option", { name: "Renewals" }))
      .toBeInTheDocument();
  });
});
