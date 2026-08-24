import { useDataProvider, type DataProvider } from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { NotificationPreferences } from "./NotificationPreferences";
import type { NotificationPreference } from "../types";

// Saving writes a row and refreshes, so the effect lands a round-trip after
// the click.
const SETTLE = { timeout: 15000 };

const buildPreference = (
  overrides: Partial<NotificationPreference> = {},
): NotificationPreference => ({
  id: 1,
  sales_id: 0,
  timezone: "America/Bogota",
  quiet_hours_start: "22:00:00",
  quiet_hours_end: "07:00:00",
  digest_mode: false,
  digest_at: "08:00:00",
  muted_channels: [],
  max_per_hour: 20,
  dedupe_window_minutes: 60,
  ...overrides,
});

const renderPreferences = async (rows: NotificationPreference[] = []) => {
  let dataProvider: DataProvider | null = null;
  const Listener = () => {
    dataProvider = useDataProvider();
    return null;
  };

  const screen = await render(
    <StoryWrapper data={{ notification_preferences: rows }}>
      <Listener />
      <NotificationPreferences />
    </StoryWrapper>,
  );

  return { screen, getDataProvider: () => dataProvider! };
};

const listPreferences = async (dataProvider: DataProvider) => {
  const { data } = await dataProvider.getList<NotificationPreference>(
    "notification_preferences",
    {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    },
  );
  return data;
};

describe("NotificationPreferences", () => {
  it("shows the saved quiet hours", async () => {
    const { screen } = await renderPreferences([buildPreference()]);

    await expect
      .element(screen.getByLabelText(/quiet hours from/i))
      .toHaveValue("22:00");
    await expect
      .element(screen.getByLabelText(/quiet hours until/i))
      .toHaveValue("07:00");
  });

  it("offers in-app as a mutable channel", async () => {
    // In-app skips quiet hours and the digest because it never interrupts —
    // but opting out still has to mean opting out (§9.5).
    const { screen } = await renderPreferences([buildPreference()]);

    await expect.element(screen.getByLabelText(/in app/i)).toBeInTheDocument();
  });

  it("hides the digest hour until the digest is switched on", async () => {
    const { screen } = await renderPreferences([buildPreference()]);

    await expect
      .element(screen.getByLabelText(/send it at/i))
      .not.toBeInTheDocument();

    await screen.getByLabelText(/one daily message/i).click();

    await expect
      .element(screen.getByLabelText(/send it at/i))
      .toBeInTheDocument();
  });

  it("creates a row for a user who has never set preferences", async () => {
    const { screen, getDataProvider } = await renderPreferences([]);

    await screen.getByLabelText(/one daily message/i).click();
    await screen.getByRole("button", { name: /save/i }).click();

    await expect
      .poll(async () => (await listPreferences(getDataProvider()))[0], SETTLE)
      .toMatchObject({ sales_id: 0, digest_mode: true });
  });

  it("updates the existing row instead of creating a second one", async () => {
    const { screen, getDataProvider } = await renderPreferences([
      buildPreference(),
    ]);

    await screen.getByLabelText(/email/i).click();
    await screen.getByRole("button", { name: /save/i }).click();

    await expect
      .poll(
        async () =>
          (await listPreferences(getDataProvider()))[0]?.muted_channels,
        SETTLE,
      )
      .toEqual(["email"]);

    expect(await listPreferences(getDataProvider())).toHaveLength(1);
  });
});
