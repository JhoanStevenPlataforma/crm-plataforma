import type { DropResult } from "@hello-pangea/dnd";
import { describe, expect, test } from "vitest";

import type { Deal } from "../types";
import { planDealDrop } from "./dealDrop";

const buildDeal = (id: number, stage: string, index: number): Deal =>
  ({
    id,
    name: `Deal ${id}`,
    stage,
    index,
    amount: 1000,
    company_id: 1,
    contact_ids: [],
    category: "other",
    description: "",
    created_at: "2026-08-01T09:00:00.000Z",
    updated_at: "2026-08-01T09:00:00.000Z",
    expected_closing_date: "2026-09-01",
    sales_id: 0,
  }) as Deal;

const board = {
  opportunity: [buildDeal(1, "opportunity", 0), buildDeal(2, "opportunity", 1)],
  "proposal-sent": [buildDeal(3, "proposal-sent", 0)],
  won: [],
};

const drop = (
  from: { stage: string; index: number },
  to: { stage: string; index: number } | null,
): DropResult =>
  ({
    draggableId: "1",
    type: "DEFAULT",
    reason: "DROP",
    mode: "FLUID",
    source: { droppableId: from.stage, index: from.index },
    destination: to ? { droppableId: to.stage, index: to.index } : null,
  }) as DropResult;

describe("planDealDrop", () => {
  test("ignores a card dropped outside every column", () => {
    expect(
      planDealDrop(drop({ stage: "opportunity", index: 0 }, null), board),
    ).toEqual({ kind: "ignore" });
  });

  test("ignores a card put back exactly where it was", () => {
    expect(
      planDealDrop(
        drop(
          { stage: "opportunity", index: 0 },
          { stage: "opportunity", index: 0 },
        ),
        board,
      ),
    ).toEqual({ kind: "ignore" });
  });

  test("reorders within a column without asking anything", () => {
    // The deal did not change stage, so there is no decision to justify — only
    // a position to persist.
    const plan = planDealDrop(
      drop(
        { stage: "opportunity", index: 0 },
        { stage: "opportunity", index: 1 },
      ),
      board,
    );

    expect(plan.kind).toBe("reorder");
  });

  test("treats a move to another column as a stage change", () => {
    const plan = planDealDrop(
      drop(
        { stage: "opportunity", index: 0 },
        { stage: "proposal-sent", index: 0 },
      ),
      board,
    );

    expect(plan).toMatchObject({
      kind: "stage-change",
      deal: { id: 1, stage: "opportunity" },
      destination: { stage: "proposal-sent" },
    });
  });

  test("resolves the destination stage from an empty column", () => {
    // Nothing to land next to: the target stage comes from the column itself,
    // and the index is left for the caller to resolve against its real length.
    const plan = planDealDrop(
      drop({ stage: "opportunity", index: 0 }, { stage: "won", index: 0 }),
      board,
    );

    expect(plan).toMatchObject({
      kind: "stage-change",
      destination: { stage: "won", index: undefined },
    });
  });

  test("ignores a drop whose source card cannot be resolved", () => {
    // A stale board (a refetch landing mid-drag) must not move a deal picked
    // at random from the destination column.
    expect(
      planDealDrop(
        drop({ stage: "opportunity", index: 9 }, { stage: "won", index: 0 }),
        board,
      ),
    ).toEqual({ kind: "ignore" });
  });
});
