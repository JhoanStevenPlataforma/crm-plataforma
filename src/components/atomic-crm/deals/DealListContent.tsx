import { DragDropContext, type OnDragEndResponder } from "@hello-pangea/dnd";
import isEqual from "lodash/isEqual";
import { useDataProvider, useListContext, useNotify } from "ra-core";
import { useEffect, useState } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";
import { DealColumn } from "./DealColumn";
import { planDealDrop, type DropTarget } from "./dealDrop";
import { DealStageChangeDialog } from "./DealStageChangeDialog";
import type { DealsByStage } from "./stages";
import { getDealsByStage } from "./stages";

/**
 * A drop that crosses columns, waiting for its justification.
 *
 * The card is already in its new column on screen — undoing that on every drop
 * to re-do it on confirm makes the board flicker — but nothing is written until
 * the dialog comes back. Cancelling recomputes the columns from the list data,
 * which never moved.
 */
type PendingStageMove = {
  deal: Deal;
  destination: DropTarget;
};

export const DealListContent = () => {
  const { dealStages } = useConfigurationContext();
  const { data: unorderedDeals, isPending, refetch } = useListContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();

  const [dealsByStage, setDealsByStage] = useState<DealsByStage>(
    getDealsByStage([], dealStages),
  );
  const [pendingMove, setPendingMove] = useState<PendingStageMove | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (unorderedDeals) {
      const newDealsByStage = getDealsByStage(unorderedDeals, dealStages);
      if (!isEqual(newDealsByStage, dealsByStage)) {
        setDealsByStage(newDealsByStage);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unorderedDeals]);

  if (isPending) return null;

  const onDragEnd: OnDragEndResponder = (result) => {
    const plan = planDealDrop(result, dealsByStage);
    if (plan.kind === "ignore") return;

    // compute local state change synchronously
    setDealsByStage(
      updateDealStageLocal(
        plan.deal,
        plan.source,
        { stage: plan.destination.stage, index: result.destination?.index },
        dealsByStage,
      ),
    );

    // Reordering inside a column changes no stage, so there is nothing to
    // explain: persist it straight away.
    if (plan.kind === "reorder") {
      updateDealStage(plan.deal, plan.destination, dataProvider).then(() => {
        refetch();
      });
      return;
    }

    // Crossing columns is a stage change, and a stage change is only written
    // once someone says why.
    setPendingMove({ deal: plan.deal, destination: plan.destination });
  };

  const handleCancelMove = () => {
    setPendingMove(null);
    // The card goes back where it was: the list data was never touched.
    setDealsByStage(getDealsByStage(unorderedDeals ?? [], dealStages));
  };

  const handleConfirmMove = async (reason: string, files: File[]) => {
    if (!pendingMove) return;

    setIsMoving(true);
    try {
      await updateDealStage(
        pendingMove.deal,
        pendingMove.destination,
        dataProvider,
        { reason, attachments: files },
      );
      setPendingMove(null);
    } catch {
      // The move is refused (someone else's deal, a lost connection). The
      // refetch below puts the card back where the database says it is.
      notify("resources.deals.stage_change.error", { type: "error" });
      setPendingMove(null);
    } finally {
      setIsMoving(false);
      refetch();
    }
  };

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4">
          {dealStages.map((stage) => (
            <DealColumn
              stage={stage.value}
              deals={dealsByStage[stage.value]}
              key={stage.value}
            />
          ))}
        </div>
      </DragDropContext>

      {pendingMove ? (
        <DealStageChangeDialog
          open
          dealName={pendingMove.deal.name}
          fromStage={pendingMove.deal.stage}
          toStage={pendingMove.destination.stage}
          isPending={isMoving}
          onConfirm={handleConfirmMove}
          onCancel={handleCancelMove}
        />
      ) : null}
    </>
  );
};

const updateDealStageLocal = (
  sourceDeal: Deal,
  source: { stage: string; index: number },
  destination: DropTarget,
  dealsByStage: DealsByStage,
) => {
  if (source.stage === destination.stage) {
    // moving deal inside the same column
    const column = dealsByStage[source.stage];
    column.splice(source.index, 1);
    column.splice(destination.index ?? column.length + 1, 0, sourceDeal);
    return {
      ...dealsByStage,
      [destination.stage]: column,
    };
  } else {
    // moving deal across columns
    const sourceColumn = dealsByStage[source.stage];
    const destinationColumn = dealsByStage[destination.stage];
    sourceColumn.splice(source.index, 1);
    destinationColumn.splice(
      destination.index ?? destinationColumn.length + 1,
      0,
      sourceDeal,
    );
    return {
      ...dealsByStage,
      [source.stage]: sourceColumn,
      [destination.stage]: destinationColumn,
    };
  }
};

const updateDealStage = async (
  source: Deal,
  destination: DropTarget,
  dataProvider: CrmDataProvider,
  stageChange?: { reason: string; attachments: File[] },
) => {
  if (source.stage === destination.stage) {
    // moving deal inside the same column
    // Fetch all the deals in this stage (because the list may be filtered, but we need to update even non-filtered deals)
    const { data: columnDeals } = await dataProvider.getList("deals", {
      sort: { field: "index", order: "ASC" },
      pagination: { page: 1, perPage: 100 },
      filter: { stage: source.stage },
    });
    const destinationIndex = destination.index ?? columnDeals.length + 1;

    if (source.index > destinationIndex) {
      // deal moved up, eg
      // dest   src
      //  <------
      // [4, 7, 23, 5]
      await Promise.all([
        // for all deals between destinationIndex and source.index, increase the index
        ...columnDeals
          .filter(
            (deal) =>
              deal.index >= destinationIndex && deal.index < source.index,
          )
          .map((deal) =>
            dataProvider.update("deals", {
              id: deal.id,
              data: { index: deal.index + 1 },
              previousData: deal,
            }),
          ),
        // for the deal that was moved, update its index
        dataProvider.update("deals", {
          id: source.id,
          data: { index: destinationIndex },
          previousData: source,
        }),
      ]);
    } else {
      // deal moved down, e.g
      // src   dest
      //  ------>
      // [4, 7, 23, 5]
      await Promise.all([
        // for all deals between source.index and destinationIndex, decrease the index
        ...columnDeals
          .filter(
            (deal) =>
              deal.index <= destinationIndex && deal.index > source.index,
          )
          .map((deal) =>
            dataProvider.update("deals", {
              id: deal.id,
              data: { index: deal.index - 1 },
              previousData: deal,
            }),
          ),
        // for the deal that was moved, update its index
        dataProvider.update("deals", {
          id: source.id,
          data: { index: destinationIndex },
          previousData: source,
        }),
      ]);
    }
  } else {
    // moving deal across columns
    // Fetch all the deals in both stages (because the list may be filtered, but we need to update even non-filtered deals)
    const [{ data: sourceDeals }, { data: destinationDeals }] =
      await Promise.all([
        dataProvider.getList("deals", {
          sort: { field: "index", order: "ASC" },
          pagination: { page: 1, perPage: 100 },
          filter: { stage: source.stage },
        }),
        dataProvider.getList("deals", {
          sort: { field: "index", order: "ASC" },
          pagination: { page: 1, perPage: 100 },
          filter: { stage: destination.stage },
        }),
      ]);
    const destinationIndex = destination.index ?? destinationDeals.length + 1;

    if (!stageChange) {
      throw new Error("A stage change needs a reason");
    }

    // The neighbours only shift position, so they stay plain updates. The
    // dragged deal goes through `moveDealStage`, which writes the move and the
    // reason for it in one transaction — the whole point of the dialog is that
    // the two cannot come apart.
    await Promise.all([
      // decrease index on the deals after the source index in the source columns
      ...sourceDeals
        .filter((deal) => deal.index > source.index)
        .map((deal) =>
          dataProvider.update("deals", {
            id: deal.id,
            data: { index: deal.index - 1 },
            previousData: deal,
          }),
        ),
      // increase index on the deals after the destination index in the destination columns
      ...destinationDeals
        .filter((deal) => deal.index >= destinationIndex)
        .map((deal) =>
          dataProvider.update("deals", {
            id: deal.id,
            data: { index: deal.index + 1 },
            previousData: deal,
          }),
        ),
      dataProvider.moveDealStage(source.id, destination.stage, {
        reason: stageChange.reason,
        index: destinationIndex,
        attachments: stageChange.attachments,
      }),
    ]);
  }
};
