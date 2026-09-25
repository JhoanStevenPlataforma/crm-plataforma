import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";
import type {
  Deal,
  DealStageChange,
  Quote,
  QuoteStatusChange,
} from "@/components/atomic-crm/types";

import { DEMO_QUOTE_STATUSES } from "../providers/fakerest/dataGenerator/quoteStatuses";
import { EntityTimeline } from "./EntityTimeline";

const deal = {
  id: 1,
  name: "Renovación Acme",
  company_id: 1,
  contact_ids: [],
  category: "other",
  stage: "won",
  description: "",
  amount: 3704,
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: "2026-08-02T09:00:00.000Z",
  expected_closing_date: "2026-09-01",
  sales_id: 0,
  index: 0,
} satisfies Deal;

const quote = {
  id: 7,
  quote_number: "Q-2026-00042",
  deal_id: 1,
  company_id: 1,
  sales_id: 0,
  currency: "COP",
  status_key: "accepted",
} as Quote;

const acceptedByCustomer: QuoteStatusChange = {
  id: 1,
  quote_id: 7,
  from_status: "viewed",
  to_status: "accepted",
  reason: null,
  sales_id: null,
  actor_kind: "customer",
  changed_at: "2026-08-03T10:00:00.000Z",
} as QuoteStatusChange;

const wonByTheQuote: DealStageChange = {
  id: 1,
  deal_id: 1,
  from_stage: "in-negociation",
  to_stage: "won",
  reason: "quote:accepted",
  sales_id: null,
  changed_at: "2026-08-03T10:00:01.000Z",
  source: "quote",
  quote_id: 7,
};

const renderTimeline = () =>
  render(
    <StoryWrapper
      data={{
        deals: [deal],
        quotes: [quote],
        quote_statuses: DEMO_QUOTE_STATUSES,
        quote_status_changes: [acceptedByCustomer],
        deal_stage_changes: [wonByTheQuote],
      }}
    >
      <EntityTimeline entityType="deal" entityId={1} />
    </StoryWrapper>,
  );

describe("a quotation on its deal's timeline", () => {
  it("says a stage change was the quotation's doing, and links to it", async () => {
    const screen = await renderTimeline();

    await expect
      .element(
        screen.getByText(
          "Moved automatically: the customer accepted the quotation",
        ),
      )
      .toBeVisible();
    const links = screen.getByRole("link", { name: "Q-2026-00042" });
    await expect
      .element(links.first())
      .toHaveAttribute("href", expect.stringContaining("/quotes/7/show"));
    // Not "no reason given": the move has a cause, it is just not typed prose.
    await expect
      .element(screen.getByText("No reason recorded"))
      .not.toBeInTheDocument();
  });

  it("shows the quotation's status change by default, as the customer's", async () => {
    const screen = await renderTimeline();

    await expect
      .element(screen.getByText("Quotation status changed"))
      .toBeVisible();
    await expect.element(screen.getByText("by the customer")).toBeVisible();
    await expect.element(screen.getByText("Accepted").first()).toBeVisible();
  });
});
