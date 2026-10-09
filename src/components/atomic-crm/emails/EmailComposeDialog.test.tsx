import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import {
  DraftQuote,
  IssuedQuote,
  IssuedQuoteAsManager,
} from "./EmailComposeDialog.stories";

/** The demo provider has simulated latency, and the dialog chains two reads. */
const SLOW = { timeout: 5000 };

/**
 * A field's current value, read each time it is asked for: `toHaveValue`
 * compares for equality, and these fields are filled from a template whose
 * wording is not this test's business.
 */
const valueOf = (label: string) => () =>
  (
    page.getByLabelText(label).query() as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null
  )?.value ?? "";

const openDialog = async () => {
  await page.getByRole("button", { name: "Send by email" }).click();
  await expect
    .element(page.getByText("Send the quotation by email"), SLOW)
    .toBeVisible();
};

/** Waits for the template to be filled in: the dialog is ready to be used. */
const untilPrefilled = () =>
  expect.poll(valueOf("Subject"), SLOW).toContain("Q-2026-00001");

const send = () =>
  page.getByRole("button", { name: "Send", exact: true }).click();

/**
 * Against the demo mirror of the email RPCs, not a mock: which version may be
 * shared, who may type a free address and the duplicate guard are evaluated
 * for real (`providers/fakerest/email.ts`), by the code the demo app runs.
 */
describe("sending a quotation by email", () => {
  // A modal left open when its test ends keeps the page inert (Radix sets
  // `pointer-events: none` on the body), and the next test cannot click.
  afterEach(() => {
    document.body.style.pointerEvents = "";
  });

  it("opens on the quotation template, filled from the issued version", async () => {
    await render(<IssuedQuote />);

    await openDialog();
    await untilPrefilled();

    expect(valueOf("Subject")()).toContain("Quotation Q-2026-00001 from ");
    const body = valueOf("Message")();
    expect(body).toContain("Dear Ana Compras,");
    expect(body).toContain("642,600.00 COP");
    // The link is the server's to fill: it stays a marker in the text.
    expect(body).toContain("{{quote_link}}");
  });

  it("says a send is simulated before and after it, and never calls it sent", async () => {
    await render(<IssuedQuote />);
    await openDialog();
    await expect.element(page.getByText(/Simulated mode/), SLOW).toBeVisible();
    await untilPrefilled();

    await send();

    await expect
      .element(page.getByText(/no email left the CRM/), SLOW)
      .toBeVisible();
    await expect
      .element(page.getByText("Simulated, not sent").first())
      .toBeVisible();
    await expect.element(page.getByText("Delivered")).not.toBeInTheDocument();
  });

  it("lists the message on the record once it is recorded", async () => {
    await render(<IssuedQuote />);
    await expect
      .element(page.getByText("No emails sent yet."), SLOW)
      .toBeVisible();
    await openDialog();
    await untilPrefilled();

    await send();
    await expect
      .element(page.getByText(/no email left the CRM/), SLOW)
      .toBeVisible();
    await page.getByRole("button", { name: "Close" }).first().click();

    await expect
      .element(page.getByText(/ana\.compras@acme-andina\.test/), SLOW)
      .toBeVisible();
    await expect
      .element(page.getByText("No emails sent yet."))
      .not.toBeInTheDocument();
  });

  it("offers a rep the record's addresses only", async () => {
    await render(<IssuedQuote />);
    await openDialog();

    await expect
      .element(page.getByText(/A manager can use another address/), SLOW)
      .toBeVisible();
  });

  it("offers a manager another address", async () => {
    await render(<IssuedQuoteAsManager />);
    await openDialog();
    // Positive first: the fields are rendered before an absence is asserted.
    await untilPrefilled();
    await expect
      .element(page.getByText(/A manager can use another address/))
      .not.toBeInTheDocument();
  });

  it("refuses to send while a variable is left unfilled", async () => {
    await render(<IssuedQuote />);
    await openDialog();
    await untilPrefilled();

    await page
      .getByLabelText("Message")
      .fill("Total: {{total}} {{quote_link}}");

    await expect
      .element(page.getByText(/Fill in or remove these variables/))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Send", exact: true }))
      .toBeDisabled();
  });

  it("explains why a quotation that was never issued cannot be sent", async () => {
    await render(<DraftQuote />);

    await openDialog();

    await expect
      .element(page.getByText(/has not been issued yet/), SLOW)
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Send", exact: true }))
      .toBeDisabled();
  });
});
