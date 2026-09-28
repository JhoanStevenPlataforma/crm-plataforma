import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { TagForm } from "./TagForm";

describe("TagForm colour swatches", () => {
  it("names each swatch and says which one is chosen", async () => {
    const screen = await render(
      <StoryWrapper>
        <TagForm open onSubmit={async () => {}} />
      </StoryWrapper>,
    );

    const first = screen.getByRole("button", { name: "Colour 1 of 10" });
    const third = screen.getByRole("button", { name: "Colour 3 of 10" });
    await expect.element(first).toHaveAttribute("aria-pressed", "true");
    await expect.element(third).toHaveAttribute("aria-pressed", "false");

    await third.click();

    await expect.element(third).toHaveAttribute("aria-pressed", "true");
    await expect.element(first).toHaveAttribute("aria-pressed", "false");
  });
});
