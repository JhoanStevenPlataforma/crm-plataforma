import type { Page } from "@playwright/test";

import { type CreateQuote, expect, type IssueQuote, test } from "./fixtures";

/**
 * The customer portal (docs/proposals/quotes-cpq-module.md §6, §9, §13.6 #13).
 *
 * This is the one screen in the CRM that runs with NO session, against an edge
 * function rather than the data provider, outside the app's layout — and every
 * one of those three is a thing only an e2e can exercise:
 *
 *   1. There is no session and there must not be one. No policy in this repo
 *      grants `anon`, so the page is served by `quote-portal`, which holds the
 *      service role; the token in the request body is the whole credential.
 *      A component test hands the page a stub client and proves none of it.
 *   2. THE TOKEN TRAVELS IN THE FRAGMENT. `/#/quote#<token>` — a browser never
 *      sends a fragment to any server, which is what keeps the token out of
 *      access logs. Only a real browser on a real URL can show that the page
 *      still finds it there.
 *   3. `useConfigurationLoader()` runs only in `layout/Layout.tsx`, and this is
 *      a `noLayout` route. So the page renders with `defaultConfiguration`,
 *      whose currency is USD, and everything it prints — the money above all —
 *      has to come from the SERVER payload instead. This spec quotes in EUR
 *      for exactly that reason: `narrowSymbol` renders the default as `$` and
 *      the payload's as `€`, so a page that fell back to the configuration
 *      would be caught by the symbol rather than silently agreeing.
 *
 * The answer is then read back inside the CRM, because a customer's acceptance
 * that the team cannot see is not an acceptance.
 */
test.describe("quote portal", () => {
  // See quoteEditor.spec.ts: `workers: 1` and `fullyParallel: false`.
  let repId: string | number;
  let companyId: string | number;
  let productId: string | number;
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

      const company = await createCompany({
        name: "Ferretería del Norte",
        salesId: rep.id,
      });
      companyId = company.id;

      // EUR, deliberately: see the header comment. A document that printed
      // `defaultConfiguration`'s USD would be a quotation for a different
      // amount of money than the one the database holds.
      const product = await createProduct({
        sku: "KIT-A",
        name: "Kit de instalación",
        currency: "EUR",
        list_price: 1_500_000,
        sales_id: rep.id,
      });
      productId = product.id;

      const list = await createPriceList({
        code: "eur-2026",
        name: "EUR 2026",
        currency: "EUR",
        items: [{ product_id: product.id, unit_price: 1_200_000 }],
      });
      priceListId = list.id;
    },
  );

  /** An issued quotation and the one copy of its customer link. */
  const issuedQuote = async ({
    createQuote,
    issueQuote,
  }: {
    createQuote: CreateQuote;
    issueQuote: IssueQuote;
  }) => {
    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      currency: "EUR",
      price_list_id: priceListId,
      title: "Renovación anual",
      valid_until: inDays(30),
      lines: [{ product_id: productId, quantity: 2, unit_price: 1_200_000 }],
    });

    const link = await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    return { quote, token: link.token };
  };

  test("the customer opens the link and reads the document in its own currency", async ({
    page,
    createQuote,
    issueQuote,
  }) => {
    const { quote, token } = await issuedQuote({ createQuote, issueQuote });

    // No sign-in above this line, and none below it: the context is fresh.
    await page.goto(`/#/quote#${token}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(quote.quote_number)).toBeVisible();
    await expect(page.getByText("Kit de instalación")).toBeVisible();

    // 2 × €1,200,000. The SYMBOL is the assertion, not the digits: `$` here
    // would mean the page had fallen back to `defaultConfiguration` instead of
    // reading the currency off the payload.
    await expect(
      page.getByRole("cell", { name: "€2,400,000.00" }).first(),
    ).toBeVisible();

    // And the page carries none of the application around it: a `noLayout`
    // route has no navigation, which is what keeps a customer link from being
    // a door into the CRM.
    await expect(page.getByRole("link", { name: "Quotes" })).toBeHidden();
  });

  test("opening the link is the customer's view, and the team sees it", async ({
    page,
    createQuote,
    issueQuote,
  }) => {
    const { quote, token } = await issuedQuote({ createQuote, issueQuote });

    await page.goto(`/#/quote#${token}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(quote.quote_number)).toBeVisible();

    // The portal cannot tell a rep from the customer — it has no session, on
    // purpose — so every open is recorded and a `sent` quote becomes `viewed`
    // (§13.6 #13). That move is made by the SERVER through the status machine,
    // with `allowed_actor = 'customer'`: no button in the CRM can produce it,
    // which is what makes this the only place it can be observed.
    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Viewed", { exact: true })).toBeVisible();
  });

  test("the customer accepts, and the team reads who answered and for how much", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    const { quote, token } = await issuedQuote({ createQuote, issueQuote });

    await page.goto(`/#/quote#${token}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Accept" }).click();
    // Scoped to the dialog: the comment form below the document has an email
    // field of its own.
    const acceptDialog = page.getByRole("dialog");
    await acceptDialog.getByLabel("Full name").fill("Carmen Pérez");
    await acceptDialog.getByLabel("Email address").fill("carmen@ferreteria.co");
    // The confirmation is a separate act from filling the form: an acceptance
    // nobody ticked is a click, not an agreement.
    await acceptDialog.getByLabel("I accept this quotation as issued").click();
    await acceptDialog
      .getByRole("button", { name: "Accept quotation" })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Your acceptance has been recorded", { exact: false }),
    ).toBeVisible();

    // A second answer on the same version is refused: `quote_portal_accept()`
    // serialises on the QUOTE, so two links to one version cannot both answer.
    await expect(page.getByRole("button", { name: "Accept" })).toBeHidden();

    test.skip(isMobile, "the answer panel is a desktop screen");

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");

    // The evidence, where the team can read it: who signed, and against which
    // version and figure. `accepted_by_name` is written onto the version; the
    // rest of the evidence lives on the portal event trail.
    await expect(page.getByText("Customer's answer")).toBeVisible();
    // Exact: the document itself also carries "Accepted on … by Carmen Pérez",
    // and matching either would not say which one was found.
    await expect(page.getByText("Carmen Pérez", { exact: true })).toBeVisible();
    await expect(page.getByText("carmen@ferreteria.co")).toBeVisible();
    await expect(page.getByText("Clicked on the customer page")).toBeVisible();
  });

  test("the customer writes, and the message reaches the team's thread", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the quote page is a desktop screen");

    const { quote, token } = await issuedQuote({ createQuote, issueQuote });

    await page.goto(`/#/quote#${token}`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Your message").fill("¿Incluye la instalación?");
    await page.getByLabel("Your name").fill("Carmen Pérez");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("¿Incluye la instalación?")).toBeVisible();

    // Written through `quote_portal_comment()` by a caller with no session, and
    // read back inside the CRM through RLS: the two halves of the thread are
    // different code paths onto the same table, which is exactly the seam a
    // unit test on either side cannot cover.
    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("¿Incluye la instalación?")).toBeVisible();
    await expect(page.getByText("Carmen Pérez")).toBeVisible();
  });
});
