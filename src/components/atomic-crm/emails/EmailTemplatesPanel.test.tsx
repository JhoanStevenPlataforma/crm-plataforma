import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { Templates } from "./EmailTemplatesPanel.stories";

const SLOW = { timeout: 5000 };

const save = () => page.getByRole("button", { name: "Save", exact: true });

/**
 * The templates everybody's compose dialog offers, as an administrator edits
 * them -- against the demo provider, whose list of allowed variables is the
 * mirror of `email_template_variables()`.
 */
describe("email templates", () => {
  // See EmailComposeDialog.test.tsx: a modal left open keeps the page inert.
  afterEach(() => {
    document.body.style.pointerEvents = "";
  });

  it("lists the seeded templates, each marked as the system's", async () => {
    await render(<Templates />);

    await expect
      .element(page.getByRole("button", { name: "Quotation delivery" }), SLOW)
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Envío de cotización" }))
      .toBeVisible();
    await expect.element(page.getByText("System").first()).toBeVisible();
  });

  it("lets a system template be reworded but not re-keyed or deleted", async () => {
    await render(<Templates />);
    await page.getByRole("button", { name: "Quotation delivery" }).click();

    // Positive first: the dialog is open on this template.
    await expect
      .element(page.getByText(/its key, scope and language cannot/), SLOW)
      .toBeVisible();
    await expect.element(page.getByLabelText("Key")).toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: "Delete" }))
      .not.toBeInTheDocument();
    await expect.element(save()).toBeEnabled();
  });

  it("names the variable a template may not use, and does not save it", async () => {
    await render(<Templates />);
    await page.getByRole("button", { name: "New template" }).click();
    await expect
      .element(page.getByText(/Available variables:/), SLOW)
      .toBeVisible();

    await page.getByLabelText("Name").fill("Saludo");
    await page.getByLabelText("Key").fill("greeting");
    await page.getByLabelText("Subject").fill("Hola {{customer_name}}");
    await page.getByLabelText("Message").fill("Total: {{total}}");

    // A generic template has no quotation behind it: no total to print.
    await expect
      .element(
        page.getByText(/do not exist for this kind of record: {{total}}/),
      )
      .toBeVisible();
    await expect.element(save()).toBeDisabled();
  });

  it("refuses the quotation link in a subject", async () => {
    await render(<Templates />);
    await page.getByRole("button", { name: "Quotation delivery" }).click();
    await expect.element(save(), SLOW).toBeEnabled();

    await page.getByLabelText("Subject").fill("Ver {{quote_link}}");

    await expect
      .element(page.getByText(/cannot be used in the subject/))
      .toBeVisible();
    await expect.element(save()).toBeDisabled();
  });

  it("saves a new template, which then appears in the list", async () => {
    await render(<Templates />);
    await page.getByRole("button", { name: "New template" }).click();
    await expect
      .element(page.getByText(/Available variables:/), SLOW)
      .toBeVisible();

    await page.getByLabelText("Name").fill("Saludo inicial");
    await page.getByLabelText("Key").fill("first_greeting");
    await page.getByLabelText("Subject").fill("Hola {{customer_name}}");
    await page.getByLabelText("Message").fill("Un saludo, {{sender_name}}");
    await save().click();

    await expect
      .element(page.getByRole("button", { name: "Saludo inicial" }), SLOW)
      .toBeVisible();
  });
});
