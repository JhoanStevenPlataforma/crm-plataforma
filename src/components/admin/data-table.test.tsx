import { ListBase, ResourceContextProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { DataTable } from "./data-table";
import { ListPagination } from "./list-pagination";

const TagList = ({ filter }: { filter?: Record<string, unknown> }) => (
  <ResourceContextProvider value="tags">
    <ListBase filterDefaultValues={filter} disableSyncWithLocation>
      <DataTable>
        <DataTable.Col source="name" />
      </DataTable>
      <ListPagination />
    </ListBase>
  </ResourceContextProvider>
);

describe("DataTable empty state", () => {
  it("says nothing exists yet when no filter is applied", async () => {
    const screen = await render(
      <StoryWrapper data={{ tags: [] }}>
        <TagList />
      </StoryWrapper>,
    );

    await expect.element(screen.getByText("No tags yet.")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Clear filters" }))
      .not.toBeInTheDocument();
  });

  it("blames the filters, and offers to clear them, when they hid everything", async () => {
    const screen = await render(
      <StoryWrapper data={{ tags: [{ id: 1, name: "vip", color: "#eee" }] }}>
        <TagList filter={{ name: "nothing-matches" }} />
      </StoryWrapper>,
    );

    await expect.element(screen.getByText("No results")).toBeVisible();
    await screen.getByRole("button", { name: "Clear filters" }).click();
    await expect.element(screen.getByText("vip")).toBeVisible();
  });

  it("draws no half-interpolated range while the first page loads", async () => {
    const screen = await render(
      <StoryWrapper
        data={{ tags: [] }}
        dataProvider={{
          getList: () => new Promise(() => {}),
        }}
      >
        <TagList />
        <p>rendered</p>
      </StoryWrapper>,
    );

    await expect.element(screen.getByText("rendered")).toBeVisible();
    await expect.element(screen.getByText(/%\{/)).not.toBeInTheDocument();
  });

  it("draws no '1-0 of 0' range under an empty list", async () => {
    const screen = await render(
      <StoryWrapper data={{ tags: [] }}>
        <TagList />
      </StoryWrapper>,
    );

    // Positive first, whichever wording the empty table uses, so the absence
    // below is not asserted before the list has answered.
    await expect
      .element(screen.getByText(/No tags yet|No results/).first())
      .toBeVisible();
    await expect.element(screen.getByText(/0 of 0/)).not.toBeInTheDocument();
  });
});
