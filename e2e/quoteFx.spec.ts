import type { Page } from "@playwright/test";

import { E2E_RATES, expect, test } from "./fixtures";

/**
 * A quotation in another currency than its price list
 * (docs/proposals/multi-currency-fx.md).
 *
 * The arithmetic is pinned elsewhere -- `fx_quotes.test.sql` on the stored
 * columns, `fxMath.test.ts` on the preview, both with the same figures. What
 * only an e2e proves is the WIRING:
 *
 *   1. the picker posts the LIST's price and currency, and the server -- not
 *      the browser -- writes the converted price (`quote_lines_fx_convert`);
 *   2. the editor shows the rate in use and the base equivalent the server
 *      computed;
 *   3. after issue a new rate changes nothing the customer holds: the
 *      document keeps its rate and its equivalent.
 */
test.describe("multi-currency quotations", () => {
  let repId: string | number;
  let companyId: string | number;
  let priceListId: string | number;

  const signIn = async (page: Page, email: string) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  const signOut = async (page: Page) => {
    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
  };

  const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  test.beforeEach(
    async ({ createSales, createCompany, createProduct, createPriceList }) => {
      const rep = await createSales({
        first_name: "Rita",
        last_name: "Rep",
        email: "rita@doe.com",
        password: "password",
        role: "rep",
      });
      repId = rep.id;
      await createSales({
        first_name: "Mara",
        last_name: "Manager",
        email: "mara@doe.com",
        password: "password",
        role: "manager",
      });

      const company = await createCompany({
        name: "Exportadora Andina",
        salesId: rep.id,
      });
      companyId = company.id;

      const product = await createProduct({
        sku: "LIC-ERP",
        name: "Licencia ERP anual",
        currency: "COP",
        list_price: 4_000_000,
        sales_id: rep.id,
      });
      const list = await createPriceList({
        code: "cop-2026",
        name: "Lista nacional",
        currency: "COP",
        items: [{ product_id: product.id, unit_price: 4_000_000 }],
      });
      priceListId = list.id;
    },
  );

  test("a COP product quoted in USD is converted by the server, and the rate is frozen at issue", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the quote editor is a desktop screen");

    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      currency: "USD",
      price_list_id: priceListId,
      valid_until: inDays(30),
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}`);

    // The draft starts at today's official rate, with its source and date.
    const panel = page.getByRole("region", { name: "Exchange rate" });
    await expect(panel.getByText("1 USD = 4,000.00 COP")).toBeVisible();

    // The picker previews the conversion; the server writes it.
    await page.getByRole("combobox", { name: "Product" }).click();
    await page.getByRole("option", { name: /Licencia ERP anual/ }).click();
    await expect(
      page.getByText(/COP \$4,000,000 → USD \$1,000\.00/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add line" }).click();

    await expect(
      page.getByText("$4,000,000 from the price list"),
    ).toBeVisible();
    const totals = page.locator("dl").filter({ hasText: "Total" }).first();
    await expect(totals.getByText("$1,000.00").last()).toBeVisible();
    await expect(totals.getByText("Equivalent in COP")).toBeVisible();
    await expect(totals.getByText("$4,000,000")).toBeVisible();

    await signOut(page);
    await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    // The rate moves after the issue: a manager enters a corrected one.
    await signIn(page, "mara@doe.com");
    await page.goto("/#/currencies?tab=rates");
    const usdRow = page.getByRole("row").filter({ hasText: "US dollar" });
    await usdRow.getByRole("button", { name: "Enter official rate" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Rate (COP per 1 USD)").fill("4500");
    await dialog.getByLabel("Reason").fill("Corrected TRM");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(usdRow.getByText("4,500.00")).toBeVisible();

    // The issued document did not follow it.
    await page.goto(`/#/quotes/${quote.id}/show`);
    const exchange = page.locator(".quote-exchange").first();
    await expect(exchange).toContainText(
      `1 USD = ${E2E_RATES.USD.toLocaleString("en-US", { minimumFractionDigits: 2 })} COP`,
    );
    await expect(exchange).toContainText("Equivalent in COP: $4,000,000");
    await expect(exchange).toContainText(
      "The contractual amounts of this quotation are those expressed in USD",
    );
  });

  test("a rep cannot set a custom rate while the tolerance is zero", async ({
    page,
    isMobile,
    createQuote,
  }) => {
    test.skip(isMobile, "the quote editor is a desktop screen");

    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      currency: "USD",
      price_list_id: priceListId,
      valid_until: inDays(30),
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}`);
    const panel = page.getByRole("region", { name: "Exchange rate" });
    await expect(panel.getByText("1 USD = 4,000.00 COP")).toBeVisible();
    await expect(
      panel.getByText("Custom rates are set by managers and administrators."),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Custom rate" }),
    ).toHaveCount(0);
  });
});
