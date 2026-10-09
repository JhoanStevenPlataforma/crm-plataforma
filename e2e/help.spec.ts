import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The manual (docs/proposals/help-center.md).
 *
 * What only an e2e can prove here is that the three layers agree about a
 * DRAFT: RLS withholds it from a rep, the screen then has nothing to show
 * them, and an admin both sees it and is told why it cannot be published yet.
 * Vitest renders the screens over a fake provider with no policies, and pgTAP
 * asserts the policies with no screen.
 *
 * The seeded quotation tutorials are drafts in a fresh database, so a rep
 * starts from an empty manual.
 */
test.describe("help centre", () => {
  const VIDEO_PATH = "video/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4";

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

  test("a rep reads what is published, and only that", async ({
    page,
    createHelpTutorial,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "the sidebar link is asserted on desktop",
    );
    await createHelpTutorial({
      slug: "e2e-published",
      title: "Send a quotation",
      steps: ["Open the quotation.", "Press Send."],
      video_path: VIDEO_PATH,
      is_published: true,
    });
    await createHelpTutorial({ slug: "e2e-draft", title: "Still recording" });

    await signIn(page, "rita@doe.com");
    await page.getByRole("link", { name: "Manual", exact: true }).click();

    await expect(page.getByText("Send a quotation")).toBeVisible();
    await expect(page.getByText("Still recording")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage" })).toHaveCount(0);

    await page.getByText("Send a quotation").click();

    await expect(
      page.getByRole("heading", { name: "Send a quotation" }),
    ).toBeVisible();
    await expect(page.getByText("Press Send.")).toBeVisible();
    // The recording is named, from the media bucket, and not fetched yet.
    const video = page.getByLabel("Send a quotation");
    await expect(video).toHaveAttribute("preload", "none");
    await expect(video).toHaveAttribute(
      "src",
      new RegExp(`/help-media/${VIDEO_PATH}$`),
    );

    // The draft's own address answers "not found", not the draft.
    await page.goto("/#/help/e2e-draft");
    await expect(
      page.getByText("This tutorial does not exist or is not published yet."),
    ).toBeVisible();
  });

  test("a rep is kept out of the admin screens", async ({ page }) => {
    await signIn(page, "rita@doe.com");

    await page.goto("/#/help_tutorials/create");

    await expect(page.getByLabel("Title *")).toHaveCount(0);
  });

  test("an admin writes a tutorial and is told it needs a recording to be published", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "the admin form is covered on desktop",
    );
    await signIn(page, "ada@doe.com");
    await page.goto("/#/help");

    // The seeded quotation flow is there for an admin, as drafts.
    await expect(page.getByText("Crear una cotización")).toBeVisible();
    await page.getByRole("link", { name: "Manage" }).click();
    await page.getByRole("link", { name: "New tutorial" }).click();

    await page.getByLabel("Title *").fill("Approve a discount");
    await page.getByLabel("Category *").click();
    await page.getByRole("option", { name: "Cotizaciones" }).click();
    await page.getByLabel("Link name *").fill("e2e-approve-a-discount");
    await page.getByLabel("Steps").fill("Open the quotation.\n\nApprove it.");
    await page.getByLabel("Published").click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByText("Attach a recording before publishing this tutorial"),
    ).toBeVisible();

    await page.getByLabel("Published").click();
    await page.getByRole("button", { name: "Save" }).click();

    // Saved as a draft, with the blank line between the steps dropped.
    await page.goto("/#/help/e2e-approve-a-discount");
    await expect(
      page.getByRole("heading", { name: "Approve a discount" }),
    ).toBeVisible();
    await expect(page.getByText("Draft")).toBeVisible();
    await expect(page.getByRole("article").getByRole("listitem")).toHaveText([
      "Open the quotation.",
      "Approve it.",
    ]);
  });
});
