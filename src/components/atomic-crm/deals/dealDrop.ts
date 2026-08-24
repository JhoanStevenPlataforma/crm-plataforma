import type { DropResult } from "@hello-pangea/dnd";

import type { Deal } from "../types";
import type { DealsByStage } from "./stages";

/** Where a card landed. `index` is undefined when it was dropped past the last card. */
export type DropTarget = { stage: string; index?: number };

/**
 * What a drop on the kanban means.
 *
 * Kept apart from the component because the distinction it draws is the whole
 * rule of this feature: reordering a column is a position, crossing a column is
 * a decision about the deal, and only the second one needs a justification
 * before anything is written.
 */
export type DealDropPlan =
  | { kind: "ignore" }
  | {
      kind: "reorder";
      deal: Deal;
      source: { stage: string; index: number };
      destination: DropTarget;
    }
  | {
      kind: "stage-change";
      deal: Deal;
      source: { stage: string; index: number };
      destination: DropTarget;
    };

export const planDealDrop = (
  result: DropResult,
  dealsByStage: DealsByStage,
): DealDropPlan => {
  const { destination, source } = result;

  // Dropped outside any column.
  if (!destination) return { kind: "ignore" };

  // Picked up and put back down.
  if (
    destination.droppableId === source.droppableId &&
    destination.index === source.index
  ) {
    return { kind: "ignore" };
  }

  const deal = dealsByStage[source.droppableId]?.[source.index];
  if (!deal) return { kind: "ignore" };

  const target = dealsByStage[destination.droppableId]?.[destination.index] ?? {
    stage: destination.droppableId,
    // Undefined when dropped after the last card: the caller resolves it
    // against the column's real length, which the board does not know here.
    index: undefined,
  };

  return {
    kind:
      source.droppableId === destination.droppableId
        ? "reorder"
        : "stage-change",
    deal,
    source: { stage: source.droppableId, index: source.index },
    destination: { stage: target.stage, index: target.index },
  };
};
