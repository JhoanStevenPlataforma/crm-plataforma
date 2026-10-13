import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { Automations, ReadOnly } from "./EmailAutomationsPanel.stories";

const SLOW = { timeout: 5000 };

const saveButtons = () =>
  page.getByRole("button", { name: "Save", exact: true });
// Sorted by key: the confirmation first, the follow-up second.
const followupState = () => page.getByLabelText("State").nth(1);
const delay = () =>
  page.getByLabelText("Days without an answer before reminding");

/**
 * What the CRM sends by itself, against the demo provider seeded as the
 * migration seeds the database: two rules, both switched off.
 */
describe("email automations", () => {
  // See EmailComposeDialog.test.tsx: a popover left open keeps the page inert.
  afterEach(() => {
    document.body.style.pointerEvents = "";
  });

  it("shows the two rules switched off, with nothing to save yet", async () => {
    await render(<Automations />);

    await expect
      .element(page.getByText("Acceptance confirmation").first(), SLOW)
      .toBeVisible();
    await expect
      .element(page.getByText("Quotation follow-up").first())
      .toBeVisible();
    await expect.element(followupState()).toHaveTextContent("Off");
    await expect.element(delay()).toHaveValue(5);
    // The confirmation does not wait: it has no delay to set.
    expect(delay().elements()).toHaveLength(1);
    await expect.element(saveButtons().first()).toBeDisabled();
    await expect.element(saveButtons().nth(1)).toBeDisabled();
  });

  it("lets an administrator switch the follow-up on with another delay", async () => {
    await render(<Automations />);
    await expect.element(followupState(), SLOW).toHaveTextContent("Off");

    await followupState().click();
    await page.getByRole("option", { name: "On", exact: true }).click();
    await delay().fill("7");
    await saveButtons().nth(1).click();

    await expect
      .element(page.getByText("The automation was saved"), SLOW)
      .toBeVisible();
    // Saved, so there is nothing left to save: the form shows the stored rule.
    await expect.element(saveButtons().nth(1)).toBeDisabled();
    await expect.element(followupState()).toHaveTextContent("On");
    await expect.element(delay()).toHaveValue(7);
  });

  it("says what each state does to the messages already waiting", async () => {
    await render(<Automations />);
    await expect.element(followupState(), SLOW).toHaveTextContent("Off");

    await followupState().click();
    await page.getByRole("option", { name: "Paused", exact: true }).click();

    await expect
      .element(page.getByText(/what was waiting keeps waiting/))
      .toBeVisible();
  });

  it("does not offer to save a delay the database would refuse", async () => {
    await render(<Automations />);
    await expect.element(delay(), SLOW).toHaveValue(5);

    await delay().fill("0");

    await expect
      .element(page.getByText(/The wait must be between 1 and 90 days/))
      .toBeVisible();
    await expect.element(saveButtons().nth(1)).toBeDisabled();
  });

  it("shows a manager how the rules are set, with nothing to switch", async () => {
    await render(<ReadOnly />);

    await expect.element(followupState(), SLOW).toHaveTextContent("Off");
    await expect.element(followupState()).toBeDisabled();
    await expect.element(delay()).toBeDisabled();
    expect(saveButtons().elements()).toHaveLength(0);
  });
});
