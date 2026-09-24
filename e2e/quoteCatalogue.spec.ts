import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The commercial catalogue quotes are priced from
 * (docs/proposals/quotes-cpq-module.md §2.2, §7).
 *
 * What only an e2e can prove here is that the two access layers AGREE. The unit
 * tests assert `canAccess` in isolation and pgTAP asserts the RLS policies in
 * isolation; neither can catch the combination that actually hurts — a screen
 * that offers a rep a button the database will refuse, or a manager denied a
 * write the policy would have allowed. Both halves are wrong in a way that only
 * shows with a real session against a real database.
 *
 * Three further things fail silently everywhere else:
 *
 *   1. The catalogue renders at all. A missing grant or an unapplied migration
 *      surfaces as an empty list, which looks exactly like "no products".
 *   2. A product survives the round trip through `products_audit`. The trigger
 *      writes append-only history on every insert; a broken one fails the write
 *      itself, and no fake data provider exercises it.
 *   3. Nothing anywhere offers to DELETE a product. The database refuses it for
 *      every role including admin (§13.2), so a delete button is a button that
 *      can only fail — and a UI-only test cannot tell the difference between
 *      "the button is hidden" and "the button is hidden for this role".
 */
test.describe("quote catalogue", () => {
  const signIn = async (page: Page, email: string) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  test.beforeEach(async ({ createSales, createProduct }) => {
    const manager = await createSales({
      first_name: "Marta",
      last_name: "Manager",
      email: "marta@doe.com",
      password: "password",
      role: "manager",
    });

    await createSales({
      first_name: "Rita",
      last_name: "Rep",
      email: "rita@doe.com",
      password: "password",
      role: "rep",
    });

    await createProduct({
      sku: "SEED-1",
      name: "Instalación estándar",
      currency: "USD",
      list_price: 1200,
      sales_id: manager.id,
    });
  });

  test("a manager adds a product and finds it in the catalogue", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "catalogue maintenance is a desktop screen");

    await signIn(page, "marta@doe.com");

    await page.goto("/#/products");
    await page.waitForLoadState("networkidle");

    // The seeded row proves the list reads the table rather than rendering an
    // empty state for a query that failed.
    await expect(page.getByText("Instalación estándar")).toBeVisible();

    await page.getByRole("link", { name: "New product" }).click();
    await page.getByLabel("SKU *").fill("SRV-ONBOARD");
    await page.getByLabel("Name *").fill("Onboarding remoto");
    await page.getByLabel("List price *").fill("450");
    await page.getByRole("button", { name: "Save" }).click();

    await page.waitForLoadState("networkidle");
    await expect(page.getByText("SRV-ONBOARD")).toBeVisible();
    await expect(page.getByText("Onboarding remoto")).toBeVisible();
  });

  test("a manager prices a product into a list, which is what makes it quotable", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "catalogue maintenance is a desktop screen");

    await signIn(page, "marta@doe.com");

    await page.goto("/#/price_lists/create");
    await page.getByLabel("Code *").fill("retail-2026");
    await page.getByLabel("Name *").fill("Retail 2026");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    // Saving lands on the editor, which is where the prices live: the list row
    // itself prices nothing. `price_book` — what the quote line editor reads —
    // is a cross join of a list with the products it prices, so a list with no
    // items is a list nothing can be quoted from. Stopping at the save would
    // assert the half that does not matter.
    await expect(
      page.getByRole("heading", { name: /Price list Retail 2026/ }),
    ).toBeVisible();

    await page.getByLabel("Product", { exact: true }).click();
    await page
      .getByRole("option", { name: "Instalación estándar (SEED-1)" })
      .click();
    await page.getByLabel("Unit price", { exact: true }).fill("980");
    await page.getByRole("button", { name: "Add price" }).click();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("button", {
        name: "Remove the price of Instalación estándar",
      }),
    ).toBeVisible();
    await expect(page.getByText("$980.00")).toBeVisible();
  });

  test("a rep reads the catalogue and is offered no way to write it", async ({
    page,
  }) => {
    // `canAccess` hides the buttons; the RLS policy is what refuses the write.
    // The two layers have to agree, and this is the only test that sees both.
    await signIn(page, "rita@doe.com");

    await page.goto("/#/products");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Instalación estándar")).toBeVisible();
    await expect(page.getByRole("link", { name: "New product" })).toBeHidden();

    // Tax rates are maintained by managers and absent from a rep's navigation
    // entirely: the rate a product carries is shown on the product itself.
    await expect(
      page.getByRole("link", { name: "Tax rates", exact: true }),
    ).toBeHidden();
  });

  test("nothing offers to delete a product, not even to an admin", async ({
    page,
    isMobile,
    createSales,
  }) => {
    test.skip(isMobile, "catalogue maintenance is a desktop screen");

    await createSales({
      first_name: "Ada",
      last_name: "Admin",
      email: "ada@doe.com",
      password: "password",
      role: "admin",
    });

    await signIn(page, "ada@doe.com");

    await page.goto("/#/products");
    await page.waitForLoadState("networkidle");

    // Bulk delete, first: the row checkboxes are the usual way a kit list
    // offers one.
    await expect(page.getByRole("button", { name: "Delete" })).toBeHidden();

    await page.getByText("Instalación estándar").click();

    // WAIT FOR THE FORM FIRST. The editor's header renders after the record
    // resolves, so asserting the absence of a button on arrival passes whether
    // or not the button is ever added — the first cut of this test did exactly
    // that, and a `DeleteButton` dropped into `ProductEdit` did not turn it
    // red. An absence is only evidence once the thing that would contain it is
    // on screen.
    await expect(page.getByLabel("SKU *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    // The kit's `DeleteButton` consults NOTHING — not `canAccess`, not the
    // grants — so `Edit` renders one by default and this screen has to opt out
    // explicitly. Which it did not, until this test said so: the editor was
    // offering an admin a delete the database refuses for everybody.
    await expect(page.getByRole("button", { name: "Delete" })).toBeHidden();

    // What IS offered is the alternative the product decision prescribes.
    await expect(page.getByLabel("Active")).toBeVisible();
  });
});
