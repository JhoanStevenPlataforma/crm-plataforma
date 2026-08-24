import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskChecklist } from "./TaskChecklist";
import type {
  Task,
  TaskChecklistItem,
  TaskDependency,
  TaskEvent,
} from "../types";

const task = buildTask({ id: 1, title: "Preparar la renovación" });
const contact = buildContact({ id: 1 });

// Each write fans out through the callbacks standing in for the database
// triggers — event stream, then the counters — so effects land several
// round-trips after the click, well past the 1 s poll default.
const SETTLE = { timeout: 15000 };

const buildItem = (
  overrides: Partial<TaskChecklistItem> = {},
): TaskChecklistItem => ({
  id: 1,
  task_id: 1,
  label: "Revisar el contrato actual",
  position: 1,
  is_done: false,
  done_at: null,
  done_by: null,
  created_by: 0,
  created_at: "2026-08-01T09:00:00.000Z",
  deleted_at: null,
  ...overrides,
});

const renderChecklist = async (items: TaskChecklistItem[] = []) => {
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
        task_checklist_items: items,
      }}
    >
      <Listener />
      <TaskChecklist taskId={1} />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const listItems = async (dataProvider: DataProvider) => {
  const { data } = await dataProvider.getList<TaskChecklistItem>(
    "task_checklist_items",
    {
      filter: { task_id: 1 },
      pagination: { page: 1, perPage: 50 },
      sort: { field: "position", order: "ASC" },
    },
  );
  return data;
};

describe("TaskChecklist", () => {
  it("lists the steps of the task in order", async () => {
    const { screen } = await renderChecklist([
      buildItem({ id: 1, label: "Revisar el contrato", position: 1 }),
      buildItem({ id: 2, label: "Pedir precios", position: 2 }),
    ]);

    await expect
      .element(screen.getByText("Revisar el contrato"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Pedir precios")).toBeInTheDocument();
  });

  it("tells the user when there are no steps yet", async () => {
    const { screen } = await renderChecklist([]);

    await expect.element(screen.getByText(/no steps yet/i)).toBeInTheDocument();
  });

  it("shows how many steps are done", async () => {
    const { screen } = await renderChecklist([
      buildItem({
        id: 1,
        is_done: true,
        done_by: 0,
        done_at: "2026-08-02T09:00:00.000Z",
      }),
      buildItem({ id: 2, label: "Pendiente", position: 2 }),
    ]);

    await expect.element(screen.getByText(/1 of 2 done/i)).toBeInTheDocument();
  });

  it("adds a step at the end of the list", async () => {
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1, label: "Primero", position: 1 }),
    ]);

    await screen.getByRole("textbox").fill("Enviar la propuesta");
    await screen.getByRole("button", { name: /^add$/i }).click();

    await expect
      .poll(async () => {
        const items = await listItems(getDataProvider());
        return items.find((item) => item.label === "Enviar la propuesta");
      }, SETTLE)
      .toMatchObject({ task_id: 1, is_done: false });

    // Appended, not prepended: the client never computes the rank.
    const items = await listItems(getDataProvider());
    const added = items.find((item) => item.label === "Enviar la propuesta")!;
    expect(Number(added.position)).toBeGreaterThan(1);
  });

  it("records who ticked a step, and when", async () => {
    // A checklist that cannot say who did what is just a text field (§11.3).
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1, label: "Revisar el contrato" }),
    ]);

    await screen.getByRole("checkbox").click();

    await expect
      .poll(async () => (await listItems(getDataProvider()))[0], SETTLE)
      .toMatchObject({ is_done: true, done_by: 0 });

    const [ticked] = await listItems(getDataProvider());
    expect(ticked.done_at).not.toBeNull();
  });

  it("keeps the task counters in step with the items", async () => {
    // The "n/total" badge on the task row reads these counters, so they must
    // follow every tick without the list ever querying the child table (§3.4).
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1 }),
      buildItem({ id: 2, label: "Segundo paso", position: 2 }),
    ]);

    await screen.getByRole("checkbox").first().click();

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getOne<Task>("tasks", {
          id: 1,
        });
        return {
          total: data.checklist_total,
          done: data.checklist_done,
        };
      }, SETTLE)
      .toEqual({ total: 2, done: 1 });
  });

  it("puts every tick in the audit trail", async () => {
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1, label: "Revisar el contrato" }),
    ]);

    await screen.getByRole("checkbox").click();

    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskEvent>(
          "task_events",
          {
            filter: { task_id: 1 },
            pagination: { page: 1, perPage: 50 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data.find(
          (event) => event.event_type === "checklist.item_completed",
        );
      }, SETTLE)
      .toMatchObject({ metadata: { label: "Revisar el contrato" } });
  });

  it("removes a step without destroying it", async () => {
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1, label: "Paso equivocado" }),
    ]);

    await screen.getByRole("button", { name: /remove step/i }).click();

    await expect
      .poll(
        async () => (await listItems(getDataProvider()))[0]?.deleted_at,
        SETTLE,
      )
      .not.toBeNull();

    // Soft delete: the row stays, so the history that references it resolves.
    const [removed] = await listItems(getDataProvider());
    expect(removed.label).toBe("Paso equivocado");
  });

  it("turns a step into a sub-task linked to its parent", async () => {
    // The moment a step needs its own owner it has outgrown the checklist
    // (§11.1); retyping it into a new task is the friction this removes.
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1, label: "Llamar a finanzas" }),
    ]);

    await screen.getByRole("button", { name: /into a sub-task/i }).click();

    // Poll on the EDGE, not on the task: the task is written first, so waiting
    // for it lets the assertion run before the link exists.
    await expect
      .poll(async () => {
        const { data } = await getDataProvider().getList<TaskDependency>(
          "task_dependencies",
          {
            filter: {},
            pagination: { page: 1, perPage: 50 },
            sort: { field: "id", order: "ASC" },
          },
        );
        return data[0];
      }, SETTLE)
      // "A parent of B" means B is the sub-task, so the parent is the SOURCE.
      .toMatchObject({ source_task_id: 1, kind: "parent" });

    const { data: tasks } = await getDataProvider().getList<Task>("tasks", {
      filter: {},
      pagination: { page: 1, perPage: 50 },
      sort: { field: "id", order: "ASC" },
    });
    const subTask = tasks.find((entry) => entry.title === "Llamar a finanzas")!;

    const { data: edges } = await getDataProvider().getList<TaskDependency>(
      "task_dependencies",
      {
        filter: {},
        pagination: { page: 1, perPage: 50 },
        sort: { field: "id", order: "ASC" },
      },
    );
    expect(edges[0].target_task_id).toBe(subTask.id);
  });

  it("retires the step it promoted, so the work is not counted twice", async () => {
    const { screen, getDataProvider } = await renderChecklist([
      buildItem({ id: 1, label: "Llamar a finanzas" }),
    ]);

    await screen.getByRole("button", { name: /into a sub-task/i }).click();

    await expect
      .poll(
        async () => (await listItems(getDataProvider()))[0]?.deleted_at,
        SETTLE,
      )
      .not.toBeNull();
  });

  it("does not offer to promote a step that is already done", async () => {
    const { screen } = await renderChecklist([
      buildItem({
        id: 1,
        label: "Ya hecho",
        is_done: true,
        done_by: 0,
        done_at: "2026-08-02T09:00:00.000Z",
      }),
    ]);

    // Assert something positive first: a `.not` on an unrendered tree passes
    // vacuously.
    await expect.element(screen.getByText("Ya hecho")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /into a sub-task/i }))
      .not.toBeInTheDocument();
  });
});
