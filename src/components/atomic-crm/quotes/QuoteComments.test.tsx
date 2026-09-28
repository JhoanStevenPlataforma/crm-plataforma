import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { Conversation } from "./QuoteShow.stories";

/**
 * A write, the read mark and the refetch, each over the demo provider's
 * simulated latency: about 1.5 s measured, past the one-second default.
 */
const SETTLED = { timeout: 5000 };

/**
 * The team's side of the thread, through the REAL route (`/quotes/1/show`) over
 * the demo provider and its mirror of the `quote_comments` triggers. The
 * signed-in user is Jane Doe (id 0), who owns the quote and wrote comments 1
 * and 4; Carlos Ruiz wrote the reply; Lucía Gómez is the customer.
 */
describe("QuoteComments", () => {
  beforeAll(() => {
    // The mobile admin registers no quote routes at all.
    page.viewport(1600, 900);
  });

  const threadOf = (screen: Awaited<ReturnType<typeof render>>) =>
    screen.getByRole("region", { name: "Conversation" });

  it("shows whom every comment reaches, the customer's address, and a deleted one as a tombstone", async () => {
    const screen = await render(<Conversation />);
    const thread = threadOf(screen);

    await expect
      .element(thread.getByText(/Could the onboarding\s+start in October\?/))
      .toBeVisible();
    await expect
      .element(thread.getByText("<lucia@acme.example>"))
      .toBeVisible();
    await expect.element(thread.getByText("on version 1")).toBeVisible();
    await expect
      .element(thread.getByText("Unread", { exact: true }))
      .toBeVisible();
    await expect.element(thread.getByText("Carlos Ruiz")).toBeVisible();
    expect(thread.getByText("Internal", { exact: true }).all()).toHaveLength(2);

    await expect
      .element(thread.getByText("This comment was deleted."))
      .toBeVisible();
    await expect
      .element(thread.getByText("A message taken back"))
      .not.toBeInTheDocument();
  });

  it("lets only the author change a team comment, and offers a reply on roots only", async () => {
    const screen = await render(<Conversation />);
    const thread = threadOf(screen);
    await expect
      .element(thread.getByText("Purchasing confirms stock for October."))
      .toBeVisible();

    // Two live roots, so two replies; the colleague's reply offers none, and
    // neither the customer's words nor the colleague's can be edited.
    expect(thread.getByRole("button", { name: "Reply" }).all()).toHaveLength(2);
    await thread.getByRole("button", { name: "Edit", exact: true }).click();
    await thread
      .getByRole("textbox", { name: "Write a comment…" })
      .first()
      .fill("Purchasing confirms stock for October and November.");
    await thread.getByRole("button", { name: "Save" }).click();

    await expect
      .element(
        thread.getByText("Purchasing confirms stock for October and November."),
      )
      .toBeVisible();
    await expect
      .element(thread.getByText("edited", { exact: true }))
      .toBeVisible();

    await thread.getByRole("button", { name: "Delete", exact: true }).click();
    // Asked first: the text cannot be recovered afterwards.
    const confirm = screen.getByRole("dialog", {
      name: "Delete this comment?",
    });
    await expect.element(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect
      .element(
        thread.getByText("Purchasing confirms stock for October and November."),
      )
      .not.toBeInTheDocument();
    expect(thread.getByText("This comment was deleted.").all()).toHaveLength(2);
  });

  it("keeps a comment internal unless its author shares it, and an internal one does not answer the customer", async () => {
    const screen = await render(<Conversation />);
    const thread = threadOf(screen);

    await thread.getByRole("button", { name: "Reply" }).nth(1).click();
    await thread
      .getByRole("textbox", { name: "Write a comment…" })
      .first()
      .fill("Asking delivery now.");
    await thread
      .getByRole("button", { name: "Comment", exact: true })
      .first()
      .click();

    const reply = thread
      .getByRole("listitem")
      .filter({ hasText: "Asking delivery now." })
      .last();
    await expect.element(reply).toBeVisible();
    await expect
      .element(reply.getByText("Internal", { exact: true }))
      .toBeVisible();
    await expect
      .element(thread.getByText("Unread", { exact: true }))
      .toBeVisible();
  });

  it("sends a shared comment to the customer, which answers them and clears the unread mark", async () => {
    const screen = await render(<Conversation />);
    const thread = threadOf(screen);

    await thread
      .getByRole("switch", { name: "Share with the customer" })
      .click();
    await thread
      .getByRole("textbox", { name: "Write a comment…" })
      .fill("We can start on October 6.");
    await thread.getByRole("button", { name: "Send to the customer" }).click();

    const sent = thread
      .getByRole("listitem")
      .filter({ hasText: "We can start on October 6." });
    await expect
      .element(sent.getByText("Shared with the customer"))
      .toBeVisible();
    await expect
      .element(thread.getByText("Unread", { exact: true }), SETTLED)
      .not.toBeInTheDocument();
  });

  it("marks the customer's comments read when somebody says so", async () => {
    const screen = await render(<Conversation />);
    const thread = threadOf(screen);

    await thread
      .getByRole("button", { name: "Mark 1 customer comment as read" })
      .click();

    await expect
      .element(thread.getByText("Unread", { exact: true }), SETTLED)
      .not.toBeInTheDocument();
    await expect
      .element(thread.getByRole("button", { name: /as read/ }))
      .not.toBeInTheDocument();
  });
});
