import { expect, test } from "./fixtures";

test.describe("user adding a task", () => {
  test.beforeEach(async ({ createSales, createContact, createCompany }) => {
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
      notes: [{ text: "Met at a conference." }],
    });

    await createContact({
      first_name: "Bob",
      last_name: "Johnson",
      title: "CTO",
      sales_id: sales.id,
      company_id: company.id,
    });

    await createContact({
      first_name: "Alice",
      last_name: "Williams",
      title: "CFO",
      sales_id: sales.id,
      company_id: company.id,
    });
  });
  test("user adding a task", async ({ page, isMobile, menu, dismissToast }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill("john@doe.com");
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The dashboard is the proof of a successful sign-in; the browser tab is
    // the same string on the login page.
    await expect(page.getByText("Latest Activity")).toBeVisible();

    await menu.goToContacts();
    await page.waitForLoadState("networkidle");

    // `first()`: the specs share one database, and onboarding creates a Jane
    // Smith of its own; any of them can take the task.
    await page.getByText("Jane Smith").first().click();
    await page.waitForLoadState("networkidle");

    if (isMobile) {
      await page.getByRole("button", { name: "Create" }).click();
      await page.getByRole("menuitem", { name: "Task" }).click();
    } else {
      await page.getByRole("button", { name: "Add Task" }).click();
    }
    // Title, not Description: Phase 1 split the single `text` column into a
    // list-friendly title and an optional body (§3.3).
    await page.getByLabel("Title *").fill("Follow up with Jane");
    // Three days ahead, at 21:00 local time. A fixed date turned this into
    // an overdue task the day it passed, and the widget said "5 months ago".
    const due = new Date();
    due.setDate(due.getDate() + 3);
    due.setHours(21, 0, 0, 0);
    const pad = (value: number) => String(value).padStart(2, "0");
    const dueInput = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T21:00`;
    await page.getByLabel("Due date").fill(dueInput);
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Call" }).click();

    await page.getByRole("button", { name: "Save" }).click();

    await dismissToast("Task added");

    if (isMobile) {
      await expect(page.getByText("1 task")).toBeVisible();
      await page.getByText("1 task").click();

      await expect(page.getByText("Follow up with Jane")).toBeVisible();
      // Medium date and a short time, no seconds. "due" is followed by a
      // no-break space and ICU may put a narrow one before "PM": hence \s,
      // which a regex needs where a plain string would be normalised.
      const dueDay = due.toLocaleDateString("en-US", { dateStyle: "medium" });
      await expect(
        page.getByText(new RegExp(`due\\s${dueDay}, 9:00\\sPM`)),
      ).toBeVisible();
    } else {
      // The heading on the contact page, not the plain text: there is now a
      // "Tasks" entry in the main navigation too (§15.1).
      const tasksPanel = page.getByRole("heading", { name: "Tasks" });
      await expect(tasksPanel).toBeVisible();

      await expect(tasksPanel.locator("..")).toHaveText(/Follow up with Jane/);
      await menu.goToDashboard();

      await expect(page.getByText("Upcoming Tasks")).toBeVisible();

      // The four facts the widget owes the user, asserted individually rather
      // than as one exact string: Phase 1 added badges and moved the related
      // link out of the title row, and pinning the whole rendered line makes
      // the test fail on layout instead of on behaviour.
      // The CARD whose heading is "Upcoming Tasks", not two DOM levels above the
      // text. `locator("../..")` reached the card only as long as the heading
      // sat exactly two levels inside it; `SectionCard` now wraps the title in
      // a header div with room for a subtitle, so the XPath resolved to that
      // HEADER and every assertion below failed against a widget that was
      // rendering correctly. Filtering a card by its own heading survives any
      // amount of markup between the two.
      const upcoming = page
        .locator('[data-slot="card"]')
        .filter({ has: page.getByRole("heading", { name: "Upcoming Tasks" }) });
      await expect(upcoming).toContainText("Follow up with Jane");
      await expect(upcoming).toContainText("Call");
      // The widget says when in words; the exact time is in its tooltip.
      await expect(upcoming).toContainText("in 3 days");
      // Phase 1 turned the "(Re: …)" suffix into a link to the related record.
      await expect(upcoming).toContainText("Jane Smith");
    }
  });
});
