import { test, expect } from "./fixtures";

test("user onboarding", async ({ page, isMobile, menu, dismissToast }) => {
  await page.goto("/");

  // The browser tab, asserted HERE and nowhere else. It comes from the static
  // `<title>` in `index.html` — not from the `title` configuration, which is the
  // wordmark's alt text — so it is the one thing on screen that proves the shell
  // itself loaded rather than the React app inside it. Three other specs used to
  // repeat this line as a "we are signed in" proxy; they now assert a landmark,
  // which is what they actually meant, so a rebrand is one edit rather than
  // eleven failures.
  await expect(page).toHaveTitle(/Hermes CRM/);
  await expect(page.getByText("Welcome to Atomic CRM")).toBeVisible();

  await page.getByLabel("First name").fill("John");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill("john@doe.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("What's next?")).toBeVisible();
  await expect(page.getByText("1/3 done")).toBeVisible();
  await expect(page.getByText("Install Atomic CRM")).toBeVisible();
  await expect(page.getByText("Add your first contact")).toBeVisible();
  await expect(page.getByText("Add your first note")).toBeVisible();

  await page.getByText("New Contact").click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("She/Her").click();
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Smith");
  await page.getByLabel("Title").fill("CEO");
  await page.getByLabel("Company").click();
  await page.getByPlaceholder("Search").fill("Smith Corp");
  await page.getByText("Create Smith Corp").click();
  await page
    .getByRole("group", { name: "Email addresses" })
    .getByRole("textbox", { name: "Email" })
    .fill("jane@smithcorp.com");
  await page
    .getByRole("group", { name: "Email addresses" })
    .getByRole("button", { name: "Add" })
    .click();

  await page
    .getByRole("group", { name: "Phone numbers" })
    .getByRole("textbox", { name: "Phone number" })
    .fill("+1234567890");
  await page
    .getByRole("group", { name: "Phone numbers" })
    .getByRole("button", { name: "Add" })
    .click();

  await page
    .getByLabel("LinkedIn URL")
    .fill("https://www.linkedin.com/in/jane-smith");

  await page
    .getByLabel("Background info (bio, how you met, etc)")
    .fill("Met at a conference.");

  await page.getByLabel("Has newsletter").check();

  await page.getByRole("button", { name: "Save" }).click();

  await dismissToast("Element created");

  await expect(page.locator(isMobile ? "h2" : "h5")).toHaveText("Jane Smith");
  await expect(page.getByText("CEO at Smith Corp")).toBeVisible();

  // Ownership, asserted on the OUTCOME rather than on a form control. This used
  // to read the "Account manager" input before saving; that input is gone since
  // roles shipped — `ContactCreate` defaults `sales_id` to the current identity
  // and reassigning is a manager privilege (`ASSIGN_ACTION`), so a rep is no
  // longer offered the field. What the test meant is still true and still worth
  // checking: the contact belongs to whoever created it.
  await expect(page.getByText("Followed by you")).toBeVisible();

  await menu.goToDashboard();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("2/3 done")).toBeVisible();

  await page.getByRole("button", { name: "Add note" }).click();

  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder("Add a note").fill("This is a note about Jane.");
  await page
    .getByRole("button", { name: isMobile ? "Save" : "Add this note" })
    .click();

  await dismissToast("Note added");

  await expect(
    page.getByText(isMobile ? "Me" : "You added a note", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("This is a note about Jane.")).toBeVisible();

  await menu.goToDashboard();

  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Latest Activity")).toBeVisible();

  // The three entries this session produced, matched on the page rather than
  // through `getByText("Latest Activity").locator("xpath=../..")`. That XPath
  // walked two levels up from the heading to reach the card, and it broke the
  // moment the widget gained a subtitle: it then resolved to the HEADER alone,
  // whose text is the title and the subtitle, so every one of these three
  // assertions failed against a card that was rendering correctly. A locator
  // that counts DOM ancestors is a locator that fails on a styling change.
  await expect(
    page.getByText(/You added company Smith Corp today at/),
  ).toBeVisible();
  await expect(
    page.getByText(/You added Jane Smith to Smith Corp today at/),
  ).toBeVisible();
  await expect(
    page.getByText(/You added a note about Jane Smith today at/),
  ).toBeVisible();
});
