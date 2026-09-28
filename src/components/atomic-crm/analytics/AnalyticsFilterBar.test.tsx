import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { AnalyticsFilterBar } from "./AnalyticsFilterBar";

const Search = () => (
  <output data-testid="search">{useLocation().search}</output>
);

const filters = {
  from: "2026-01-01",
  to: "2026-06-30",
  salesId: null,
  teamId: null,
};

describe("AnalyticsFilterBar date range", () => {
  it("keeps an inverted range out of the URL and says why", async () => {
    const screen = await render(
      <StoryWrapper initialEntries={["/?from=2026-01-01&to=2026-06-30"]}>
        <AnalyticsFilterBar filters={filters} showTeam={false} />
        <Search />
      </StoryWrapper>,
    );

    await screen.getByLabelText("From").fill("2026-09-01");

    await expect
      .element(
        screen.getByText("The start date must be on or before the end date."),
      )
      .toBeVisible();
    // The typed date stays on screen; the URL still holds the last valid range.
    await expect
      .element(screen.getByLabelText("From"))
      .toHaveValue("2026-09-01");
    await expect
      .element(screen.getByTestId("search"))
      .toHaveTextContent("from=2026-01-01");
  });

  it("applies a valid range to the URL", async () => {
    const screen = await render(
      <StoryWrapper initialEntries={["/?from=2026-01-01&to=2026-06-30"]}>
        <AnalyticsFilterBar filters={filters} showTeam={false} />
        <Search />
      </StoryWrapper>,
    );

    await screen.getByLabelText("From").fill("2026-03-01");

    await expect
      .element(screen.getByTestId("search"))
      .toHaveTextContent("from=2026-03-01");
  });
});
