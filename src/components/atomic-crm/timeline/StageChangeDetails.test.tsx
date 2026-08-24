import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";
import type {
  AttachmentNote,
  Deal,
  DealStageChange,
} from "@/components/atomic-crm/types";

import { EntityTimeline } from "./EntityTimeline";

const deal = {
  id: 1,
  name: "Renovación Acme",
  company_id: 1,
  contact_ids: [],
  category: "other",
  stage: "proposal-sent",
  description: "",
  amount: 12000,
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: "2026-08-02T09:00:00.000Z",
  expected_closing_date: "2026-09-01",
  sales_id: 0,
  index: 0,
} satisfies Deal;

const buildStageChange = (
  overrides: Partial<DealStageChange> = {},
): DealStageChange => ({
  id: 1,
  deal_id: 1,
  from_stage: "opportunity",
  to_stage: "proposal-sent",
  reason: "Propuesta enviada tras la visita del martes",
  sales_id: 0,
  changed_at: "2026-08-02T09:00:00.000Z",
  attachments: [],
  ...overrides,
});

// A persisted attachment as it comes back from the database: the bytes are in
// the bucket, and `rawFile` is only ever set while a file is still in the form.
const storedAttachment = (): AttachmentNote =>
  ({
    src: "https://files.test/propuesta.pdf",
    title: "propuesta.pdf",
    type: "application/pdf",
    path: "propuesta.pdf",
  }) as AttachmentNote;

const renderTimeline = async (stageChanges: DealStageChange[]) =>
  render(
    <StoryWrapper data={{ deals: [deal], deal_stage_changes: stageChanges }}>
      <EntityTimeline entityType="deal" entityId={1} />
    </StoryWrapper>,
  );

describe("a stage change on the deal timeline", () => {
  it("shows where the deal went, why, and on whose call", async () => {
    const screen = await renderTimeline([buildStageChange()]);

    await expect.element(screen.getByText("Stage changed")).toBeVisible();
    await expect.element(screen.getByText("Opportunity")).toBeVisible();
    await expect.element(screen.getByText("Proposal Sent")).toBeVisible();
    await expect
      .element(screen.getByText("Propuesta enviada tras la visita del martes"))
      .toBeVisible();
    // Who moved it is half the answer: an audit line without an author is a
    // rumour.
    await expect.element(screen.getByText(/Jane Doe/)).toBeVisible();
  });

  it("links the files that justified the move", async () => {
    const screen = await renderTimeline([
      buildStageChange({
        attachments: [storedAttachment()],
      }),
    ]);

    const link = screen.getByRole("link", { name: "propuesta.pdf" });
    await expect.element(link).toBeVisible();
    await expect
      .element(link)
      .toHaveAttribute("href", "https://files.test/propuesta.pdf");
  });

  it("says so when a move was never explained", async () => {
    // The stage changed somewhere other than the kanban dialog — the edit form,
    // an import. Rendering nothing would let a partial history read as a
    // complete one.
    const screen = await renderTimeline([buildStageChange({ reason: null })]);

    await expect.element(screen.getByText("No reason recorded")).toBeVisible();
  });

  it("is visible without expanding the timeline's hidden changes", async () => {
    // A stage transition is the story of a deal, not the field-level noise the
    // timeline collapses by default.
    const screen = await renderTimeline([buildStageChange()]);

    await expect
      .element(screen.getByText("Propuesta enviada tras la visita del martes"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /show all changes/i }))
      .not.toBeInTheDocument();
  });
});
