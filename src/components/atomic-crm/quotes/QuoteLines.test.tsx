import { render } from "vitest-browser-react";

import { Draft, Empty, Issued, WithoutPriceList } from "./QuoteLines.stories";

type Screen = Awaited<ReturnType<typeof render>>;

/**
 * The same amount is printed on a line and again in the totals block, so a bare
 * text query matches twice. The totals sit after the table in the document, so
 * the last match is the document's own figure.
 */
const totalOf = (screen: Screen, amount: RegExp) =>
  screen.getByText(amount).last();

const addLine = async (screen: Screen, product: string, quantity: string) => {
  const picker = screen.getByRole("combobox", { name: "Product" });
  await picker.click();
  await screen.getByRole("option", { name: product }).first().click();
  // Wait for the choice to land rather than for a moment to pass.
  await expect.element(picker).toHaveTextContent(product);
  // `exact`, because accessible names match on substrings: every line row has a
  // "Quantity of <product>" box, so a loose "Quantity" is ambiguous the moment
  // the document has a single line on it.
  await screen
    .getByRole("spinbutton", { name: "Quantity", exact: true })
    .fill(quantity);
  await screen.getByRole("button", { name: "Add line" }).click();
};

describe("QuoteLines", () => {
  it("shows a line and what the document adds up to", async () => {
    const screen = await render(<Draft />);

    // 3 x 200,000 less 10%, plus 19% IVA on what is actually charged. The
    // figure appears twice — once on the line, once in the totals below the
    // table — and that the two agree is the point.
    await expect
      .element(screen.getByText("Implementation project"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("table").getByText(/642,600\.00/))
      .toBeVisible();
    await expect.element(totalOf(screen, /642,600\.00/)).toBeVisible();
  });

  it("names the effective discount beside the amount taken off", async () => {
    const screen = await render(<Draft />);

    // 60,000 off 600,000 is 10%, which is the figure the approval gate reads.
    await expect.element(screen.getByText("Discount (10.00%)")).toBeVisible();
  });

  it("retotals as a quantity is typed, before anything is saved", async () => {
    const screen = await render(<Draft />);

    await screen
      .getByRole("spinbutton", { name: "Quantity of Implementation project" })
      .fill("6");

    await expect.element(totalOf(screen, /1,285,200\.00/)).toBeVisible();
  });

  it("taxes a new line at the rate the price book resolved, not at zero", async () => {
    const screen = await render(<Draft />);

    await addLine(screen, "Annual license (LIC-001)", "2");

    // 2 x 1,200,000 plus 19% is 2,856,000. Untaxed it would read 2,400,000 —
    // which is exactly what a line posted without `tax_rate_percent` used to
    // produce, silently (quotes §13.6 #10).
    await expect
      .element(screen.getByRole("table").getByText(/2,856,000\.00/))
      .toBeVisible();
    await expect.element(totalOf(screen, /3,498,600\.00/)).toBeVisible();
  });

  it("takes the name and the SKU from the product rather than from the form", async () => {
    const screen = await render(<Empty />);

    await addLine(screen, "Annual license (LIC-001)", "1");

    const table = screen.getByRole("table");
    await expect.element(table.getByText("Annual license")).toBeVisible();
    await expect.element(table.getByText("(LIC-001)")).toBeVisible();
  });

  it("refuses a quantity of zero and leaves the line as it was", async () => {
    const screen = await render(<Draft />);
    const quantity = screen.getByRole("spinbutton", {
      name: "Quantity of Implementation project",
    });

    await quantity.fill("0");
    await screen.getByText("Lines").click(); // blur

    await expect
      .element(screen.getByText("A quantity has to be greater than zero"))
      .toBeVisible();
    await expect.element(quantity).toHaveValue(3);
  });

  it("removes a line and retotals the document", async () => {
    const screen = await render(<Draft />);

    await screen
      .getByRole("button", {
        name: "Remove Implementation project from the quote",
      })
      .click();

    await expect
      .element(screen.getByText(/A quote with no lines cannot be issued/))
      .toBeVisible();
  });

  it("offers nothing on an issued quote and says why", async () => {
    const screen = await render(<Issued />);

    await expect
      .element(screen.getByText(/only while the quote is a draft/))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Add line" }))
      .not.toBeInTheDocument();
    await expect
      .element(
        screen.getByRole("spinbutton", {
          name: "Quantity of Implementation project",
        }),
      )
      .not.toBeInTheDocument();
  });

  it("asks for a price list before offering products", async () => {
    const screen = await render(<WithoutPriceList />);

    await expect
      .element(screen.getByText(/Choose a price list above/))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Add line" }))
      .not.toBeInTheDocument();
  });
});
