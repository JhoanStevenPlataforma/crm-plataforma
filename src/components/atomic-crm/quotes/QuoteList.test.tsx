import { render } from "vitest-browser-react";

import {
  WithLostQuote,
  WithQuotes,
  WithUnansweredCustomer,
} from "./QuoteList.stories";

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

  it("flags the quote whose customer wrote and nobody has read it yet", async () => {
    const screen = await render(<WithUnansweredCustomer />);

    const table = screen.getByRole("table");
    await expect.element(table.getByText("Q-2026-00002")).toBeVisible();
    // One unread question on quote 1; the deleted and internal comments do not
    // count, and quote 2 has nothing waiting.
    await expect.element(table.getByText("1 unread")).toBeVisible();
    expect(table.getByText(/unread/).all()).toHaveLength(1);
  });

  it("says why we lost it, beside the status that says we lost it", async () => {
    const screen = await render(<WithLostQuote />);

    const table = screen.getByRole("table");
    await expect.element(table.getByText("Rejected")).toBeVisible();
    await expect.element(table.getByText("Delivery time")).toBeVisible();
    // The reason belongs to the one quote that was refused, not to the others.
    expect(table.getByText("Delivery time").all()).toHaveLength(1);
    // The customer's own words stay on the quotation: the list carries the
    // code, which is what groups a pipeline.
    await expect
      .element(table.getByText("Necesitamos la entrega en agosto."))
      .not.toBeInTheDocument();
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
