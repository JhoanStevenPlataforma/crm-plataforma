import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { buildLead, StoryWrapper } from "@/test/StoryWrapper";

/**
 * M10 (QA audit): a converted lead opened its edit form with an empty,
 * required "Status" (the select has no "converted" option), and anything saved
 * there reached none of the records the conversion produced.
 */
describe("LeadEdit", () => {
  beforeAll(async () => {
    await page.viewport(1440, 900);
  });

  it("does not offer to edit a converted lead, and says why", async () => {
    const screen = await render(
      <StoryWrapper
        initialEntries={["/leads/1"]}
        data={{
          leads: [
            buildLead({
              id: 1,
              status: "converted",
              converted_at: "2026-09-01T09:00:00.000Z",
            }),
          ],
        }}
      >
        {null}
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByText(/already been converted/))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Save" }))
      .not.toBeInTheDocument();
  });

  it("still edits a lead that was not converted", async () => {
    const screen = await render(
      <StoryWrapper
        initialEntries={["/leads/1"]}
        data={{ leads: [buildLead({ id: 1 })] }}
      >
        {null}
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("button", { name: "Save" }))
      .toBeVisible();
  });
});
