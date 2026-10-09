import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { adminSupabase, expect, test } from "./fixtures";

/**
 * Administering outbound email: the provider page, the history, and the
 * addresses the CRM stops writing to (docs/proposals/outbound-email.md).
 *
 * e2e rather than component work for the same reason as `emailQuote.spec.ts`:
 * who may see which tab is `canAccess`, but who may READ the settings and
 * CHANGE the suppression list is row level security, and a suppressed address
 * is refused by `queue_quote_email()`. Only the real database answers those.
 * The provider is the simulated one throughout: nothing leaves.
 */
test.describe("administering outbound email", () => {
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

  test.beforeEach(async ({ createSales, createCompany, createContact }) => {
    const rep = await createSales({
      first_name: "Rita",
      last_name: "Rep",
      email: "rita@doe.com",
      password: "password",
      role: "rep",
    });
    repId = rep.id;
    await createSales({
      first_name: "Marta",
      last_name: "Manager",
      email: "marta@doe.com",
      password: "password",
      role: "manager",
    });
    await createSales({
      first_name: "Ada",
      last_name: "Admin",
      email: "ada@doe.com",
      password: "password",
      role: "admin",
    });

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

  test("an admin sends a test message and finds it in the history", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the email settings are a desktop screen");

    await signIn(page, "ada@doe.com");
    await page.goto("/#/email?tab=settings");

    // The page says what the configuration does before anything is sent.
    await expect(
      page.getByText("Simulated mode: no email leaves the CRM"),
    ).toBeVisible();

    await page.locator("#email-test-to").fill("prueba@cliente-correo.test");
    await page.getByRole("button", { name: "Send test" }).click();
    await expect(page.getByText(/no email left the CRM/)).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    const row = page
      .getByRole("row")
      .filter({ hasText: "prueba@cliente-correo.test" });
    await expect(row.getByText("Simulated, not sent")).toBeVisible();

    await row.getByRole("button", { name: "CRM test message" }).click();
    await expect(
      page.getByRole("dialog").getByText(/This is a test message from the CRM/),
    ).toBeVisible();

    const { data } = await adminSupabase
      .from("email_messages")
      .select("origin, status, accepted_at, delivered_at")
      .eq("to_email", "prueba@cliente-correo.test");
    expect(data).toEqual([
      {
        origin: "test",
        status: "simulated",
        accepted_at: null,
        delivered_at: null,
      },
    ]);
  });

  test("an address an admin suppresses can no longer be written to", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the email settings are a desktop screen");

    // Arrange: an issued quotation whose only contact is the customer.
    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      contact_id: contactId,
      currency: "COP",
      valid_until: inDays(30),
      lines: [{ name: "Servicio", quantity: 1, unit_price: 100_000 }],
    });
    const issued = await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    // Act: the admin adds the address by hand.
    await signIn(page, "ada@doe.com");
    await page.goto("/#/email?tab=suppressions");
    await expect(page.getByText("No address is suppressed.")).toBeVisible();
    await page.locator("#email-suppression-address").fill(CUSTOMER);
    await page
      .locator("#email-suppression-detail")
      .fill("Pidió no recibir correos");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Assert: listed as a hand-made entry, whatever a client might have posted.
    const row = page.getByRole("row").filter({ hasText: CUSTOMER });
    await expect(row.getByText("Added by hand")).toBeVisible();

    // And the server refuses it to the quotation's own owner.
    const asRep = createClient(
      process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
      process.env.VITE_SB_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    await asRep.auth.signInWithPassword({
      email: "rita@doe.com",
      password: "password",
    });
    const context = await asRep.rpc("email_context", {
      p_entity_type: "quote",
      p_entity_id: quote.id,
    });
    expect(context.data.recipients).toEqual([
      expect.objectContaining({ email: CUSTOMER, is_suppressed: true }),
    ]);
    const refused = await asRep.rpc("queue_quote_email", {
      p_quote_id: quote.id,
      p_version_id: issued.version_id,
      p_to_email: CUSTOMER,
      p_subject: "Cotización",
      p_body: "Hola: {{quote_link}}",
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(refused.error?.details).toBe("email_recipient_suppressed");

    // Taken off the list, it can be written to again.
    await row.getByRole("button", { name: "Take off the list" }).click();
    await expect(page.getByText("No address is suppressed.")).toBeVisible();
    const accepted = await asRep.rpc("queue_quote_email", {
      p_quote_id: quote.id,
      p_version_id: issued.version_id,
      p_to_email: CUSTOMER,
      p_subject: "Cotización",
      p_body: "Hola: {{quote_link}}",
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(accepted.error).toBeNull();
    expect(accepted.data.status).toBe("pending");
  });

  test("a manager reads the history and the list, and configures nothing", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the email settings are a desktop screen");

    await signIn(page, "marta@doe.com");
    await page.goto("/#/email");

    await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Suppressed addresses" }),
    ).toBeVisible();
    // Asserted after the tabs above rendered: an absence checked earlier
    // would pass on an empty page.
    await expect(page.getByRole("tab", { name: "Templates" })).toBeHidden();
    await expect(page.getByRole("tab", { name: "Provider" })).toBeHidden();

    await page.getByRole("tab", { name: "Suppressed addresses" }).click();
    await expect(page.getByText("No address is suppressed.")).toBeVisible();
    await expect(page.getByText("Add an address")).toBeHidden();

    // The database agrees with the screen: the settings row is not a
    // manager's to read.
    const asManager = createClient(
      process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
      process.env.VITE_SB_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    await asManager.auth.signInWithPassword({
      email: "marta@doe.com",
      password: "password",
    });
    const settings = await asManager.from("email_settings").select("id");
    expect(settings.data).toEqual([]);
  });

  test("a rep is not offered the page at all", async ({ page, isMobile }) => {
    test.skip(isMobile, "the email settings are a desktop screen");

    await signIn(page, "rita@doe.com");
    await page.goto("/#/email");

    // Sent back to the dashboard.
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole("tab", { name: "History" })).toBeHidden();
  });
});
