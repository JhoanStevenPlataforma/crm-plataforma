import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { RefreshButton } from "./refresh-button";
import { UserMenu } from "./user-menu";

describe("icon-only buttons in the top bar", () => {
  it("names the refresh button for screen readers", async () => {
    const screen = await render(
      <StoryWrapper>
        <RefreshButton />
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("button", { name: "Refresh" }))
      .toBeInTheDocument();
  });

  it("names the avatar that opens the user menu", async () => {
    const screen = await render(
      <StoryWrapper>
        <UserMenu />
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("button", { name: "Profile" }))
      .toBeInTheDocument();
  });
});
