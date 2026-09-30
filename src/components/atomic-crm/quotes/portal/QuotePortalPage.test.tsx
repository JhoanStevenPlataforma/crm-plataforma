import { StrictMode } from "react";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { QuotePortalClientProvider } from "./quotePortalClient";
import {
  createFakeQuotePortal,
  PORTAL_TOKEN,
  portalPayload,
} from "./quotePortalFixtures";
import {
  Accepted,
  AnswerRefused,
  Canceled,
  CommentRefused,
  DeadLink,
  NoComments,
  Open,
  Superseded,
  Unreachable,
} from "./QuotePortalPage.stories";

/**
 * Rendered through the REAL route (`/quote#<token>`), so these also prove the
 * portal is registered outside the layout and opens with no session: an
 * unregistered route renders nothing, and every assertion below would fail on
 * it. The server is the fake portal, which refuses with the server's keys.
 */
describe("QuotePortalPage", () => {
  it("shows the customer the quotation they were sent, under the installation's letterhead", async () => {
    const screen = await render(<Open />);

    const sheet = screen.getByRole("article", {
      name: "Quotation Q-2026-00042",
    });
    await expect.element(sheet.getByText("Acme Andina")).toBeVisible();
    await expect.element(sheet.getByText("Annual support")).toBeVisible();
    await expect.element(sheet.getByText("Acme CRM").first()).toBeVisible();
    await expect
      .element(sheet.getByText(/3,427,200\.00/).first())
      .toBeVisible();
    // The file name "Save as PDF" proposes.
    await expect.poll(() => document.title).toBe("Quotation Q-2026-00042");
  });

  it("records one view per open, under StrictMode too", async () => {
    const portal = createFakeQuotePortal();
    const screen = await render(
      <StrictMode>
        <QuotePortalClientProvider value={portal.client}>
          <StoryWrapper initialEntries={[`/quote#${PORTAL_TOKEN}`]}>
            {null}
          </StoryWrapper>
        </QuotePortalClientProvider>
      </StrictMode>,
    );

    await expect.element(screen.getByRole("article")).toBeVisible();
    expect(portal.views()).toBe(1);
  });

  it("takes an acceptance signed by the addressee, and the document then carries it", async () => {
    const screen = await render(<Open />);

    await screen.getByRole("button", { name: "Accept", exact: true }).click();
    const dialog = screen.getByRole("dialog");
    await expect
      .element(dialog.getByLabelText("Full name"))
      .toHaveValue("Lucía Gómez");
    await expect
      .element(dialog.getByLabelText("Email address"))
      .toHaveValue("lucia@acme.example");

    // Not until the customer says, in so many words, that they accept.
    const submit = dialog.getByRole("button", { name: "Accept quotation" });
    await expect.element(submit).toBeDisabled();
    await dialog.getByRole("checkbox").click();
    await submit.click();

    await expect
      .element(screen.getByText(/Your acceptance has been recorded/))
      .toBeVisible();
    await expect.element(screen.getByText(/by Lucía Gómez/)).toBeVisible();
    for (const answer of ["Accept", "Decline"]) {
      await expect
        .element(screen.getByRole("button", { name: answer, exact: true }))
        .not.toBeInTheDocument();
    }
  });

  it("takes a decline with its reason, and without a name", async () => {
    const screen = await render(<Open />);

    await screen.getByRole("button", { name: "Decline", exact: true }).click();
    const dialog = screen.getByRole("dialog");
    const submit = dialog.getByRole("button", { name: "Decline quotation" });
    await expect.element(submit).toBeDisabled();
    await dialog.getByRole("radio", { name: "Price" }).click();
    await submit.click();

    await expect
      .element(screen.getByText(/Your answer has been recorded/))
      .toBeVisible();
    await expect.element(screen.getByText(/^Declined on /)).toBeVisible();
  });

  it("says in the dialog why the server refused an answer", async () => {
    const screen = await render(<AnswerRefused />);

    await screen.getByRole("button", { name: "Accept", exact: true }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByRole("checkbox").click();
    await dialog.getByRole("button", { name: "Accept quotation" }).click();

    await expect
      .element(dialog.getByRole("alert"))
      .toHaveTextContent(/A newer version of this quotation was issued/);
  });

  it("offers no answer on a withdrawn quotation, and says whom to contact", async () => {
    const screen = await render(<Canceled />);

    await expect
      .element(
        screen.getByText(
          "This quotation can no longer be answered online. Please contact Jane Doe.",
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Accept", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Print / PDF" }))
      .toBeVisible();
  });

  it("lets an accepted document speak for itself", async () => {
    const screen = await render(<Accepted />);

    await expect
      .element(screen.getByText(/Accepted on .* by Lucía Gómez/))
      .toBeVisible();
    await expect
      .element(screen.getByText(/can no longer be answered online/))
      .not.toBeInTheDocument();
  });

  it("marks a superseded version on the paper and offers no answer on it", async () => {
    const screen = await render(<Superseded />);

    await expect
      .element(screen.getByText(/Superseded — a newer version/))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Accept", exact: true }))
      .not.toBeInTheDocument();
  });

  it("answers a dead link with one sentence, no document and nothing to retry", async () => {
    const screen = await render(<DeadLink />);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(/This link is not valid or is no longer active/);
    await expect.element(screen.getByRole("article")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Try again" }))
      .not.toBeInTheDocument();
  });

  it("shows the conversation, and marks the team's replies and their edits as such", async () => {
    const screen = await render(<Open />);

    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });
    await expect
      .element(thread.getByText(/Could the onboarding\s+start in October\?/))
      .toBeVisible();
    const reply = thread.getByRole("listitem").nth(1);
    await expect.element(reply.getByText("Jane Doe")).toBeVisible();
    await expect
      .element(reply.getByText("Sales team", { exact: true }))
      .toBeVisible();
    await expect
      .element(reply.getByText("edited", { exact: true }))
      .toBeVisible();
  });

  it("renders a message as the words typed, never as markup", async () => {
    const hostile = '<img src="x" alt="injected"> <b>bold</b>';
    const portal = createFakeQuotePortal({
      payload: {
        ...portalPayload,
        comments: [
          {
            author_kind: "customer",
            author_name: "Lucía Gómez",
            body: hostile,
            created_at: "2026-09-11T14:00:00.000Z",
            edited_at: null,
          },
        ],
      },
    });
    const screen = await render(
      <QuotePortalClientProvider value={portal.client}>
        <StoryWrapper initialEntries={[`/quote#${PORTAL_TOKEN}`]}>
          {null}
        </StoryWrapper>
      </QuotePortalClientProvider>,
    );

    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });
    await expect.element(thread.getByText(hostile)).toBeVisible();
    expect(thread.element().querySelector("img, b")).toBeNull();
  });

  it("takes a comment signed by the addressee, and it joins the thread", async () => {
    const screen = await render(<NoComments />);

    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });
    await expect.element(thread.getByText(/No messages yet/)).toBeVisible();
    await expect
      .element(thread.getByLabelText("Your name"))
      .toHaveValue("Lucía Gómez");
    const send = thread.getByRole("button", { name: "Send message" });
    await expect.element(send).toBeDisabled();

    await thread
      .getByLabelText("Your message")
      .fill("Can we pay in two instalments?");
    await send.click();

    await expect
      .element(thread.getByText("Can we pay in two instalments?"))
      .toBeVisible();
    await expect
      .element(thread.getByText("Your message has been sent."))
      .toBeVisible();
    await expect.element(thread.getByLabelText("Your message")).toHaveValue("");
  });

  it("says in the thread why the server refused a comment", async () => {
    const screen = await render(<CommentRefused />);

    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });
    await thread.getByLabelText("Your message").fill("One more thing");
    await thread.getByRole("button", { name: "Send message" }).click();

    await expect
      .element(thread.getByRole("alert"))
      .toHaveTextContent(/Too many messages from this link/);
  });

  it("keeps the conversation readable, and closed, once the quotation is answered", async () => {
    const screen = await render(<Accepted />);

    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });
    await expect
      .element(thread.getByText(/Could the onboarding/))
      .toBeVisible();
    await expect
      .element(
        thread.getByText("The conversation on this quotation is closed."),
      )
      .toBeVisible();
    await expect
      .element(thread.getByRole("button", { name: "Send message" }))
      .not.toBeInTheDocument();
  });

  it("offers a retry when the server could not be reached", async () => {
    const screen = await render(<Unreachable />);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(/cannot be reached right now/);
    await expect
      .element(screen.getByRole("button", { name: "Try again" }))
      .toBeVisible();
  });

  it("lets the customer read an older version from the same link, and answers only the one on screen", async () => {
    const portal = createFakeQuotePortal();
    const screen = await render(
      <QuotePortalClientProvider value={portal.client}>
        <StoryWrapper initialEntries={[`/quote#${PORTAL_TOKEN}`]}>
          {null}
        </StoryWrapper>
      </QuotePortalClientProvider>,
    );

    // The header names the version on screen, and offers every other one.
    const picker = screen.getByRole("button", {
      name: "Change version (showing Version 2)",
    });
    await picker.click();
    await expect
      .element(screen.getByRole("menuitemradio", { name: /Version 2/ }))
      .toHaveAttribute("aria-checked", "true");
    await screen.getByRole("menuitemradio", { name: /Version 1/ }).click();

    // Version 1 was declined and replaced: readable, not answerable.
    await expect
      .element(
        screen.getByText(
          /You are viewing version 1, which was replaced by version 2/,
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Accept", exact: true }))
      .not.toBeInTheDocument();

    // Back to the version on offer, which the answer then names.
    await screen.getByRole("button", { name: "View version 2" }).click();
    await screen.getByRole("button", { name: "Accept", exact: true }).click();
    const dialog = screen.getByRole("dialog");
    await dialog.getByRole("checkbox").click();
    await dialog.getByRole("button", { name: "Accept quotation" }).click();
    await expect
      .element(screen.getByText(/Your acceptance has been recorded/))
      .toBeVisible();

    // Every open used the same link: the page only named the version.
    expect(portal.openedVersions()).toEqual([null, 1, null]);
    expect(portal.answeredVersions()).toEqual([2]);
  });

  it("tells the customer a new version is being prepared, at the same link", async () => {
    const screen = await render(
      <QuotePortalClientProvider
        value={
          createFakeQuotePortal({
            payload: {
              ...portalPayload,
              quote: { ...portalPayload.quote, status: "draft" },
              actions: {
                can_accept: false,
                can_reject: false,
                can_comment: true,
              },
            },
          }).client
        }
      >
        <StoryWrapper initialEntries={[`/quote#${PORTAL_TOKEN}`]}>
          {null}
        </StoryWrapper>
      </QuotePortalClientProvider>,
    );

    await expect
      .element(
        screen.getByText(
          "Jane Doe is preparing a new version of this quotation. You will find it at this same link.",
        ),
      )
      .toBeVisible();
  });
});
