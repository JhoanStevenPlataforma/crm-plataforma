import { render } from "vitest-browser-react";

import { WithQuotes } from "./QuoteList.stories";

describe("QuoteList", () => {
  it("shows the company, the status and the exact total of the current version", async () => {
    const screen = await render(<WithQuotes />);

    // Scoped to the table: the status filter above it offers the same words.
    const table = screen.getByRole("table");
    await expect.element(table.getByText("Q-2026-00001")).toBeVisible();
    await expect.element(table.getByText("Acme Andina").first()).toBeVisible();
    await expect.element(table.getByText("Draft")).toBeVisible();
    // Exact, never the dashboard's compact `$642.6K` (quotes F4).
    await expect.element(table.getByText("$642,600.00")).toBeVisible();
  });

  it("filters on the status key without blanking the filter it applied", async () => {
    // A `ReferenceInput` would resolve "accepted" by calling getMany with it as
    // an ID, find nothing, and render an empty box over an applied filter.
    const screen = await render(<WithQuotes />);

    await screen.getByRole("combobox").first().click();
    await screen.getByRole("option", { name: "Accepted" }).click();

    await expect.element(screen.getByText("Q-2026-00002")).toBeVisible();
    await expect
      .element(screen.getByText("Q-2026-00001"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("table").getByText("Accepted"))
      .toBeVisible();
  });
});
