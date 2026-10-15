import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Financial settings > Currencies and exchange rates
 * (docs/proposals/multi-currency-fx.md).
 *
 * Who may do what is pinned by pgTAP on the policies; this proves the screen
 * offers each role what the database will accept, and that a manual rate goes
 * through the real table and comes back in the history with its author.
 */
test.describe("currencies and exchange rates", () => {
  const signIn = async (page: Page, email: string) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  test.beforeEach(async ({ createSales }) => {
    for (const [first, email, role] of [
      ["Ada", "ada@doe.com", "admin"],
      ["Mara", "mara@doe.com", "manager"],
      ["Rita", "rita@doe.com", "rep"],
    ] as const) {
      await createSales({
        first_name: first,
        last_name: "Doe",
        email,
        password: "password",
        role,
      });
    }
  });

  test("an admin registers a currency, which every quotation can then use", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "a desktop configuration screen");

    await signIn(page, "ada@doe.com");
    await page.goto("/#/currencies?tab=currencies");
    await page.getByRole("button", { name: "New currency" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ISO 4217 code").fill("GBP");
    await dialog.getByLabel("Name").fill("Pound sterling");
    await dialog.getByLabel("Symbol").fill("£");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByRole("row").filter({ hasText: "Pound sterling" }),
    ).toBeVisible();
    // A currency with no rate is shown as such, never with a figure.
    await page.getByRole("tab", { name: "Rates" }).click();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Pound sterling" })
        .getByText("No rate"),
    ).toBeVisible();
  });

  test("a manager sets a commercial rate beside the official one, and the history shows who did", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "a desktop configuration screen");

    await signIn(page, "mara@doe.com");
    await page.goto("/#/currencies?tab=rates");
    const usdRow = page.getByRole("row").filter({ hasText: "US dollar" });
    await expect(usdRow.getByText("4,000.00")).toBeVisible();

    await usdRow.getByRole("button", { name: "Set commercial rate" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Rate (COP per 1 USD)").fill("4100");
    await dialog.getByLabel("Reason").fill("Commercial rate for October");
    await dialog.getByRole("button", { name: "Save" }).click();

    // Side by side: the official rate is untouched.
    await expect(usdRow.getByText("4,100.00")).toBeVisible();
    await expect(usdRow.getByText("4,000.00")).toBeVisible();
    await expect(usdRow.getByText("+2.5%")).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Commercial" }).click();
    const historyRow = page
      .getByRole("row")
      .filter({ hasText: "Commercial rate for October" });
    await expect(historyRow).toBeVisible();
    await expect(historyRow.getByText("Mara Doe")).toBeVisible();
  });

  test("a rep reads the rates but is offered nothing to change", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "a desktop configuration screen");

    await signIn(page, "rita@doe.com");
    await page.goto("/#/currencies?tab=rates");
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "US dollar" })
        .getByText("4,000.00"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Set commercial rate" }),
    ).toHaveCount(0);
    for (const tab of ["Providers", "Settings", "Integration health"]) {
      await expect(page.getByRole("tab", { name: tab })).toHaveCount(0);
    }
  });
});
