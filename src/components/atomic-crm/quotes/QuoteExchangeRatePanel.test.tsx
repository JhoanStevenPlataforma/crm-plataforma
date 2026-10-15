import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import {
  BaseCurrency,
  BaseWithConvertedLines,
  ExpiredCommercial,
  Issued,
  ManagerDraft,
  RepDraft,
  RepWithTolerance,
  StaleByValidity,
  StaleDraft,
} from "./QuoteExchangeRatePanel.stories";

const rateLine = (rate: string) => page.getByText(`1 USD = ${rate} COP`);

/**
 * Against the demo mirror of `set_quote_version_rate()`, not a mock: who may
 * set which rate is decided there, as the SQL function decides it, and the
 * panel must show what was actually stored.
 */
describe("QuoteExchangeRatePanel", () => {
  it("shows the rate a draft is priced at, its kind and the date it is in force", async () => {
    await render(<RepDraft />);

    await expect.element(rateLine("4,000.00")).toBeVisible();
    await expect.element(page.getByText(/^Official · /)).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Update to today's rate" }))
      .toBeVisible();
  });

  it("tells a rep without a tolerance that custom rates are a manager's, instead of offering one", async () => {
    await render(<RepDraft />);

    await expect
      .element(
        page.getByText("Custom rates are set by managers and administrators."),
      )
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Custom rate" }))
      .not.toBeInTheDocument();
  });

  it("stores a manager's custom rate with the reason, and shows it as the version's rate", async () => {
    await render(<ManagerDraft />);

    await page.getByRole("button", { name: "Custom rate" }).click();
    await page.getByLabelText("Rate (COP per 1 USD)").fill("4100");
    await page.getByLabelText("Reason").fill("Agreed with the customer's CFO");
    await page.getByRole("button", { name: "Save" }).click();

    await expect.element(rateLine("4,100.00")).toBeVisible();
    await expect
      .element(page.getByText("Custom · Agreed with the customer's CFO"))
      .toBeVisible();
  });

  it("does not let a rep save a custom rate outside the tolerance", async () => {
    await render(<RepWithTolerance />);

    await page.getByRole("button", { name: "Custom rate" }).click();
    await page.getByLabelText("Rate (COP per 1 USD)").fill("4200"); // +5%
    await page.getByLabelText("Reason").fill("Customer asked");

    await expect
      .element(page.getByRole("button", { name: "Save" }))
      .toBeDisabled();

    await page.getByLabelText("Rate (COP per 1 USD)").fill("4040"); // +1%
    await expect
      .element(page.getByRole("button", { name: "Save" }))
      .toBeEnabled();
  });

  it("warns that a stale rate must be refreshed, and refreshing takes today's rate", async () => {
    await render(<StaleDraft />);

    await expect.element(rateLine("3,900.00")).toBeVisible();
    await expect
      .element(page.getByText("Stale", { exact: true }))
      .toBeVisible();

    await page.getByRole("button", { name: "Update to today's rate" }).click();

    await expect.element(rateLine("4,000.00")).toBeVisible();
    await expect
      .element(page.getByText("Stale", { exact: true }))
      .not.toBeInTheDocument();
  });

  it("offers nothing on an issued version: the rate is frozen with it", async () => {
    await render(<Issued />);

    await expect
      .element(page.getByText("Frozen with the version when it was issued."))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Custom rate" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Update to today's rate" }))
      .not.toBeInTheDocument();
  });

  it("says no conversion is needed for a quotation in the base currency", async () => {
    await render(<BaseCurrency />);

    await expect
      .element(page.getByText("Quoted in the base currency: no conversion."))
      .toBeVisible();
  });

  // One staleness rule (fx_rate_is_stale): the panel used to judge a rate it
  // still used by the view's flag or by age alone, and never a commercial one.
  it("calls a rate stale once the validity its source states has passed, however young", async () => {
    await render(<StaleByValidity />);

    await expect.element(rateLine("3,300.00")).toBeVisible();
    await expect
      .element(page.getByText("Stale", { exact: true }))
      .toBeVisible();
  });

  it("calls an expired commercial rate stale, as the issue gate refuses it", async () => {
    await render(<ExpiredCommercial />);

    await expect.element(rateLine("4,100.00")).toBeVisible();
    await expect
      .element(page.getByText("Stale", { exact: true }))
      .toBeVisible();
  });

  it("shows the TRM a base quotation's USD lines were converted at, and re-prices them at today's", async () => {
    await render(<BaseWithConvertedLines />);

    await expect.element(rateLine("3,300.00")).toBeVisible();
    await expect
      .element(page.getByText("Stale", { exact: true }))
      .toBeVisible();

    await page
      .getByRole("button", { name: "Update list prices to today's rate" })
      .click();

    await expect.element(rateLine("3,400.00")).toBeVisible();
    await expect
      .element(page.getByText("Stale", { exact: true }))
      .not.toBeInTheDocument();
  });
});
