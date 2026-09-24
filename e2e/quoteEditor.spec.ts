import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Raising a quotation against a deal, and the lines it is made of
 * (docs/proposals/quotes-cpq-module.md §2.4, §4, §13.2).
 *
 * The arithmetic is not what this proves — `quoteMath.test.ts` checks the folds
 * against values read out of the database, and the generated columns are pinned
 * by pgTAP. What only an e2e can prove is the WIRING between them, and three
 * pieces of it fail silently everywhere else:
 *
 *   1. The line editor reads `price_book`, not `products`. The view is a cross
 *      join of a price list with what it prices; a product with no price row,
 *      or one in another currency, is absent from it on purpose. A fake
 *      provider emulates the view in the browser, so only a real database can
 *      say whether the picker offers what the list actually holds.
 *   2. THE SERVER FILLS THE SNAPSHOT. A line is posted short — version,
 *      product, quantity, price, rate — and `quote_lines_snapshot_defaults`
 *      fills `sku`, `name`, `unit` and `tax_rate_percent` on the way in
 *      (§13.6 #10). If that trigger stopped firing, the line would be taxed at
 *      0% in silence, which is the exact bug Phase 4 closed.
 *   3. `valid_until` and `terms` belong to the draft VERSION; the copies on
 *      `quotes` are a server-kept mirror that refuses a changed value
 *      (`quote_header_derived`). The data provider routes them to the draft so
 *      the form can stay declarative — a routing that exists only between the
 *      provider and the trigger, so no unit test on either side sees it.
 */
test.describe("quote editor", () => {
  /**
   * The ids `beforeEach` just created. Module scope is safe here and nowhere
   * else in this repo's specs: `playwright.config.ts` pins `workers: 1` and
   * `fullyParallel: false`, so one test at a time reads them.
   */
  let repId: string | number;
  let companyId: string | number;
  let productId: string | number;
  let priceListId: string | number;
  let ivaRateId: number;

  const signIn = async (page: Page, email: string) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  /** A date the editor will accept: it refuses one already past. */
  const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  test.beforeEach(
    async ({
      createSales,
      createCompany,
      createDeal,
      createProduct,
      createPriceList,
      taxRateByCode,
    }) => {
      const rep = await createSales({
        first_name: "Rita",
        last_name: "Rep",
        email: "rita@doe.com",
        password: "password",
        role: "rep",
      });
      repId = rep.id;

      const company = await createCompany({
        name: "Ferretería del Norte",
        salesId: rep.id,
      });
      companyId = company.id;

      await createDeal({
        name: "Renovación anual",
        company_id: company.id,
        sales_id: rep.id,
      });

      // A real rate, read from the seeded catalogue rather than invented: the
      // percentage a line freezes is the one the server resolves from it.
      const iva = await taxRateByCode("iva_19");
      ivaRateId = iva.id;

      const priced = await createProduct({
        sku: "KIT-A",
        name: "Kit de instalación",
        currency: "USD",
        list_price: 500,
        tax_rate_id: iva.id,
        sales_id: rep.id,
      });
      productId = priced.id;

      // Deliberately NOT priced into the list below. `price_book` is what the
      // picker reads, and a product in another currency with no override is
      // absent from it — a silent currency mismatch is worse than a missing
      // row.
      await createProduct({
        sku: "EUR-ONLY",
        name: "Servicio europeo",
        currency: "EUR",
        list_price: 300,
        sales_id: rep.id,
      });

      const list = await createPriceList({
        code: "usd-2026",
        name: "USD 2026",
        currency: "USD",
        items: [{ product_id: priced.id, unit_price: 400 }],
      });
      priceListId = list.id;
    },
  );

  test("a quote raised from a deal arrives with the deal and the company filled in", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the quote editor is a desktop screen");

    await signIn(page, "rita@doe.com");

    await page.goto("/#/deals");
    await page.waitForLoadState("networkidle");
    await page.getByText("Renovación anual").first().click();
    await page.waitForLoadState("networkidle");

    // The panel is on every deal, and its link carries the deal, the company
    // and the deal's name through `?source=` — which is the whole point of
    // raising a quote from here rather than from the list.
    await page.getByRole("link", { name: "New quote" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Title")).toHaveValue("Renovación anual");
    await expect(page.getByLabel("Company *")).toContainText(
      "Ferretería del Norte",
    );
  });

  test("a line posted short comes back with the snapshot the server filled", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the quote editor is a desktop screen");

    await signIn(page, "rita@doe.com");

    await page.goto("/#/quotes/create");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Company *").click();
    await page.getByRole("option", { name: "Ferretería del Norte" }).click();
    await page.getByLabel("Price list *").click();
    await page.getByRole("option", { name: "USD 2026 (USD)" }).click();
    await page.getByLabel("Valid until").fill(inDays(30));
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    // Saving lands on the editor, because a quote with no lines is not a
    // document yet.
    await expect(page.getByText("No lines yet")).toBeVisible();

    // The picker offers what the LIST prices, and says nothing about the EUR
    // product that has no row in it.
    await page.getByLabel("Product", { exact: true }).click();
    await expect(
      page.getByRole("option", { name: "Servicio europeo (EUR-ONLY)" }),
    ).toBeHidden();
    await page
      .getByRole("option", { name: "Kit de instalación (KIT-A)" })
      .click();
    await page.getByLabel("Quantity", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.waitForLoadState("networkidle");

    // None of this was posted. `sku` and `name` come from the product and the
    // 19% from `tax_rate_id`, filled by `quote_lines_snapshot_defaults`; the
    // price is the LIST's $400, not the product's own $500. A line that reached
    // the table without the percentage used to be taxed at 0% in silence, so
    // reading it back off the row is the assertion that matters.
    await expect(page.getByText("Kit de instalación")).toBeVisible();
    await expect(page.getByText("(KIT-A)")).toBeVisible();
    await expect(
      page.getByLabel("Unit price of Kit de instalación"),
    ).toHaveValue("400");
    await expect(page.getByText("19%")).toBeVisible();

    // 3 × 400 = 1200, tax 19% = 228, total 1428. Read off the totals block
    // rather than the page: the single-line document repeats the same figures
    // in its row, and a locator that matched either would not say which one it
    // found.
    const totals = page.locator("dl");
    await expect(totals.getByText("$1,200.00")).toBeVisible();
    await expect(totals.getByText("$228.00")).toBeVisible();
    await expect(totals.getByText("$1,428.00")).toBeVisible();
  });

  test("a discount typed on a line changes the tax base, not only the total", async ({
    page,
    isMobile,
    createQuote,
  }) => {
    test.skip(isMobile, "the quote editor is a desktop screen");

    // Built through the factory: what is under test is editing an existing
    // line, and driving the creation a second time would only make a failure
    // ambiguous about which half broke.
    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      price_list_id: priceListId,
      valid_until: inDays(30),
      lines: [
        {
          product_id: productId,
          quantity: 3,
          unit_price: 400,
          tax_rate_id: ivaRateId,
        },
      ],
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}`);
    await page.waitForLoadState("networkidle");

    const discount = page.getByLabel("Discount on Kit de instalación");
    await discount.fill("10");
    // Committed on BLUR, never on every keystroke: saving "1" on the way to
    // "10" would write a document the rep never meant.
    await discount.blur();
    await page.waitForLoadState("networkidle");

    // 3 × 400 = 1200, less 10% leaves 1080 TAXABLE, and 19% of that is 205.20.
    // The subtotal staying at the gross and the discount getting its own row is
    // what makes this bite: a discount applied to the total instead of to the
    // base would land on the same grand total by a coincidence of arithmetic.
    const totals = page.locator("dl");
    await expect(totals.getByText("Discount (10.00%)")).toBeVisible();
    await expect(totals.getByText("- $120.00")).toBeVisible();
    await expect(totals.getByText("$205.20")).toBeVisible();
    await expect(totals.getByText("$1,285.20")).toBeVisible();
  });

  test("the validity edited on the header lands on the draft version", async ({
    page,
    isMobile,
    createQuote,
  }) => {
    test.skip(isMobile, "the quote editor is a desktop screen");

    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      price_list_id: priceListId,
      valid_until: inDays(10),
      lines: [
        {
          product_id: productId,
          quantity: 1,
          unit_price: 400,
          tax_rate_id: ivaRateId,
        },
      ],
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}`);
    await page.waitForLoadState("networkidle");

    // `quotes_header_guard` refuses a changed `valid_until` on the header with
    // `quote_header_derived`; the value belongs to the draft version, and the
    // data provider is what routes it there. If that routing broke, this save
    // would come back as an error — so the reload is the assertion.
    const newDate = inDays(45);
    await page.getByLabel("Valid until").fill(newDate);
    await page.getByLabel("Terms").fill("Pago a 30 días.");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await page.goto(`/#/quotes/${quote.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Valid until")).toHaveValue(newDate);
    await expect(page.getByLabel("Terms")).toHaveValue("Pago a 30 días.");
  });
});
