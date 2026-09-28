import {
  ResourceContextProvider,
  useDataProvider,
  type DataProvider,
} from "ra-core";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Deal } from "../types";
import { DealShow } from "./DealShow";
import { getDealsByStage } from "./stages";

const deal = {
  id: 1,
  name: "Acme renewal",
  company_id: null,
  contact_ids: [],
  category: "",
  stage: "opportunity",
  description: "",
  amount: 1000,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: undefined,
  expected_closing_date: null,
  sales_id: 0,
  index: 0,
} as unknown as Deal;

describe("DealShow archive", () => {
  it("offers Undo after archiving, and Undo leaves the deal live", async () => {
    let dataProvider: DataProvider | null = null;
    const Listener = () => {
      dataProvider = useDataProvider();
      return null;
    };

    const screen = await render(
      <StoryWrapper data={{ deals: [deal] }}>
        <Listener />
        <ResourceContextProvider value="deals">
          <DealShow open id="1" />
        </ResourceContextProvider>
      </StoryWrapper>,
    );

    await screen.getByRole("button", { name: /archive/i }).click();
    const undo = screen.getByRole("button", { name: /undo/i });
    await expect.element(undo).toBeVisible();
    await undo.click();

    // Undone before the write left the browser: the stored deal never changed.
    await expect
      .poll(async () => {
        const { data } = await dataProvider!.getOne("deals", { id: 1 });
        return data.archived_at ?? null;
      })
      .toBeNull();
  });
});

describe("DealShow amount", () => {
  it("writes the amount as the board and the dashboard do ($1K, not $1.00K)", async () => {
    const screen = await render(
      <StoryWrapper data={{ deals: [deal] }}>
        <ResourceContextProvider value="deals">
          <DealShow open id="1" />
        </ResourceContextProvider>
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByText("$1K", { exact: true }))
      .toBeVisible();
  });
});

describe("getDealsByStage", () => {
  it("leaves out a deal whose archive is still pending", () => {
    const columns = getDealsByStage(
      [deal, { ...deal, id: 2, archived_at: "2026-09-28T00:00:00Z" }],
      [{ value: "opportunity", label: "Opportunity" }],
    );

    expect(columns.opportunity.map((d) => d.id)).toEqual([1]);
  });
});
