import { render } from "vitest-browser-react";
import {
  ContactEditBasic,
  ContactEditWithEmailsAndPhones,
} from "./ContactEdit.stories";
import { page } from "vitest/browser";

/** Dismisses the toast by its own close button, scoped to the toast. */
const closeToast = () =>
  page
    .getByRole("listitem")
    .filter({ hasText: "Element updated" })
    .getByRole("button", { name: "Close" })
    .click();

describe("ContactEdit", () => {
  describe("desktop", () => {
    beforeAll(() => {
      page.viewport(1600, 900);
    });

    it("shows empty email and phone inputs when the contact has none", async () => {
      const screen = await render(<ContactEditBasic silent />);

      // The form should display one empty email placeholder input
      await expect
        .element(screen.getByPlaceholder("Email"))
        .toBeInTheDocument();

      // The form should display one empty phone placeholder input
      await expect
        .element(screen.getByPlaceholder("Phone number"))
        .toBeInTheDocument();
    });

    it("does not submit empty email and phone entries", async () => {
      const updateMock = vi.fn().mockResolvedValue({ data: {} });
      const screen = await render(
        <ContactEditBasic
          silent
          dataProvider={{
            update: updateMock,
          }}
        />,
      );

      // Wait for the form to load
      await expect
        .element(screen.getByPlaceholder("Email"))
        .toBeInTheDocument();

      // Submit without filling anything
      await screen.getByRole("button", { name: /^save$/i }).click();
      await expect
        .poll(() => screen.getByText("Element updated"))
        .toBeInTheDocument();

      await closeToast();

      // Verify the transform cleaned up the empty arrays
      expect(updateMock).toBeCalledTimes(1);
      expect(updateMock).toBeCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            email_jsonb: null,
            phone_jsonb: null,
          }),
        }),
      );
    });

    it("submits only filled email and phone entries, stripping empty ones", async () => {
      const updateMock = vi.fn().mockResolvedValue({ data: {} });

      const screen = await render(
        <ContactEditBasic
          dataProvider={{
            update: updateMock,
          }}
          silent
        />,
      );

      // Wait for the form to load and fill in the email
      const emailInput = screen.getByPlaceholder("Email");
      await expect.element(emailInput).toBeInTheDocument();
      await emailInput.fill("ada@example.com");

      // Leave the phone input empty and submit
      await screen.getByRole("button", { name: /^save$/i }).click();
      await expect
        .poll(() => screen.getByText("Element updated"))
        .toBeInTheDocument();

      await closeToast();

      // Wait for the update call to complete
      await expect.poll(() => updateMock.mock.calls.length).toBe(1);

      expect(updateMock).toBeCalledTimes(1);

      expect(updateMock).toBeCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            email_jsonb: [{ email: "ada@example.com", type: "Work" }],
            phone_jsonb: null,
          }),
        }),
      );
    });

    it("preserves existing email and phone entries on edit", async () => {
      const updateMock = vi.fn().mockResolvedValue({ data: {} });
      const screen = await render(
        <ContactEditWithEmailsAndPhones
          silent
          dataProvider={{ update: updateMock }}
        />,
      );

      // Wait for existing values to appear
      const emailInput = screen.getByPlaceholder("Email");
      await expect.element(emailInput).toHaveValue("ada@example.com");

      const phoneInput = screen.getByPlaceholder("Phone number");
      await expect.element(phoneInput).toHaveValue("0123456789");

      // Submit without changes
      await screen.getByRole("button", { name: /^save$/i }).click();
      await expect
        .poll(() => screen.getByText("Element updated"))
        .toBeInTheDocument();

      await closeToast();

      // Wait for the update call to complete
      expect(updateMock).toBeCalledTimes(1);

      // Verify existing data is preserved through the transform
      expect(updateMock).toBeCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            email_jsonb: [{ email: "ada@example.com", type: "Work" }],
            phone_jsonb: [{ number: "0123456789", type: "Work" }],
          }),
        }),
      );
    });
  });
});
