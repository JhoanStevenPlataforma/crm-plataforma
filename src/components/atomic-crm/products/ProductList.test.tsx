import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { AsManager, AsSalesRep } from "./ProductList.stories";

describe("ProductList", () => {
  // Below 768px the CRM mounts its mobile admin, which registers no catalogue
  // routes: opening a product would land on "Not Found".
  beforeAll(() => {
    page.viewport(1600, 900);
  });

  it("prices every product to the last unit, in its own currency", async () => {
    const screen = await render(<AsManager />);

    const table = screen.getByRole("table");
    await expect.element(table.getByText("$9,200,000.00")).toBeVisible();
    await expect.element(table.getByText("$1,234.50")).toBeVisible();
  });

  it("names the kind, the unit and the tax rate rather than their codes", async () => {
    const screen = await render(<AsManager />);

    // Scoped to the table, because the kind filter above it lists every kind
    // too; exact, because "Service" is also a substring of the category
    // "Professional services".
    const table = screen.getByRole("table");
    await expect
      .element(table.getByText("Service", { exact: true }))
      .toBeVisible();
    await expect
      .element(table.getByText("Hour", { exact: true }))
      .toBeVisible();
    await expect.element(table.getByText("IVA 19%")).toBeVisible();
  });

  it("lets a manager add a product and open one to edit it", async () => {
    const screen = await render(<AsManager />);

    await expect.element(screen.getByText("New product")).toBeVisible();

    await screen.getByText("Implementation project").click();

    await expect.element(screen.getByLabelText(/^SKU/)).toHaveValue("SRV-001");
  });

  it("shows a sales rep the catalogue without the button to add to it", async () => {
    const screen = await render(<AsSalesRep />);

    // Positive first, so the absence below is not asserted before the list
    // has rendered at all.
    await expect
      .element(screen.getByText("Implementation project"))
      .toBeVisible();
    await expect
      .element(screen.getByText("New product"))
      .not.toBeInTheDocument();
  });
});
