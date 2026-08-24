import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Mobile } from "./TaskCreateSheet.stories";
import { useDataProvider, type DataProvider } from "ra-core";
import { buildContact } from "@/test/StoryWrapper";

describe("TaskCreateSheet", () => {
  it("creates a task for a selected contact and updates last_seen", async () => {
    let dataProvider: DataProvider | null = null;
    const DataProviderListener = () => {
      dataProvider = useDataProvider();
      return null;
    };
    const originalLastSeen = "2025-01-02T10:00:00.000Z";

    const screen = await render(
      <Mobile
        data={{
          contacts: [
            buildContact({
              first_name: "Ada",
              id: 1,
              last_name: "Lovelace",
              last_seen: "2025-01-01T10:00:00.000Z",
              nb_tasks: 1,
            }),
            buildContact({
              first_name: "Grace",
              id: 2,
              last_name: "Hopper",
              last_seen: originalLastSeen,
            }),
          ],
          tasks: [
            {
              contact_id: 1,
              due_date: "2025-01-03T12:00:00.000Z",
              id: 1,
              sales_id: 0,
              title: "Existing seeded task",
              text: "Existing seeded task",
              type: "email",
              type_key: "email",
              status_key: "pending",
              priority_key: "normal",
            },
          ],
        }}
      >
        <DataProviderListener />
      </Mobile>,
    );

    await screen.getByLabelText(/^title/i).fill("Follow up about onboarding");

    await screen
      .getByLabelText(/description/i)
      .fill("Ask how the first week went");

    const [contactInput, typeInput] = screen.getByRole("combobox").all();

    await contactInput.click();
    await screen.getByText("Grace Hopper").click();

    await typeInput.click();
    const typeOptions = screen.getByRole("listbox");
    await typeOptions.getByText("Call").click();

    const dueDateInput = screen.getByLabelText(/due date/i);
    await dueDateInput.clear();
    await dueDateInput.fill("2026-03-06T12:30");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect.element(screen.getByText("Task added")).toBeInTheDocument();

    await expect
      .element(screen.getByText("Create Task"))
      .not.toBeInTheDocument();

    await expect
      .poll(async () => {
        const { data } = await dataProvider!.getList("tasks", {
          filter: {},
          pagination: { page: 1, perPage: 10 },
          sort: { field: "id", order: "ASC" },
        });
        return data.some((task) => task.title === "Follow up about onboarding");
      })
      .toBe(true);

    const tasks = await dataProvider!.getList("tasks", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    const createdTask = tasks.data.find(
      (task) => task.title === "Follow up about onboarding",
    );

    expect(createdTask).toMatchObject({
      contact_id: 2,
      title: "Follow up about onboarding",
      description: "Ask how the first week went",
      type: "call",
    });
    expect(tasks.data).toHaveLength(2);

    const updatedContact = await dataProvider!.getOne("contacts", {
      id: 2,
    });
    expect(updatedContact.data.last_seen).not.toBe(originalLastSeen);
    expect(updatedContact.data.nb_tasks).toBe(1);
  });
});
