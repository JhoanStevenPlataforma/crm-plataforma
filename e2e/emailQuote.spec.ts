import type { Page } from "@playwright/test";

import { adminSupabase, expect, test } from "./fixtures";

/**
 * Sending a quotation by email (docs/proposals/outbound-email.md).
 *
 * Every rule here is the SERVER's, which is what makes it e2e work: which
 * version may be shared comes from `email_context()`, the message is written
 * by `queue_quote_email()`, and it is sent by the `email-dispatch` edge
 * function -- on the SIMULATED provider, the default, so this suite can never
 * send a real email. What a component test cannot show is the whole chain: the
 * dialog, the queue, the dispatcher, and the row it leaves.
 */
test.describe("sending a quotation by email", () => {
  // See quoteEditor.spec.ts: `workers: 1` and `fullyParallel: false`.
  const CUSTOMER = "ana.compras@cliente-correo.test";
  let repId: string | number;
  let companyId: string | number;
  let contactId: string | number;

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

  /** Everything a send must leave alone, read as the service role. */
  const quoteState = async (quoteId: string | number) => {
    const [quote, versions, lines, changes] = await Promise.all([
      adminSupabase.from("quotes").select("*").eq("id", quoteId).single(),
      adminSupabase
        .from("quote_versions")
        .select("*")
        .eq("quote_id", quoteId)
        .order("id"),
      adminSupabase
        .from("quote_lines")
        .select("*")
        .eq("quote_id", quoteId)
        .order("id"),
      adminSupabase
        .from("quote_status_changes")
        .select("id")
        .eq("quote_id", quoteId),
    ]);
    return JSON.stringify([
      quote.data,
      versions.data,
      lines.data,
      changes.data?.length,
    ]);
  };

  test.beforeEach(async ({ createSales, createCompany, createContact }) => {
    const rep = await createSales({
      first_name: "Rita",
      last_name: "Rep",
      email: "rita@doe.com",
      password: "password",
      role: "rep",
    });
    repId = rep.id;

    const company = await createCompany({
      name: "Cliente Correo",
      salesId: rep.id,
    });
    companyId = company.id;

    const contact = await createContact({
      first_name: "Ana",
      last_name: "Compras",
      company_id: company.id,
      sales_id: rep.id,
      emails: [CUSTOMER],
    });
    contactId = contact.id;
  });

  test("an issued quotation is sent to its contact, and nothing about it changes", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    // Arrange
    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      contact_id: contactId,
      currency: "COP",
      title: "Instalación",
      valid_until: inDays(30),
      lines: [
        { name: "Servicio de instalación", quantity: 2, unit_price: 150_000 },
      ],
    });
    const issued = await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });
    const before = await quoteState(quote.id);

    // Act
    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.getByRole("button", { name: "Send by email" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Send the quotation by email")).toBeVisible();
    // The page is honest about the provider before anything is sent.
    await expect(dialog.getByText(/Simulated mode/)).toBeVisible();
    // Prefilled from the server's context: the contact, and the template with
    // the figures of the issued version.
    await expect(dialog.getByLabel("Subject")).toHaveValue(
      new RegExp(quote.quote_number),
    );
    await expect(dialog.getByLabel("Message")).toHaveValue(
      /\{\{quote_link\}\}/,
    );
    await expect(dialog.getByLabel("Message")).toHaveValue(/300,000\.00 COP/);
    await expect(dialog.getByRole("combobox", { name: "To" })).toContainText(
      CUSTOMER,
    );
    // A rep chooses among the record's addresses: there is no free one.
    await expect(
      dialog.getByText(/A manager can use another address/),
    ).toBeVisible();

    await dialog.getByRole("tab", { name: "Preview" }).click();
    await expect(dialog.locator("iframe")).toBeVisible();

    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    // Assert
    await expect(dialog.getByText("Simulated, not sent")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByRole("dialog")).toBeHidden();
    // The history on the quotation's page.
    await expect(
      page.getByRole("button", { name: new RegExp(quote.quote_number) }),
    ).toBeVisible();

    const { data: messages } = await adminSupabase
      .from("email_messages")
      .select("*")
      .eq("quote_id", quote.id);
    expect(messages).toHaveLength(1);
    expect(messages![0]).toMatchObject({
      status: "simulated",
      provider_key: "mock",
      to_email: CUSTOMER,
      quote_version_id: issued.version_id,
      entity_type: "quote",
      accepted_at: null,
      delivered_at: null,
    });
    // The customer link was sent, not stored.
    expect(JSON.stringify(messages![0])).not.toContain(issued.token);
    expect(await quoteState(quote.id)).toBe(before);
  });

  test("a quotation that was never issued offers nothing to send", async ({
    page,
    isMobile,
    createQuote,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      contact_id: contactId,
      currency: "COP",
      valid_until: inDays(30),
      lines: [{ name: "Servicio", quantity: 1, unit_price: 100_000 }],
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);

    // Something positive from the same panel first: an absence asserted
    // before the page rendered would pass for the wrong reason.
    await expect(page.getByText("No emails sent yet.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send by email" }),
    ).toBeHidden();
    const { data } = await adminSupabase
      .from("quotes")
      .select("status_key")
      .eq("id", quote.id)
      .single();
    expect(data?.status_key).toBe("draft");
  });

  test("a quotation under revision says why it cannot be sent", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the quote screens are desktop screens");

    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      contact_id: contactId,
      currency: "COP",
      valid_until: inDays(30),
      lines: [{ name: "Servicio", quantity: 1, unit_price: 100_000 }],
    });
    await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    await page.getByRole("button", { name: "Revise" }).click();
    await page.getByLabel("Reason").fill("El cliente pidió otro alcance.");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Send by email" }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByText(/A revision is in progress/)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Send", exact: true }),
    ).toBeDisabled();
  });
});
