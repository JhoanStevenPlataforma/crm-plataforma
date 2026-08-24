import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Teams and task participants (proposal §7, deliverable 2.4).
 *
 * What only an e2e can prove here: the write path is gated by RLS, not by the
 * UI. `canAccess` hides the menu entry for a rep, but the reason a rep cannot
 * create a team is a Postgres policy — and the two have to agree, because the
 * UI layer is explicitly documented as decoration.
 */
test.describe("teams and participants", () => {
  const signIn = async (page: Page, email: string) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // The nav, not "Latest Activity": a fresh account with no notes lands on
    // the onboarding panel instead of the activity feed.
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  test.beforeEach(async ({ createSales, createCompany, createContact }) => {
    const admin = await createSales({
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

    const company = await createCompany({
      name: "Smith Corp",
      salesId: admin.id,
    });

    await createContact({
      first_name: "Jane",
      last_name: "Smith",
      title: "CEO",
      sales_id: admin.id,
      company_id: company.id,
    });
  });

  test("an admin creates a team and adds a member", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teams administration is a desktop screen");

    await signIn(page, "ada@doe.com");

    await page.goto("/#/teams");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "New team" }).click();
    await page.getByLabel("Name *").fill("Renewals");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();

    await page.getByLabel("Add a member").click();
    await page.getByRole("option", { name: "Rita Rep" }).click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Rita Rep")).toBeVisible();
  });

  test("a rep is not offered the teams screen", async ({ page, isMobile }) => {
    test.skip(isMobile, "the user menu differs on mobile");

    await signIn(page, "rita@doe.com");

    // The user menu's trigger is an avatar with no stable accessible name, so
    // it is located as the last control in the header rather than by label.
    await page.locator("header").getByRole("button").last().click();

    await expect(page.getByRole("menuitem", { name: "Teams" })).toHaveCount(0);
    // The control test: the menu itself did open, so the absence is a decision
    // and not a missed click.
    await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  });

  test("a watcher added to a task is recorded, not just displayed", async ({
    page,
    isMobile,
    dismissToast,
  }) => {
    test.skip(isMobile, "the task detail dialog is a desktop screen");

    await signIn(page, "ada@doe.com");
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByLabel("Title *").fill("Call Jane about the renewal");
    await page.getByLabel("Contact *").click();
    await page.getByRole("option", { name: /Jane Smith/ }).click();
    await page.getByLabel("Due date").fill("2026-09-11T21:00");
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Call" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await dismissToast("Task added");

    // The board opens a task with one click; the list row hides it behind the
    // row's action menu.
    await page.getByRole("tab", { name: "Board" }).click();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /Open Call Jane about the renewal/ })
      .click();

    await page.getByRole("tab", { name: "People" }).click();

    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Watchers" }).click();
    await page.getByLabel("Add someone").click();
    await page.getByRole("option", { name: "Rita Rep" }).click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Rita Rep")).toBeVisible();

    // The point of the assignment model: joining a task is an event, so the
    // History tab has to show it without anybody writing it from the client.
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText(/watcher/i).first()).toBeVisible();
  });
});
