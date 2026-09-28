import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

// Every one of these answered "Not Found" on a phone: the mobile admin only
// registered contacts, company pages, tasks and settings.
const ROUTES = [
  "/leads",
  "/deals",
  "/quotes",
  "/products",
  "/price_lists",
  "/tax_rates",
  "/companies",
  "/sales",
  "/teams",
  "/analytics",
  "/teams-dashboard",
  "/profile",
];

describe("mobile routes", () => {
  beforeEach(async () => {
    await page.viewport(375, 812);
  });

  afterEach(async () => {
    await page.viewport(1280, 800);
  });

  it.each(ROUTES)("%s opens on a phone instead of Not Found", async (route) => {
    const screen = await render(
      <StoryWrapper initialEntries={[route]}>
        <></>
      </StoryWrapper>,
    );

    await expect.element(screen.getByRole("main")).toBeInTheDocument();
    await expect.element(screen.getByText("Not Found")).not.toBeInTheDocument();
  });
});
