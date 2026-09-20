import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import {
  QuotePortalClientProvider,
  type QuotePortalPayload,
} from "./quotePortalClient";
import {
  createFakeQuotePortal,
  PORTAL_TOKEN,
  type FakeQuotePortal,
} from "./quotePortalFixtures";
import type * as Schedule from "./quotePortalPollSchedule";

// The real polling loop on a faster clock: a check every 20 ms, every 60 ms
// once checks are failing, and the real give-up threshold.
vi.mock("./quotePortalPollSchedule", async (importOriginal) => {
  const actual = await importOriginal<typeof Schedule>();
  return {
    ...actual,
    nextPollDelay: (failures: number) =>
      failures >= actual.GIVE_UP_AFTER_FAILURES
        ? null
        : failures >= actual.BACKOFF_AFTER_FAILURES
          ? 60
          : 20,
  };
});

/** Long enough for five back-off intervals: a check that should never come. */
const QUIET_PERIOD_MS = 300;

const renderPortal = async (portal: FakeQuotePortal) => {
  const screen = await render(
    <QuotePortalClientProvider value={portal.client}>
      <StoryWrapper initialEntries={[`/quote#${PORTAL_TOKEN}`]}>
        {null}
      </StoryWrapper>
    </QuotePortalClientProvider>,
  );
  await expect.element(screen.getByRole("article")).toBeVisible();
  return screen;
};

/** The team answers on the quote's page, in the shared thread. */
const teamAnswer =
  (body: string) =>
  (payload: QuotePortalPayload): QuotePortalPayload => ({
    ...payload,
    comments: [
      ...payload.comments,
      {
        author_kind: "internal",
        author_name: "Jane Doe",
        body,
        created_at: "2026-09-16T10:00:00.000Z",
        edited_at: null,
      },
    ],
  });

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

/**
 * The customer's page while it stays open (quotes §6.5): it asks whether the
 * document changed and opens it again only when it did. The server is the fake
 * portal, whose etag moves with every change the way the real hash does.
 */
describe("QuotePortalPage, kept current while open", () => {
  it("shows the team's answer without a reload, opening the document again only because it changed", async () => {
    const portal = createFakeQuotePortal();
    const screen = await renderPortal(portal);

    // Checks that find nothing new open nothing, so record no view.
    await expect.poll(() => portal.polls()).toBeGreaterThanOrEqual(3);
    expect(portal.views()).toBe(1);

    portal.change(teamAnswer("We can also start in September."));

    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });
    await expect
      .element(thread.getByText("We can also start in September."))
      .toBeVisible();
    expect(portal.views()).toBe(2);
  });

  it("keeps what the customer was typing when the document changes under it", async () => {
    const portal = createFakeQuotePortal();
    const screen = await renderPortal(portal);
    const thread = screen.getByRole("region", {
      name: "Questions and comments",
    });

    await thread
      .getByLabelText("Your message")
      .fill("And the invoice address?");
    portal.change(teamAnswer("We can also start in September."));

    await expect
      .element(thread.getByText("We can also start in September."))
      .toBeVisible();
    await expect
      .element(thread.getByLabelText("Your message"))
      .toHaveValue("And the invoice address?");
  });

  it("closes the acceptance dialog when the offer is withdrawn while it is open", async () => {
    const portal = createFakeQuotePortal();
    const screen = await renderPortal(portal);

    await screen.getByRole("button", { name: "Accept", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).toBeVisible();

    portal.change((payload) => ({
      ...payload,
      quote: { ...payload.quote, status: "canceled" },
      actions: { can_accept: false, can_reject: false, can_comment: false },
    }));

    await expect
      .element(screen.getByText(/can no longer be answered online/))
      .toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("says so when the link stops working, and leaves the copy the customer was reading", async () => {
    const portal = createFakeQuotePortal();
    const screen = await renderPortal(portal);

    portal.revoke();

    await expect
      .element(screen.getByText(/This link is no longer active/))
      .toBeVisible();
    await expect
      .element(screen.getByRole("article").getByText("Annual support"))
      .toBeVisible();
    for (const answer of ["Accept", "Decline"]) {
      await expect
        .element(screen.getByRole("button", { name: answer, exact: true }))
        .not.toBeInTheDocument();
    }
    await expect
      .element(screen.getByRole("button", { name: "Send message" }))
      .not.toBeInTheDocument();
  });

  it("says when it cannot check for changes, stops asking after a run of failures, and checks again when told to", async () => {
    const portal = createFakeQuotePortal();
    const screen = await renderPortal(portal);

    portal.failPollsWith("quote_portal_unavailable");
    const before = portal.polls();

    await expect
      .element(screen.getByText(/can't check this quotation for updates/))
      .toBeVisible();
    await expect.poll(() => portal.polls() - before).toBe(6);
    // An absence can only be observed over time.
    await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD_MS));
    expect(portal.polls() - before).toBe(6);

    portal.failPollsWith(null);
    portal.change(teamAnswer("Back online."));
    await screen.getByRole("button", { name: "Check now" }).click();

    await expect.element(screen.getByText("Back online.")).toBeVisible();
    await expect
      .element(screen.getByText(/can't check this quotation for updates/))
      .not.toBeInTheDocument();
  });

  it("asks nothing while the tab is hidden, and catches up as soon as it is back", async () => {
    const portal = createFakeQuotePortal();
    const screen = await renderPortal(portal);

    try {
      setVisibility("hidden");
      const before = portal.polls();
      portal.change(teamAnswer("Written while you were away."));

      await new Promise((resolve) => setTimeout(resolve, QUIET_PERIOD_MS));
      expect(portal.polls()).toBe(before);
      await expect
        .element(screen.getByText("Written while you were away."))
        .not.toBeInTheDocument();

      setVisibility("visible");

      await expect
        .element(screen.getByText("Written while you were away."))
        .toBeVisible();
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });
});
