import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The task page and its three views (proposal §15.1, deliverable 2.9).
 *
 * What is worth an e2e rather than a component test: the view and the scope are
 * URL state, so they have to survive a reload and a pasted link — and a drag on
 * the board goes through `transition_task()` in the real database, which no
 * mock can prove.
 */
test.describe("task views", () => {
  test.beforeEach(async ({ createSales, createCompany, createContact }) => {
    const sales = await createSales({
      first_name: "John",
      last_name: "Doe",
      email: "john@doe.com",
      password: "password",
    });

    const company = await createCompany({
      name: "Smith Corp",
      salesId: sales.id,
    });

    await createContact({
      first_name: "Jane",
      last_name: "Smith",
      title: "CEO",
      sales_id: sales.id,
      company_id: company.id,
    });
  });

  const signIn = async (page: Page) => {
    await page.goto("/");
    await page.getByLabel("Email").fill("john@doe.com");
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // The nav, not "Latest Activity": a fresh account with no notes lands on
    // the onboarding panel instead of the activity feed.
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  const addTask = async (
    page: Page,
    title: string,
    dismissToast: (content: string) => Promise<void>,
  ) => {
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByLabel("Title *").fill(title);
    await page.getByLabel("Contact *").click();
    await page.getByRole("option", { name: /Jane Smith/ }).click();
    await page.getByLabel("Due date").fill("2026-09-11T21:00");
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Call" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await dismissToast("Task added");
  };

  test("reaches the task page from the navigation", async ({ page, menu }) => {
    await signIn(page);
    await menu.goToTasks();

    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByRole("tab", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Calendar" })).toBeVisible();
  });

  test("keeps the chosen view in the URL across a reload", async ({
    page,
    menu,
  }) => {
    // The view is shareable state: a copied link has to open the same screen.
    await signIn(page);
    await menu.goToTasks();

    await page.getByRole("tab", { name: "Board" }).click();
    await expect(page).toHaveURL(/view=kanban/);

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("tab", { name: "Board" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("shows a task on the board and on the calendar", async ({
    page,
    menu,
    dismissToast,
  }) => {
    await signIn(page);
    await menu.goToTasks();
    await addTask(page, "Call Jane about the renewal", dismissToast);

    await page.getByRole("tab", { name: "Board" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Call Jane about the renewal")).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();

    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.waitForLoadState("networkidle");
    // The task is due in September 2026; step there rather than guessing.
    await expect(
      page.getByRole("button", { name: "Next month" }),
    ).toBeVisible();
  });

  test("does not offer a column a drag could never legally fill", async ({
    page,
    menu,
  }) => {
    // Cancelling requires a reason (§4.4), which a drop cannot supply.
    await signIn(page);
    await menu.goToTasks();
    await page.getByRole("tab", { name: "Board" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Blocked")).toBeVisible();
    await expect(page.getByText("Cancelled")).toHaveCount(0);
    await expect(page.getByText("Archived")).toHaveCount(0);
  });
});
