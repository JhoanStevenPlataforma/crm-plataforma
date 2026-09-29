import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { ForgotPasswordPage } from "./forgot-password-page";

/**
 * M14 (QA audit): the reset-password page was a dead end; the only way back
 * to sign-in was the browser's back button.
 */
describe("ForgotPasswordPage", () => {
  it("offers a way back to sign in", async () => {
    await page.viewport(1440, 900);
    const screen = await render(
      <StoryWrapper
        authProvider={{
          resetPassword: async () => undefined,
          setPassword: async () => undefined,
        }}
      >
        <ForgotPasswordPage />
      </StoryWrapper>,
    );

    const back = screen.getByRole("link", { name: "Back to sign in" });
    await expect.element(back).toBeVisible();
    await expect.element(back).toHaveAttribute("href", "/login");
  });
});
