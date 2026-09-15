import { render } from "vitest-browser-react";

import { Empty, WithQuotes } from "./EntityQuotesPanel.stories";

describe("EntityQuotesPanel", () => {
  it("lists the deal's quotes with their status and total", async () => {
    const screen = await render(<WithQuotes />);

    const quote = screen.getByRole("link", { name: "Q-2026-00001" });
    await expect.element(quote).toBeVisible();
    // The document, not the editor: once a version is issued there is nothing
    // left on it to edit (quotes §9).
    await expect.element(quote).toHaveAttribute("href", "/quotes/1/show");
    await expect.element(screen.getByText("Draft")).toBeVisible();
    await expect.element(screen.getByText(/642,600\.00/)).toBeVisible();
  });

  it("navigates to the quote editor rather than opening a dialog", async () => {
    // `DealShow` is itself a dialog, and a line-items repeater inside a dialog
    // inside a dialog is not a usable form (quotes §9). The defaults travel in
    // the URL, not in the router state, so the link survives a reload.
    const screen = await render(<WithQuotes />);

    const create = screen.getByRole("link", { name: "New quote" });
    await expect.element(create).toBeVisible();

    const href = (await create.element()).getAttribute("href") ?? "";
    expect(href).toContain("/quotes/create");
    expect(decodeURIComponent(href)).toContain('"deal_id":1');
    expect(decodeURIComponent(href)).toContain('"company_id":1');
    expect(decodeURIComponent(href)).toContain('"title":"Acme renewal"');
  });

  it("says a deal has no quotes instead of showing an empty list", async () => {
    const screen = await render(<Empty />);

    await expect
      .element(screen.getByText("No quotes for this deal yet"))
      .toBeVisible();
  });
});
