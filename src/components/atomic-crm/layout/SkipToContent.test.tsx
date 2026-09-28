import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { SkipToContent } from "./SkipToContent";

describe("SkipToContent", () => {
  it("is the first stop for the keyboard and moves focus to the content", async () => {
    const screen = await render(
      <StoryWrapper>
        <SkipToContent targetId="skip-target" />
        <nav>
          <a href="#one">One</a>
        </nav>
        <main id="skip-target" tabIndex={-1}>
          Content
        </main>
      </StoryWrapper>,
    );

    const link = screen.getByRole("link", { name: "Skip to content" });
    await expect.element(link).toBeInTheDocument();
    await userEvent.click(link);

    expect(document.activeElement?.id).toBe("skip-target");
  });
});
