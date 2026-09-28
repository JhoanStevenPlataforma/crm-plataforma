import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { labelOf } from "../analytics/labels";
import { useLeadStatusChoices } from "./useLeadStatusChoices";

const ConvertedLabel = () => (
  <span data-testid="label">
    {labelOf(useLeadStatusChoices(), "converted")}
  </span>
);

describe("useLeadStatusChoices", () => {
  it("labels the converted bucket in words, not with its raw key", async () => {
    const screen = await render(
      <StoryWrapper>
        <ConvertedLabel />
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByTestId("label"))
      .toHaveTextContent(/^Converted$/);
  });
});
