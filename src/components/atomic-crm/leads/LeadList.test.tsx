import { render } from "vitest-browser-react";

import { AsSalesRep, Success } from "./LeadList.stories";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadList", () => {
  it("renders leads with their company and status", async () => {
    const screen = await render(<Success />);

    await expect.element(screen.getByText("Lucia Prospect")).toBeVisible();
    await expect.element(screen.getByText("Prospect Industries")).toBeVisible();
    // Scoped to the table: the status filter above it renders an <option> per
    // status, and the summary row a card per stage, so an unscoped query for
    // "Qualified" matches four things. The claim here is about the ROW.
    await expect
      .element(screen.getByRole("table").getByText("Qualified"))
      .toBeVisible();
  });

  it("shows the linked company for a lead attached to a company record", async () => {
    const screen = await render(<Success />);

    await expect.element(screen.getByText("Empresa Vinculada")).toBeVisible();
  });

  it("marks an already converted lead", async () => {
    const screen = await render(<Success />);

    await expect.element(screen.getByText("Converted")).toBeVisible();
  });

  it("offers bulk assignment to a user who may reassign records", async () => {
    const screen = await render(<Success />);

    await screen.getByRole("checkbox").first().click();

    await expect
      .element(screen.getByRole("button", { name: /assign to/i }))
      .toBeVisible();
  });

  it("hides bulk assignment from a sales rep", async () => {
    const screen = await render(<AsSalesRep />);

    await screen.getByRole("checkbox").first().click();

    // The selection toolbar is up (delete is available) but assignment is not.
    await expect
      .element(screen.getByRole("button", { name: /delete/i }).first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /assign to/i }))
      .not.toBeInTheDocument();
  });
});
