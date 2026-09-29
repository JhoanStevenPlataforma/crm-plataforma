import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { buildContact, StoryWrapper } from "@/test/StoryWrapper";

/**
 * M5 (QA audit): nothing flagged a second contact with the same email, and the
 * duplicates then showed up as identical rows in every picker. The hint warns
 * and links; two records may legitimately share an address, so it never
 * refuses.
 */
describe("the duplicate hint on a new contact", () => {
  it("says a contact with the typed email already exists, without refusing it", async () => {
    await page.viewport(1600, 900);
    const screen = await render(
      <StoryWrapper
        initialEntries={["/contacts/create"]}
        data={{
          contacts: [
            buildContact({
              id: 1,
              email_jsonb: [{ email: "ada@example.com", type: "Work" }],
            }),
          ],
        }}
      >
        {null}
      </StoryWrapper>,
    );

    await screen.getByPlaceholder("Email").fill("ADA@example.com");

    await expect
      .element(screen.getByText("A contact with this email already exists:"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Ada Lovelace" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /^save$/i }))
      .toBeEnabled();
  });
});
