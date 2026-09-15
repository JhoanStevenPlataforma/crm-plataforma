import { render } from "vitest-browser-react";

import {
  Canceled,
  Draft,
  EmptyDraft,
  InsideTheReasonBand,
  LapsedDraft,
  OverTheCeiling,
  OverTheCeilingAsAdmin,
  PendingApprovalAsRep,
  Sent,
} from "./QuoteActions.stories";

type Screen = Awaited<ReturnType<typeof render>>;

const clickButton = (screen: Screen, name: string) =>
  screen.getByRole("button", { name, exact: true }).click();

/**
 * These run against the demo mirror of the RPCs, not against a mock: the status
 * machine, the freeze, the discount ceiling and the tokens are all evaluated
 * for real (`providers/fakerest/quoteMethods.ts`), by the same code the demo
 * app runs. A mocked data provider would assert that the buttons call something
 * — which is not the question. The question is whether the rules hold.
 */
describe("QuoteActions", () => {
  it("offers exactly the moves the status machine allows from a draft", async () => {
    const screen = await render(<Draft />);

    await expect
      .element(screen.getByRole("button", { name: "Send", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Request approval" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancel quote" }))
      .toBeVisible();
    // A draft has no issued document behind it, so there is nothing to revise.
    await expect
      .element(screen.getByRole("button", { name: "Revise" }))
      .not.toBeInTheDocument();
  });

  it("never offers the moves that belong to the customer or to the sweeper", async () => {
    // Asserted from `sent`, which is the state that HAS customer edges —
    // `sent -> viewed | accepted | rejected` and `sent -> expired`. The same
    // assertion on a draft would be vacuous: a draft has no such edge to hide.
    const screen = await render(<Sent />);

    await expect
      .element(screen.getByRole("button", { name: "Negotiate" }))
      .toBeVisible();
    for (const forbidden of ["Accept", "Reject", "Viewed", "Expire"]) {
      await expect
        .element(screen.getByRole("button", { name: forbidden }))
        .not.toBeInTheDocument();
    }
  });

  it("issues the document and hands over the customer link once, because it exists once", async () => {
    const screen = await render(<Draft />);

    await clickButton(screen, "Send");
    await clickButton(screen, "Send"); // confirm, in the dialog

    // The raw token — 64 hex characters, handed over at the only moment it is
    // knowable — inside the portal link, in its FRAGMENT, where no server ever
    // receives it. What is stored is its fingerprint.
    const link = screen.getByLabelText("Customer link");
    await expect.element(link).toBeVisible();
    await expect
      .element(link)
      .toHaveValue(expect.stringMatching(/\/quote#[0-9a-f]{64}$/));

    await clickButton(screen, "Done");

    // And the quote moved with it: one transaction in the database, one button
    // here.
    await expect.element(screen.getByText("Sent")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Revise" }))
      .toBeVisible();
  });

  it("refuses to send a document with no lines, and says which rule refused", async () => {
    const screen = await render(<EmptyDraft />);

    await clickButton(screen, "Send");
    await clickButton(screen, "Send");

    await expect
      .element(screen.getByText(/A quote with no lines cannot be sent/))
      .toBeVisible();
  });

  it("refuses to send an offer that already expired", async () => {
    const screen = await render(<LapsedDraft />);

    await clickButton(screen, "Send");
    await clickButton(screen, "Send");

    // The link would be clamped to a date in the past: dead on arrival
    // (§13.6 #12).
    await expect
      .element(screen.getByText(/The offer has already expired/))
      .toBeVisible();
  });

  it("blocks a rep over the ceiling and points at the approval, not at a longer sentence", async () => {
    const screen = await render(<OverTheCeiling />);

    await clickButton(screen, "Send");

    await expect
      .element(screen.getByText(/above the 5.00% allowed for you/))
      .toBeVisible();
    await expect
      .element(screen.getByText(/an approval raises the ceiling/))
      .toBeVisible();
    // No override box for a rep: a parameter they can fill in would be a probe
    // for a privilege they do not have.
    await expect
      .element(screen.getByLabelText("Override the ceiling"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Send", exact: true }).last())
      .toBeDisabled();
  });

  it("lets an admin past the ceiling only in writing", async () => {
    const screen = await render(<OverTheCeilingAsAdmin />);

    await clickButton(screen, "Send");

    const confirm = screen
      .getByRole("button", { name: "Send", exact: true })
      .last();
    // The rule applies to an admin too: what differs is that they have a way
    // through, and it costs a written motive.
    await expect.element(confirm).toBeDisabled();

    await screen
      .getByLabelText("Override the ceiling")
      .fill("Autorizado por direccion");

    await expect.element(confirm).toBeEnabled();
  });

  it("asks for a written motive inside the ceiling but above the band", async () => {
    const screen = await render(<InsideTheReasonBand />);

    await clickButton(screen, "Send");

    // 10% against a 25% ceiling: allowed, and above the 5% band, so it costs a
    // sentence. The gate REPORTS that, rather than the dialog recomputing it —
    // a written approval counts instead, and only the server knows about one.
    const confirm = screen
      .getByRole("button", { name: "Send", exact: true })
      .last();
    await expect.element(confirm).toBeDisabled();
    // The ceiling is not exceeded, so there is nothing to override.
    await expect
      .element(screen.getByLabelText("Override the ceiling"))
      .not.toBeInTheDocument();

    await screen
      .getByLabelText("Why this discount")
      .fill("Cierre de trimestre");

    await expect.element(confirm).toBeEnabled();
  });

  it("refuses to let a rep approve their own quote", async () => {
    const screen = await render(<PendingApprovalAsRep />);

    await clickButton(screen, "Approve");
    await screen.getByLabelText("Reason").fill("Va bien");
    await clickButton(screen, "Confirm");

    await expect
      .element(screen.getByText(/Only a manager can approve a quote/))
      .toBeVisible();
  });

  it("revises an issued quote into a new version instead of editing it", async () => {
    const screen = await render(<Sent />);

    await clickButton(screen, "Revise");
    await screen.getByLabelText("Reason").fill("El cliente pidio otro alcance");
    await clickButton(screen, "Confirm");

    // Back to a draft, and the moves a draft offers.
    await expect.element(screen.getByText("Draft")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Send", exact: true }))
      .toBeVisible();
  });

  it("withdraws the links to the version a revision replaced", async () => {
    const screen = await render(<Sent />);

    await clickButton(screen, "New link");
    await clickButton(screen, "Done");
    await expect.element(screen.getByText("Active")).toBeVisible();

    await clickButton(screen, "Revise");
    await screen.getByLabelText("Reason").fill("Cambio de alcance");
    await clickButton(screen, "Confirm");

    // Leaving it live would let a customer accept a version we have just
    // replaced, so the link stops working — and the panel says so rather than
    // disappearing, because this is exactly the moment somebody wants to check.
    await expect.element(screen.getByText("Inactive")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Revoke" }))
      .not.toBeInTheDocument();
    // And no new one is offered while the revision is open: the server refuses
    // it (`quote_draft_exists`), so a button for it would be a button that
    // always fails.
    await expect
      .element(screen.getByRole("button", { name: "New link" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(/A revision is open/)).toBeVisible();
  });

  it("says plainly that a closed quote has nothing left to move", async () => {
    const screen = await render(<Canceled />);

    await expect
      .element(screen.getByText(/This quote is closed/))
      .toBeVisible();
  });
});
