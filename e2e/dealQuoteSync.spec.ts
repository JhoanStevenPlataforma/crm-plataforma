import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The pipeline follows its quotations, end to end: a quotation raised against
 * a deal is issued (the deal moves to "Proposal Sent" and takes the quote's
 * total), the customer opens the link and writes back ("In Negotiation"), then
 * accepts ("Won"). Every step lands in the deal's history with the quotation
 * as its cause. A deal a person closed is never reopened.
 *
 * Only an e2e proves the chain: the issue runs as the rep, the portal steps as
 * nobody (the edge function holds the service role), and each one reaches the
 * deal through the database triggers, not through any screen.
 */

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

/** The board column a deal card sits in. */
const column = (page: Page, stage: string) =>
  page.locator(`[data-rfd-droppable-id="${stage}"]`);

test.describe("the pipeline follows its quotations", () => {
  let repId: string | number;
  let companyId: string | number;

  test.beforeEach(async ({ createSales, createCompany }) => {
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
  });

  test("issuing, the customer's comment and the acceptance walk the deal to Won", async ({
    page,
    isMobile,
    createDeal,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the pipeline board is a desktop screen");

    const deal = await createDeal({
      name: "Renovación de licencias",
      company_id: companyId,
      sales_id: repId,
      stage: "opportunity",
      amount: 0,
    });
    const quote = await createQuote({
      company_id: companyId,
      deal_id: deal.id,
      sales_id: repId,
      currency: "EUR",
      title: "Renovación anual",
      valid_until: inDays(30),
      lines: [{ name: "Soporte anual", quantity: 2, unit_price: 1500 }],
    });
    const link = await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    // 1. Sent: the proposal column, with the quotation on the card.
    await signIn(page, "rita@doe.com");
    await page.goto("/#/deals");
    const proposal = column(page, "proposal-sent");
    await expect(proposal.getByText("Renovación de licencias")).toBeVisible();
    await expect(proposal.getByText(quote.quote_number)).toBeVisible();
    await signOut(page);

    // 2. The customer opens the link and writes back.
    await page.goto("about:blank");
    await page.goto(`/#/quote#${link.token}`);
    await page.getByLabel("Your message").fill("¿Incluye la instalación?");
    await page.getByLabel("Your name").fill("Carmen Pérez");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("¿Incluye la instalación?")).toBeVisible();

    // 3. And accepts.
    await page.getByRole("button", { name: "Accept" }).click();
    const acceptDialog = page.getByRole("dialog");
    await acceptDialog.getByLabel("Full name").fill("Carmen Pérez");
    await acceptDialog.getByLabel("Email address").fill("carmen@ferreteria.co");
    await acceptDialog.getByLabel("I accept this quotation as issued").click();
    await acceptDialog
      .getByRole("button", { name: "Accept quotation" })
      .click();
    await expect(
      page.getByText("Your acceptance has been recorded", { exact: false }),
    ).toBeVisible();

    // 4. The team sees the deal won, at the quotation's total, and why.
    await signIn(page, "rita@doe.com");
    await page.goto("/#/deals");
    await expect(
      column(page, "won").getByText("Renovación de licencias"),
    ).toBeVisible();

    await page.goto(`/#/deals/${deal.id}/show`);
    await expect(page.getByText("3,000").first()).toBeVisible();
    for (const step of [
      "Moved automatically: the quotation was sent",
      "Moved automatically: the customer wrote back",
      "Moved automatically: the customer accepted the quotation",
    ]) {
      await expect(page.getByText(step)).toBeVisible();
    }
    await expect(
      page.getByText("The customer wrote back", { exact: true }),
    ).toBeVisible();
  });

  test("a deal closed by hand is not reopened by a new quotation", async ({
    page,
    isMobile,
    createDeal,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the pipeline board is a desktop screen");

    const deal = await createDeal({
      name: "Perdida en marzo",
      company_id: companyId,
      sales_id: repId,
      stage: "lost",
      amount: 10,
    });
    const quote = await createQuote({
      company_id: companyId,
      deal_id: deal.id,
      sales_id: repId,
      currency: "EUR",
      valid_until: inDays(30),
      lines: [{ name: "Soporte anual", quantity: 1, unit_price: 900 }],
    });
    await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    await signIn(page, "rita@doe.com");
    await page.goto("/#/deals");
    await expect(
      column(page, "lost").getByText("Perdida en marzo"),
    ).toBeVisible();
    await expect(
      column(page, "proposal-sent").getByText("Perdida en marzo"),
    ).toBeHidden();
  });
});
