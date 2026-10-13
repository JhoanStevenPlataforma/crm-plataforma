import type { Page } from "@playwright/test";

import { adminSupabase, expect, test } from "./fixtures";

/**
 * Mail the CRM sends by itself (docs/proposals/outbound-email.md).
 *
 * e2e because the path crosses everything a component test fakes: an
 * administrator switches a rule on a screen, a CUSTOMER accepts on the portal
 * (through the `quote-portal` function, with nobody signed in), a trigger
 * queues the confirmation, and the real `email-dispatch` function fills the
 * stored template and settles it. The provider is the simulated one: nothing
 * leaves.
 */
test.describe("email automations", () => {
  // See quoteEditor.spec.ts: `workers: 1` and `fullyParallel: false`.
  const SIGNER = "carmen@ferreteria.co";
  let repId: string | number;
  let companyId: string | number;

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

  /** What pg_cron does every minute: the dispatcher, with the service key. */
  const runScheduler = async () => {
    const { data, error } = await adminSupabase.functions.invoke(
      "email-dispatch",
      { body: { trigger: "cron" } },
    );
    expect(error).toBeNull();
    return data as { data: { claimed: number; simulated: number } };
  };

  const acceptOnPortal = async (page: Page, token: string) => {
    await page.goto(`/#/quote#${token}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Accept" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Carmen Pérez");
    await dialog.getByLabel("Email address").fill(SIGNER);
    await dialog.getByLabel("I accept this quotation as issued").click();
    await dialog.getByRole("button", { name: "Accept quotation" }).click();
    await expect(
      page.getByText("Your acceptance has been recorded", { exact: false }),
    ).toBeVisible();
  };

  test.beforeEach(async ({ createSales, createCompany }) => {
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
      name: "Ferretería del Norte",
      salesId: rep.id,
    });
    companyId = company.id;
  });

  test("an admin switches the confirmation on, and an accepting customer is written to", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the email settings are a desktop screen");

    // Arrange: an issued quotation, and the rule still off as it is seeded.
    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      currency: "COP",
      valid_until: inDays(30),
      lines: [{ name: "Servicio", quantity: 1, unit_price: 100_000 }],
    });
    const issued = await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    // Act: the administrator switches the confirmation on.
    await signIn(page, "ada@doe.com");
    await page.goto("/#/email?tab=automations");
    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Acceptance confirmation" });
    await card.getByLabel("State").click();
    await page.getByRole("option", { name: "On", exact: true }).click();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("The automation was saved")).toBeVisible();

    const { data: rule } = await adminSupabase
      .from("email_automations")
      .select("state, updated_by")
      .eq("key", "quote_accepted")
      .single();
    expect(rule?.state).toBe("enabled");
    expect(rule?.updated_by).not.toBeNull();

    // The customer accepts, signed in as nobody.
    await page.evaluate(() => window.localStorage.clear());
    await acceptOnPortal(page, issued.token);

    // Assert: one confirmation is waiting, as the template, to the signer.
    const queued = await adminSupabase
      .from("email_messages")
      .select("id, origin, automation_key, status, to_email, sales_id, subject")
      .eq("quote_id", quote.id);
    expect(queued.data).toHaveLength(1);
    expect(queued.data?.[0]).toMatchObject({
      origin: "automation",
      automation_key: "quote_accepted",
      status: "pending",
      to_email: SIGNER,
      sales_id: repId,
    });
    expect(queued.data?.[0].subject).toContain("{{quote_number}}");

    // The scheduler's tick sends it: filled, through the simulated provider.
    const tick = await runScheduler();
    expect(tick.data).toMatchObject({ claimed: 1, simulated: 1 });

    const { data: sent } = await adminSupabase
      .from("email_messages")
      .select("status, error_code")
      .eq("quote_id", quote.id)
      .single();
    expect(sent).toEqual({ status: "simulated", error_code: null });

    // The team reads it on the quotation, filled, and never as braces.
    await signIn(page, "rita@doe.com");
    await page.goto(`/#/quotes/${quote.id}/show`);
    const number = String(
      (
        await adminSupabase
          .from("quotes")
          .select("quote_number")
          .eq("id", quote.id)
          .single()
      ).data?.quote_number,
    );
    await expect(
      page
        .getByRole("button", {
          name: `Confirmación de aceptación: cotización ${number}`,
        })
        .first(),
    ).toBeVisible();
    await expect(page.getByText("{{quote_number}}")).toHaveCount(0);
  });

  test("a rule left off writes to nobody, and a manager can only read it", async ({
    page,
    isMobile,
    createQuote,
    issueQuote,
  }) => {
    test.skip(isMobile, "the email settings are a desktop screen");

    const quote = await createQuote({
      company_id: companyId,
      sales_id: repId,
      currency: "COP",
      valid_until: inDays(30),
      lines: [{ name: "Servicio", quantity: 1, unit_price: 100_000 }],
    });
    const issued = await issueQuote({
      quote_id: quote.id,
      email: "rita@doe.com",
      password: "password",
    });

    await acceptOnPortal(page, issued.token);

    const { data: messages } = await adminSupabase
      .from("email_messages")
      .select("id")
      .eq("quote_id", quote.id);
    expect(messages).toEqual([]);

    // The manager reads how the rules are set and is offered nothing to save.
    await signIn(page, "marta@doe.com");
    await page.goto("/#/email?tab=automations");
    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Quotation follow-up" });
    await expect(card.getByLabel("State")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    // And the database agrees, whatever the screen offers.
    const { createClient } = await import("@supabase/supabase-js");
    const asManager = createClient(
      process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
      process.env.VITE_SB_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    await asManager.auth.signInWithPassword({
      email: "marta@doe.com",
      password: "password",
    });
    await asManager
      .from("email_automations")
      .update({ state: "enabled" })
      .eq("key", "quote_followup");
    const { data: rule } = await adminSupabase
      .from("email_automations")
      .select("state")
      .eq("key", "quote_followup")
      .single();
    expect(rule?.state).toBe("disabled");
  });
});
