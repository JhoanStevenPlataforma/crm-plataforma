import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { buildContact, buildTask, StoryWrapper } from "@/test/StoryWrapper";

import { TaskBucketSection } from "./TaskBucketSection";

const contact = buildContact({
  id: 1,
  first_name: "Ada",
  last_name: "Lovelace",
});

const seed = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    buildTask({
      id: index + 1,
      title: `Task ${index + 1}`,
      due_date: "2025-01-03T12:00:00.000Z",
    }),
  );

const renderSection = (props: {
  tasks: ReturnType<typeof seed>;
  filter?: Record<string, unknown>;
  perPage?: number;
}) =>
  render(
    <StoryWrapper data={{ contacts: [contact], tasks: props.tasks }}>
      <TaskBucketSection
        title="Today"
        filter={props.filter ?? {}}
        perPage={props.perPage ?? 5}
      />
    </StoryWrapper>,
  );

describe("TaskBucketSection", () => {
  it("renders nothing when the bucket has no tasks", async () => {
    const screen = await render(
      <StoryWrapper data={{ contacts: [contact], tasks: [] }}>
        <span>sibling marker</span>
        <TaskBucketSection title="Today" filter={{}} />
      </StoryWrapper>,
    );

    // Assert something positive first: a bare `.not.toBeInTheDocument()` passes
    // vacuously before the tree has rendered.
    await expect
      .element(screen.getByText("sibling marker"))
      .toBeInTheDocument();
    await expect.element(screen.getByText("Today")).not.toBeInTheDocument();
  });

  it("renders the section title once it has tasks", async () => {
    const screen = await renderSection({ tasks: seed(1) });

    await expect.element(screen.getByText("Today")).toBeInTheDocument();
  });

  it("renders one row per task", async () => {
    const screen = await renderSection({ tasks: seed(3) });

    await expect.element(screen.getByText("Task 1")).toBeInTheDocument();
    await expect.element(screen.getByText("Task 3")).toBeInTheDocument();
  });

  it("does not offer load more when the tasks fit in one page", async () => {
    const screen = await renderSection({ tasks: seed(3) });

    await expect.element(screen.getByText("Task 1")).toBeInTheDocument();
    await expect.element(screen.getByText("Load more")).not.toBeInTheDocument();
  });

  it("offers load more when there are more tasks than the page size", async () => {
    const screen = await renderSection({ tasks: seed(8) });

    await expect.element(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("load more asks the server for a bigger page", async () => {
    const screen = await renderSection({ tasks: seed(8) });

    // Only the first page is fetched: the rest never reached the browser,
    // which is the whole point of moving the buckets server-side.
    await expect.element(screen.getByText("Task 5")).toBeInTheDocument();
    await expect.element(screen.getByText("Task 6")).not.toBeInTheDocument();

    await screen.getByText("Load more").click();

    await expect.element(screen.getByText("Task 8")).toBeInTheDocument();
    await expect.element(screen.getByText("Load more")).not.toBeInTheDocument();
  });

  it("only renders the tasks matching the bucket filter", async () => {
    const tasks = [
      buildTask({ id: 1, title: "Open task" }),
      buildTask({
        id: 2,
        title: "Completed task",
        status_key: "completed",
        completed_at: "2025-01-04T10:00:00.000Z",
      }),
    ];

    const screen = await renderSection({
      tasks,
      filter: { "completed_at@is": null },
    });

    await expect.element(screen.getByText("Open task")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Completed task"))
      .not.toBeInTheDocument();
  });
});
