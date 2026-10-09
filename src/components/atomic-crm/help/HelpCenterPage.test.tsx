import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { AsAdmin, AsSalesRep, Empty } from "./HelpCenterPage.stories";

describe("HelpCenterPage", () => {
  beforeAll(() => {
    page.viewport(1600, 900);
  });

  it("files every tutorial under its category and hides a category with none", async () => {
    const screen = await render(<AsSalesRep />);

    const quotes = screen.getByRole("region", { name: "Quotations" });
    await expect.element(quotes.getByText("Create a product")).toBeVisible();
    await expect.element(quotes.getByText("Create a quotation")).toBeVisible();
    await expect.element(quotes.getByText("1:35")).toBeVisible();
    await expect
      .element(
        screen
          .getByRole("region", { name: "Customers" })
          .getByText("Añadir una compañía"),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText("Coming later"))
      .not.toBeInTheDocument();
  });

  it("narrows to one category, and searches without minding accents", async () => {
    const screen = await render(<AsSalesRep />);

    await screen.getByRole("button", { name: "Customers" }).click();
    await expect.element(screen.getByText("Añadir una compañía")).toBeVisible();
    await expect
      .element(screen.getByText("Create a product"))
      .not.toBeInTheDocument();

    await screen.getByRole("button", { name: "All", exact: true }).click();
    await screen.getByRole("searchbox").fill("compania");
    await expect.element(screen.getByText("Añadir una compañía")).toBeVisible();
    await expect
      .element(screen.getByText("Create a product"))
      .not.toBeInTheDocument();

    await screen.getByRole("searchbox").fill("nothing like this");
    await expect
      .element(screen.getByText("No tutorial matches your search."))
      .toBeVisible();
  });

  it("opens a tutorial with its steps and does not fetch the recording until it is played", async () => {
    const screen = await render(<AsSalesRep />);

    await screen.getByText("Create a product").click();

    await expect
      .element(screen.getByRole("heading", { name: "Create a product" }))
      .toBeVisible();
    await expect.element(screen.getByText("Press New product.")).toBeVisible();
    const video = screen.getByLabelText("Create a product");
    await expect.element(video).toHaveAttribute("preload", "none");
    // The next tutorial of the same category, not of the manual.
    await expect
      .element(
        screen.getByRole("navigation", {
          name: "More tutorials in this category",
        }),
      )
      .toHaveTextContent("Create a quotation");
  });

  it("shows a sales rep the manual without the way to manage it", async () => {
    const screen = await render(<AsSalesRep />);

    await expect.element(screen.getByText("Create a product")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Manage" }))
      .not.toBeInTheDocument();
  });

  it("shows an admin the drafts, marked, and the way to manage the manual", async () => {
    const screen = await render(<AsAdmin />);

    await expect.element(screen.getByText("Send a quotation")).toBeVisible();
    await expect.element(screen.getByText("Draft")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Manage" }))
      .toHaveAttribute("href", "/help_tutorials");
  });

  it("says so when there is nothing to watch yet", async () => {
    const screen = await render(<Empty />);

    await expect
      .element(screen.getByText("There are no tutorials yet."))
      .toBeVisible();
  });
});
