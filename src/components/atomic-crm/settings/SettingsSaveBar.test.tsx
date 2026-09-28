import { Form } from "ra-core";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { SettingsSaveBar } from "./SettingsSaveBar";

const renderBar = () =>
  render(
    <StoryWrapper>
      <Form defaultValues={{ title: "Acme CRM" }}>
        <SettingsSaveBar />
      </Form>
    </StoryWrapper>,
  );

describe("SettingsSaveBar reset to defaults", () => {
  it("asks before resetting, and nothing changes when the user backs out", async () => {
    const screen = await renderBar();

    await screen.getByRole("button", { name: "Reset to Defaults" }).click();
    const dialog = screen.getByRole("dialog", {
      name: "Reset every setting to its default?",
    });
    await expect.element(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Unsaved changes"))
      .not.toBeInTheDocument();
  });

  it("says the reset is not stored until Save", async () => {
    const screen = await renderBar();

    await screen.getByRole("button", { name: "Reset to Defaults" }).click();
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Reset to Defaults" })
      .click();

    await expect
      .element(
        page.getByText(
          "Defaults restored in the form. Click Save to apply them.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Unsaved changes")).toBeVisible();
  });
});
