import type { Page } from "@playwright/test";

import { type CreateQuote, expect, test } from "./fixtures";

/**
 * Sending a quotation: the discount gate, the link, and the freeze
 * (docs/proposals/quotes-cpq-module.md §3.1, §4, §6.2).
 *
 * Issuing is the one irreversible step in the module, and every part of it is
 * decided by the SERVER. That is what makes it e2e work rather than unit work:
 *
 *   1. The moves offered are read from `quote_transitions`, never written out
 *      in the toolbar (§3). A component test feeds that table from a fixture,
 *      so it proves the rendering and not the graph. Here the rows come from
 *      the database, which is where a missing edge would actually bite.
 *   2. The discount gate is `quote_discount_gate()` — the same function
 *      `issue_quote_version()` calls to decide. The dialog must not enable its
 *      button for an issue the server is about to refuse, and must not refuse
 *      one the server would have accepted. Both failures need the real rule
 *      rows to show.
 *   3. The token exists exactly once, as the return value of the issue: the
 *      database keeps only its sha256 (§6.2). Nothing can look it up
 *      afterwards, so the dialog is the only place it is ever readable.
 *
 * The seeded ceilings these tests rely on: a rep may grant 10% and must write a
 * reason above 5%; an admin has no ceiling. They apply only once
 * `enforced_from` carries a date — out of the box the gate answers "no rule
 * applies", which is deliberately not the same as "satisfied".
 */
test.describe("issuing a quote", () => {
  // See quoteEditor.spec.ts: `workers: 1` and `fullyParallel: false`.
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

  const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  /**
   * Through the menu, so the auth provider clears its own session rather than
   * the test clearing storage behind its back. The trigger is the avatar,
   * named "Profile" for screen readers.
   */
  const signOut = async (page: Page) => {
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("menuitem", { name: "Logout" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  };

  /** A draft of one line — 3 × $400 — discounted by `discount` percent. */
  const draftDiscounted = (createQuote: CreateQuote, discount: number) =>
    createQuote({
      company_id: companyId,
      sales_id: repId,
      price_list_id: priceListId,
      valid_until: inDays(30),
      lines: [
        {
          product_id: productId,
          quantity: 3,
          unit_price: 400,
          discount_percent: discount,
          tax_rate_id: ivaRateId,
        },
      ],
    });

  /** The dialog's own confirm, not the toolbar button that opened it. */
  const confirmIssue = (page: Page) =>
    page.getByRole("dialog").getByRole("button", { name: "Send", exact: true });

  test.beforeEach(
    async ({
      createSales,
      createCompany,
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

      await createSales({
        first_name: "Ada",
        last_name: "Admin",
        email: "ada@doe.com",
        password: "password",
        role: "admin",
      });

      const company = await createCompany({
        name: "Ferretería del Norte",
        salesId: rep.id,
      });
      companyId = company.id;

      const iva = await taxRateByCode("iva_19");
      ivaRateId = iva.id;

      const product = await createProduct({
        sku: "KIT-A",
        name: "Kit de instalación",
        currency: "USD",
        list_price: 500,
        tax_rate_id: iva.id,
        sales_id: rep.id,
      });
      productId = product.id;

      const list = await createPriceList({
        code: "usd-2026",
        name: "USD 2026",
        currency: "USD",
        items: [{ product_id: product.id, unit_price: 400 }],
      });
      priceListId = list.id;
    },
  );

  test("a clean quote is sent, and its permanent link stays on the quote's page", async ({
    page,
    isMobile,
    createQuote,
    enforceDiscountRules,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    await enforceDiscountRules();
    const quote = await draftDiscounted(createQuote, 3);

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");

    // The button exists because `quote_transitions` carries a draft → sent edge
    // whose actor is `internal`. Nothing in the toolbar names "sent".
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText(`Send quote ${quote.quote_number}`),
    ).toBeVisible();

    // 3% is under the 5% band: no reason is asked for.
    await expect(page.getByLabel("Why this discount")).toBeHidden();
    await confirmIssue(page).click();
    await page.waitForLoadState("networkidle");

    // The quotation's permanent link, handed over right away — and, since
    // links became the quote's, still on its page once the dialog is closed.
    const url = page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Customer link" });
    await expect(url).toHaveValue(/#\/quote#[0-9a-f]{64}$/);
    const link = await url.inputValue();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("textbox", { name: "Customer link" }),
    ).toHaveValue(link);
    await expect(page.getByText("The customer sees version 1.")).toBeVisible();

    // Frozen from here: the document the customer holds has to still render
    // identically in a year. The version panel is where that is visible — the
    // draft has become an issued version, and its own row says so.
    const versionOne = page.getByRole("button", {
      name: /Version 1 . current/,
    });
    await expect(versionOne).toContainText(/Issued /);
    await expect(versionOne).not.toContainText("Draft, not issued");
  });

  test("inside the ceiling but above the band, the issue is refused until a reason is written", async ({
    page,
    isMobile,
    createQuote,
    enforceDiscountRules,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    await enforceDiscountRules();
    const quote = await draftDiscounted(createQuote, 7);

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Send", exact: true }).click();

    // 7% is inside the rep's 10% but above the 5% band. The reason lands on the
    // `sent` history row, which is what makes the discount accountable after
    // the fact — the rule this dialog used to report and never enforce
    // (§13.6 #1).
    const reason = page.getByLabel("Why this discount");
    await expect(reason).toBeVisible();
    await expect(confirmIssue(page)).toBeDisabled();

    await reason.fill("Cliente histórico, renovación a tres años.");
    await expect(confirmIssue(page)).toBeEnabled();
    await confirmIssue(page).click();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: "Customer link" }),
    ).toBeVisible();
  });

  test("the ceiling follows the person sending, not the quote", async ({
    page,
    isMobile,
    createQuote,
    enforceDiscountRules,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    await enforceDiscountRules();
    // 20%: twice the rep's ceiling, well inside an admin's.
    const quote = await draftDiscounted(createQuote, 20);

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect(
      page.getByText(/above the 10.00% allowed for you/),
    ).toBeVisible();
    // The way forward is an approval, not a longer sentence — and the override
    // field is not even offered, because a control that cannot help the person
    // looking at it only teaches them to type into it.
    await expect(
      page
        .getByRole("dialog")
        .getByText("an approval raises the ceiling", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Override the ceiling")).toBeHidden();
    await expect(confirmIssue(page)).toBeDisabled();

    // The SAME document, opened by an admin. The gate reads the role of whoever
    // would issue it, so nothing about this quote is above anybody's ceiling
    // any more. Stated as a test because the alternative reading — that the
    // ceiling belongs to the quote's owner — is the one a reader assumes.
    await page.getByRole("button", { name: "Cancel" }).click();
    await signOut(page);
    await signIn(page, "ada@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect(page.getByText(/allowed for you/)).toBeHidden();
    await expect(confirmIssue(page)).toBeEnabled();
  });

  test("revising an issued quote opens version 2 and leaves version 1 frozen", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    const quote = await draftDiscounted(createQuote, 3);
    await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Revise" }).click();
    await page
      .getByLabel("Reason")
      .fill("El cliente pidió una cantidad distinta.");
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.waitForLoadState("networkidle");

    // `revise_quote()` CLONES rather than edits: version 1 still exists, with
    // the figures the customer was shown, and the new draft is version 2. That
    // is the versioning invariant (§4), and the version panel is where a rep
    // reads it.
    await expect(
      page.getByRole("button", { name: /Version 2 . current/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Version 1/ })).toBeVisible();
  });
});
