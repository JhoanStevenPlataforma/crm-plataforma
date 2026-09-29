import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Sale } from "../types";
import { SalesCreate } from "./SalesCreate";

const rita = {
  id: 2,
  first_name: "Rita",
  last_name: "Rep",
  email: "rita@example.com",
  role: "rep",
  disabled: false,
} as Sale;

describe("SalesCreate", () => {
  it("says the email is taken, in the reader's language, instead of the server's English", async () => {
    // Arrange
    const screen = await render(
      <StoryWrapper data={{ sales: [rita] }}>
        <SalesCreate />
      </StoryWrapper>,
    );

    // Act
    await screen.getByLabelText(/First name/).fill("Other");
    await screen.getByLabelText(/Last name/).fill("Rita");
    await screen.getByLabelText(/Email/).fill("RITA@example.com");
    await screen.getByRole("combobox", { name: /Role/ }).click();
    await page.getByRole("option", { name: "Sales rep" }).click();
    await screen.getByRole("button", { name: "Save" }).click();

    // Assert: toasts render in a portal outside `screen`.
    await expect
      .element(page.getByText("A user with this email already exists."))
      .toBeVisible();
    await expect
      .element(page.getByText("A sales for this email already exists"))
      .not.toBeInTheDocument();
  });
});
