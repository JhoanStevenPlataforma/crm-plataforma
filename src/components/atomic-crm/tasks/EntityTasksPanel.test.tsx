import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { EntityTasksPanel } from "./EntityTasksPanel";
import type { Task } from "../types";

const contact = buildContact({ id: 1 });

const renderPanel = async (tasks: Task[]) => {
  let dataProvider: DataProvider | null = null;
  const Listener = () => {
    dataProvider = useDataProvider();
    return null;
  };

  const screen = await render(
    <StoryWrapper data={{ contacts: [contact], tasks }}>
      <Listener />
      <EntityTasksPanel
        entityType="deal"
        entityId={42}
        entityLabel="Renewal Acme 2026"
      />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

describe("EntityTasksPanel", () => {
  it("shows the tasks attached to this record", async () => {
    const { screen } = await renderPanel([
      buildTask({
        id: 1,
        title: "Send the revised proposal",
        primary_entity_type: "deal",
        primary_entity_id: 42,
      }),
    ]);

    await expect
      .element(screen.getByText("Send the revised proposal"))
      .toBeInTheDocument();
  });

  it("does not show tasks attached to a different record", async () => {
    const { screen } = await renderPanel([
      buildTask({
        id: 1,
        title: "Task of this deal",
        primary_entity_type: "deal",
        primary_entity_id: 42,
      }),
      buildTask({
        id: 2,
        title: "Task of another deal",
        primary_entity_type: "deal",
        primary_entity_id: 99,
      }),
      buildTask({
        id: 3,
        title: "Task of a contact",
        primary_entity_type: "contact",
        primary_entity_id: 1,
      }),
    ]);

    await expect
      .element(screen.getByText("Task of this deal"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Task of another deal"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Task of a contact"))
      .not.toBeInTheDocument();
  });

  it("creates a task and links it to the record it was created from", async () => {
    // The capability the original schema made impossible: `tasks.contact_id`
    // was NOT NULL, so a task could not belong to a deal at all (W1).
    const { screen, getDataProvider } = await renderPanel([]);

    await screen.getByRole("button", { name: /add task/i }).click();

    await screen.getByLabelText(/^title/i).fill("Prepare the renewal proposal");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<Task>("tasks", {
          filter: {},
          pagination: { page: 1, perPage: 10 },
          sort: { field: "id", order: "ASC" },
        });
        return data.find(
          (task) => task.title === "Prepare the renewal proposal",
        );
      })
      .toMatchObject({
        primary_entity_type: "deal",
        primary_entity_id: 42,
        primary_entity_label: "Renewal Acme 2026",
      });
  });
});
