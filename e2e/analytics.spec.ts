import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The analytics module.
 *
 * What only an e2e can prove here is the wiring, not the arithmetic — the sums
 * are tested in pgTAP (SQL) and vitest (the folds). Three things fail silently
 * everywhere else:
 *
 *   1. The RPCs are reachable at all. `getAnalytics` calls eight functions by
 *      name; a missing grant, a renamed parameter or an unapplied migration
 *      surfaces as an empty chart, which looks exactly like "no data".
 *   2. The filters survive a tab change and a reload. They live in the URL
 *      precisely so a dashboard can be shared, and nothing below the URL layer
 *      can prove that end to end.
 *   3. A rep sees the module and gets their own numbers. The route is
 *      deliberately ungated: the scoping is RLS, not `canAccess`.
 */
/** The query string of a hash-router URL: everything after the `?` in `#/…`. */
const hashParams = (url: string) =>
  new URLSearchParams(new URL(url).hash.split("?")[1] ?? "");

test.describe("analytics", () => {
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
    await createSales({
      first_name: "Ada",
      last_name: "Admin",
      email: "ada@doe.com",
      password: "password",
      role: "admin",
    });

    await createSales({
      first_name: "Rita",
      last_name: "Rep",
      email: "rita@doe.com",
      password: "password",
      role: "rep",
    });
  });

  test("opens from the nav and loads every tab without an error", async ({
    page,
    menu,
  }) => {
    await signIn(page, "ada@doe.com");

    await menu.goTo("Analytics");
    await expect(
      page.getByRole("heading", { name: "Analytics" }),
    ).toBeVisible();

    // The error banner is the thing to assert against: the pages render an
    // error rather than zeroes when a fetch fails, because a company reported
    // as having no pipeline and no overdue work is a far more alarming screen
    // than a message. If a grant or a parameter name is wrong, this is where
    // it shows.
    const errorBanner = page.getByText("These figures could not be loaded", {
      exact: false,
    });

    // Scoped to the page, not the whole document: the sidebar has carried its
    // own "Leads" entry since the leads module shipped, so an unscoped
    // `getByRole("link", { name: "Leads" })` matches the navigation as well as
    // the tab and fails on strict mode.
    const tabs = page.locator("#main-content");

    for (const tab of ["Pipeline", "Leads", "Productivity", "Overview"]) {
      await tabs.getByRole("link", { name: tab, exact: true }).click();
      await page.waitForLoadState("networkidle");
      await expect(errorBanner).toBeHidden();
    }
  });

  test("carries the period across tabs and through a reload", async ({
    page,
  }) => {
    await signIn(page, "ada@doe.com");
    await page.goto("/#/analytics");

    await page.getByRole("button", { name: "12 months" }).click();
    await expect(page).toHaveURL(/from=/);

    // Read out of the HASH, not out of `searchParams`. The app runs on a hash
    // router, so a filter the page puts "in the URL" lands in
    // `#/analytics?from=…` — `new URL(...).searchParams` looks before the `#`
    // and finds nothing there, which is why this read came back null while the
    // `toHaveURL(/from=/)` above (which matches the whole string) passed.
    const withTwelveMonths = hashParams(page.url()).get("from");
    expect(withTwelveMonths).not.toBeNull();

    // Switching tabs must not silently reset a period the manager just chose.
    await page
      .locator("#main-content")
      .getByRole("link", { name: "Leads", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`from=${withTwelveMonths}`));

    // And the link has to survive being opened fresh — that is the entire
    // reason the filters live in the URL rather than in a store.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`from=${withTwelveMonths}`));
    await expect(page.getByRole("button", { name: "12 months" })).toBeVisible();
  });

  test("a rep reaches the module but is offered no owner filter", async ({
    page,
  }) => {
    // The route is deliberately ungated: the numbers scope themselves through
    // RLS. What a rep must NOT get is the owner control, which for them would
    // change nothing on screen — a control that does nothing is worse than an
    // absent one.
    await signIn(page, "rita@doe.com");
    await page.goto("/#/analytics");

    await expect(
      page.getByRole("heading", { name: "Analytics" }),
    ).toBeVisible();
    await expect(page.getByText("Owner", { exact: true })).toBeHidden();
    await expect(page.getByText("Period", { exact: true })).toBeVisible();
  });

  test("tells the reader when no deal is past its closing date", async ({
    page,
  }) => {
    // The empty state is the assertion. A table that renders an empty box when
    // there is nothing to show reads as zero, and zero is a claim about the
    // business rather than about the query — the same rule `ChartCard` applies
    // to every chart in the module.
    await signIn(page, "ada@doe.com");
    await page.goto("/#/analytics");

    await expect(
      page.getByText("No deal is past its closing date"),
    ).toBeVisible();
  });
});
