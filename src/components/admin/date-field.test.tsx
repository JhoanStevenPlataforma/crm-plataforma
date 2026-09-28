import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { DateField } from "./date-field";

const record = { id: 1, at: "2026-09-28T15:42:17" };

describe("DateField with time", () => {
  it("shows hours and minutes, not seconds", async () => {
    const screen = await render(
      <StoryWrapper>
        <DateField record={record} source="at" showTime />
      </StoryWrapper>,
    );

    await expect.element(screen.getByText(/3:42/)).toBeVisible();
    expect(screen.container.textContent).not.toContain(":17");
  });

  it("shows only the time, without seconds, when the date is hidden", async () => {
    const screen = await render(
      <StoryWrapper>
        <DateField record={record} source="at" showTime showDate={false} />
      </StoryWrapper>,
    );

    await expect.element(screen.getByText(/3:42/)).toBeVisible();
    expect(screen.container.textContent).not.toContain(":17");
  });
});
