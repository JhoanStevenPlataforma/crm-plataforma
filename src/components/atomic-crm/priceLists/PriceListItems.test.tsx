import { render } from "vitest-browser-react";

import { DuplicatePrice, Empty, WithPrices } from "./PriceListItems.stories";

type Screen = Awaited<ReturnType<typeof render>>;

const pickProduct = async (screen: Screen, name: string) => {
  await screen.getByRole("combobox", { name: "Product" }).click();
  await screen.getByRole("option", { name }).first().click();
};

const addPrice = async (screen: Screen, price: string) => {
  await pickProduct(screen, "Implementation project (SRV-001)");
  await screen.getByRole("spinbutton", { name: "Unit price" }).fill(price);
  await screen.getByRole("button", { name: "Add price" }).click();
};

describe("PriceListItems", () => {
  it("shows each price in the list's currency, even on a product since deactivated", async () => {
    const screen = await render(<WithPrices />);

    const table = screen.getByRole("table");
    await expect.element(table.getByText("Old widget (W-OLD)")).toBeVisible();
    await expect.element(table.getByText("$1,500.00")).toBeVisible();
    await expect
      .element(table.getByText("The product's own rate"))
      .toBeVisible();
  });

  it("explains that an empty list still quotes products at their list price", async () => {
    const screen = await render(<Empty />);

    await expect
      .element(screen.getByText(/quoted at their own list price/))
      .toBeVisible();
  });

  it("offers only active products for a new price", async () => {
    const screen = await render(<Empty />);

    await screen.getByRole("combobox", { name: "Product" }).click();

    await expect
      .element(
        screen
          .getByRole("option", { name: "Implementation project (SRV-001)" })
          .first(),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("option", { name: "Old widget (W-OLD)" }))
      .not.toBeInTheDocument();
  });

  it("keeps the add button disabled until a product and a price are given", async () => {
    const screen = await render(<Empty />);
    const add = screen.getByRole("button", { name: "Add price" });

    await expect.element(add).toBeDisabled();
    await pickProduct(screen, "Implementation project (SRV-001)");
    await expect.element(add).toBeDisabled();
    await screen.getByRole("spinbutton", { name: "Unit price" }).fill("225000");
    await expect.element(add).toBeEnabled();
  });

  it("adds a price with its tax override to the list", async () => {
    const screen = await render(<Empty />);

    await pickProduct(screen, "Implementation project (SRV-001)");
    await screen.getByRole("spinbutton", { name: "Unit price" }).fill("225000");
    await screen.getByRole("combobox", { name: "Tax rate" }).click();
    await screen.getByRole("option", { name: "Exento" }).first().click();
    await screen.getByRole("button", { name: "Add price" }).click();

    const table = screen.getByRole("table");
    await expect
      .element(table.getByText("Implementation project (SRV-001)"))
      .toBeVisible();
    await expect.element(table.getByText("$225,000.00")).toBeVisible();
    await expect.element(table.getByText("Exento")).toBeVisible();
  });

  it("reports a price that already exists instead of a generic failure", async () => {
    const screen = await render(<DuplicatePrice />);

    await addPrice(screen, "225000");

    await expect
      .element(
        screen.getByText(
          "This product already has a price for that minimum quantity",
        ),
      )
      .toBeVisible();
  });
});
