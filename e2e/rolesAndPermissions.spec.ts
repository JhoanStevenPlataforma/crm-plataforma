import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * End-to-end proof that row level security actually isolates the data.
 *
 * The unit tests cover `canAccess`, which only decides what the UI renders.
 * These specs sign in as real users and assert what the database hands back,
 * which is the boundary that matters.
 */

const signIn = async (page: Page, email: string) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveTitle(/Atomic CRM/);
};

test.describe("roles and permissions", () => {
  test.beforeEach(async ({ createSales, createContact, createLead }) => {
    const manager = await createSales({
      first_name: "Marta",
      last_name: "Manager",
      email: "manager@test.com",
      password: "password",
      role: "manager",
    });

    const repA = await createSales({
      first_name: "Rita",
      last_name: "RepA",
      email: "repa@test.com",
      password: "password",
      role: "rep",
    });

    const repB = await createSales({
      first_name: "Raul",
      last_name: "RepB",
      email: "repb@test.com",
      password: "password",
      role: "rep",
    });

    await createContact({
      first_name: "Owned",
      last_name: "ByRepA",
      sales_id: repA.id,
    });
    await createContact({
      first_name: "Owned",
      last_name: "ByRepB",
      sales_id: repB.id,
    });
    await createContact({
      first_name: "Owned",
      last_name: "ByManager",
      sales_id: manager.id,
    });

    await createLead({
      first_name: "Lead",
      last_name: "ForRepA",
      company_name: "Prospect A",
      sales_id: repA.id,
    });
    await createLead({
      first_name: "Lead",
      last_name: "ForRepB",
      company_name: "Prospect B",
      sales_id: repB.id,
    });
  });

  test("a sales rep only sees the contacts they own", async ({ page }) => {
    await signIn(page, "repa@test.com");
    await page.goto("/#/contacts");

    await expect(page.getByText("Owned ByRepA")).toBeVisible();
    await expect(page.getByText("Owned ByRepB")).not.toBeVisible();
    await expect(page.getByText("Owned ByManager")).not.toBeVisible();
  });

  test("a sales manager sees every contact", async ({ page }) => {
    await signIn(page, "manager@test.com");
    await page.goto("/#/contacts");

    await expect(page.getByText("Owned ByRepA")).toBeVisible();
    await expect(page.getByText("Owned ByRepB")).toBeVisible();
    await expect(page.getByText("Owned ByManager")).toBeVisible();
  });

  test("Leads has its own section in the main navigation", async ({ page }) => {
    await signIn(page, "repa@test.com");

    await page.getByRole("link", { name: "Leads" }).click();
    await expect(page).toHaveURL(/#\/leads/);
    await expect(page.getByText("Lead ForRepA")).toBeVisible();
  });

  test("a sales rep only sees the leads they own", async ({ page }) => {
    await signIn(page, "repa@test.com");
    await page.goto("/#/leads");

    await expect(page.getByText("Lead ForRepA")).toBeVisible();
    await expect(page.getByText("Lead ForRepB")).not.toBeVisible();
  });

  test("a sales manager sees every lead", async ({ page }) => {
    await signIn(page, "manager@test.com");
    await page.goto("/#/leads");

    await expect(page.getByText("Lead ForRepA")).toBeVisible();
    await expect(page.getByText("Lead ForRepB")).toBeVisible();
  });

  test("only a manager gets the bulk assign action", async ({ page }) => {
    await signIn(page, "manager@test.com");
    await page.goto("/#/contacts");
    await page.getByRole("checkbox").first().click();
    await expect(
      page.getByRole("button", { name: /assign to/i }),
    ).toBeVisible();
  });

  test("a sales rep gets no bulk assign action", async ({ page }) => {
    await signIn(page, "repa@test.com");
    await page.goto("/#/contacts");
    await page.getByRole("checkbox").first().click();
    await expect(
      page.getByRole("button", { name: /assign to/i }),
    ).not.toBeVisible();
  });

  test("only an admin reaches the users screen", async ({ page }) => {
    await signIn(page, "manager@test.com");
    await expect(page.getByRole("link", { name: "Users" })).not.toBeVisible();
  });
});
