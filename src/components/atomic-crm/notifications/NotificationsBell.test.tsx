import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { notificationLink } from "./notificationLink";
import {
  Empty,
  QuoteAnswered,
  TaskReminder,
} from "./NotificationsBell.stories";

/**
 * The bell, after the outbox was widened to carry subjects that are not tasks
 * (quotes proposal §8, Phase 11).
 *
 * The behaviour that matters is reachability: a rep told that a customer
 * accepted a quotation must be one click from that quotation. Rendered over the
 * demo provider with the real routes registered, so a link to a route that does
 * not exist would fail here rather than in production.
 */
describe("NotificationsBell", () => {
  beforeAll(() => {
    page.viewport(1600, 900);
  });

  it("shows what a customer did, in words the rep can act on", async () => {
    const screen = await render(<QuoteAnswered />);

    await screen.getByRole("button", { name: "Notifications" }).click();

    // Rendered from the row's translation key, not from its English columns:
    // the database says what happened, the client says it in the reader's
    // language (quotes §13.6 #18). The story's columns carry markers, so
    // showing them instead would be visible here.
    await expect
      .element(screen.getByText("Q-2026-00001 was accepted"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Clara Cliente accepted version 1"))
      .toBeVisible();
    await expect
      .element(screen.getByText(/UNTRANSLATED/))
      .not.toBeInTheDocument();
  });

  it("opens the quotation the notification is about", async () => {
    const screen = await render(<QuoteAnswered />);

    await screen.getByRole("button", { name: "Notifications" }).click();
    await screen.getByText("Q-2026-00001 was accepted").click();

    // The quotation's own page, reached through the real `/quotes/1/show`
    // route: this is the whole point of notifying somebody. And the dashboard
    // is gone, so the assertion above cannot be satisfied by standing still.
    await expect
      .element(screen.getByRole("article", { name: /Q-2026-00001/ }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Nothing to do here"))
      .not.toBeInTheDocument();
  });

  it("still marks a task reminder read, and still takes nobody anywhere", async () => {
    // The click handler was rewritten to navigate; the behaviour it already had
    // has to survive that. Reading is observable as the badge clearing.
    const screen = await render(<TaskReminder />);

    await expect.element(screen.getByText("1")).toBeVisible();

    await screen.getByRole("button", { name: "Notifications" }).click();
    await screen.getByText("Call Ana about the renewal").click();

    await expect.element(screen.getByText("1")).not.toBeInTheDocument();
    // And no navigation guess for a task: the reminder names its task, and
    // where the user goes from there is their call. The dashboard renders as
    // the `/` route, so it is on screen exactly as long as nothing navigated.
    await expect.element(screen.getByText("Nothing to do here")).toBeVisible();
  });

  it("opens no realtime socket in demo mode", async () => {
    // Arrange: the demo build defines a placeholder Supabase URL, and the bell
    // used to reach for the Supabase client on its own, so the demo retried a
    // socket to that placeholder forever. Recreated here: env set, sockets
    // recorded instead of opened.
    vi.stubEnv("VITE_SUPABASE_URL", "https://demo.example.org");
    vi.stubEnv("VITE_SB_PUBLISHABLE_KEY", "demo-key");
    const opened: string[] = [];
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor(url: string) {
          opened.push(String(url));
        }
        close() {}
      },
    );

    try {
      // Act
      const screen = await render(<Empty />);
      await screen.getByRole("button", { name: "Notifications" }).click();
      await expect
        .element(screen.getByText("You are all caught up"))
        .toBeVisible();
      // The subscription is set up after the first render; give it a moment
      // to have tried, since an absence has no event to wait for.
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Assert
      expect(opened).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("shows no badge when there is nothing to report", async () => {
    const screen = await render(<Empty />);

    await expect
      .element(screen.getByRole("button", { name: "Notifications" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Notifications" }).click();
    await expect
      .element(screen.getByText("You are all caught up"))
      .toBeVisible();
  });
});

/**
 * Which subjects are actionable is a product decision, not a rendering detail,
 * so it is pinned where it is decided.
 */
describe("notificationLink", () => {
  it("points a quote notification at its quotation", () => {
    expect(notificationLink({ entity_type: "quote", entity_id: 42 })).toBe(
      "/quotes/42/show",
    );
  });

  it("gives a task reminder nowhere to go", () => {
    expect(notificationLink({ entity_type: null, entity_id: null })).toBeNull();
  });

  it("refuses an entity kind this CRM has no route for", () => {
    // `task_entity` reserves `invoice` and `order` for modules that do not
    // exist yet; a link to a missing route is worse than no link, because it
    // lands the reader on a blank page instead of leaving the notice readable.
    expect(
      notificationLink({ entity_type: "invoice", entity_id: 42 }),
    ).toBeNull();
    expect(
      notificationLink({ entity_type: "order", entity_id: 42 }),
    ).toBeNull();
  });
});
