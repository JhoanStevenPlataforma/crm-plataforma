import { DragDropContext, type OnDragEndResponder } from "@hello-pangea/dnd";
import { useQuery } from "@tanstack/react-query";
import isEqual from "lodash/isEqual";
import {
  useDataProvider,
  useGetIdentity,
  useListContext,
  useNotify,
  useTranslate,
} from "ra-core";
import { useEffect, useMemo, useState } from "react";

import { useViewportFill } from "../misc/useViewportFill";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { isDealStageGateError } from "../providers/commons/dealStageGate";
import type { CrmDataProvider } from "../providers/types";
import type { CrmRole, Deal } from "../types";
import { DealBoardSignalsProvider } from "./DealBoardSignals";
import { DealColumn } from "./DealColumn";
import { planDealDrop, type DropTarget } from "./dealDrop";
import { DealStageChangeDialog } from "./DealStageChangeDialog";
import { closedDealStages, summarizePipeline } from "./pipelineFigures";
import type { DealsByStage } from "./stages";
import { findDealLabel } from "./dealUtils";
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
  const { dealStages, dealPipelineStatuses } = useConfigurationContext();
  const { data: unorderedDeals, isPending, refetch } = useListContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();

  const [dealsByStage, setDealsByStage] = useState<DealsByStage>(
    getDealsByStage([], dealStages),
  );
  const [pendingMove, setPendingMove] = useState<PendingStageMove | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [boardRef, boardHeight] = useViewportFill();
  const { identity } = useGetIdentity();

  // Read the rule for THIS move, from the same function that will decide it.
  // Asked once the card is dropped rather than for every card on the board: the
  // answer depends on the target column, so a board-wide prefetch would be one
  // request per card per column and still be stale by the time it is used.
  const { data: gate, isPending: isGatePending } = useQuery({
    queryKey: [
      "deals",
      "stageGate",
      pendingMove?.deal.id,
      pendingMove?.destination.stage,
    ],
    queryFn: () =>
      dataProvider.getDealStageGate(
        pendingMove!.deal.id,
        pendingMove!.destination.stage,
      ),
    enabled: pendingMove != null,
  });

  useEffect(() => {
    if (unorderedDeals) {
      const newDealsByStage = getDealsByStage(unorderedDeals, dealStages);
      if (!isEqual(newDealsByStage, dealsByStage)) {
        setDealsByStage(newDealsByStage);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unorderedDeals]);

  const closedStages = useMemo(
    () => closedDealStages(dealPipelineStatuses),
    [dealPipelineStatuses],
  );
  // Folded from the list data, so each column's share of the open pipeline
  // follows the board's filters.
  const summary = useMemo(
    () =>
      summarizePipeline(
        unorderedDeals ?? [],
        dealStages,
        closedStages,
        new Date(),
      ),
    [unorderedDeals, dealStages, closedStages],
  );

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

  const handleConfirmMove = async (
    reason: string,
    files: File[],
    overrideReason?: string,
  ) => {
    if (!pendingMove) return;

    setIsMoving(true);
    try {
      await updateDealStage(
        pendingMove.deal,
        pendingMove.destination,
        dataProvider,
        { reason, attachments: files, overrideReason },
      );
      notify("resources.deals.stage_change.success", {
        type: "success",
        messageArgs: {
          stage: findDealLabel(dealStages, pendingMove.destination.stage),
        },
      });
      setPendingMove(null);
    } catch (error: unknown) {
      // The move is refused (someone else's deal, a lost connection). The
      // refetch below puts the card back where the database says it is.
      //
      // The completed-task rule gets its own message: it is the only refusal
      // the user can act on, and "could not be moved" would send them looking
      // for a bug instead of for the task they have not finished.
      notify(
        isDealStageGateError(error)
          ? "resources.deals.stage_change.requirement_error"
          : "resources.deals.stage_change.error",
        { type: "error" },
      );
      setPendingMove(null);
    } finally {
      setIsMoving(false);
      refetch();
    }
  };

  return (
    <>
      {/* The board is the module: no figures band above it (the dashboard
          carries those), so it starts right under the filters. */}
      <div className="flex flex-col">
        <DealBoardSignalsProvider deals={unorderedDeals ?? []}>
          <DragDropContext
            onDragEnd={onDragEnd}
            dragHandleUsageInstructions={translate(
              "crm.kanban.drag_instructions",
            )}
          >
            {/* The board scrolls inside itself, both ways, and ends at the
                bottom of the viewport: its sideways scrollbar is always on
                screen instead of below the last card of the longest column.
                It is the one scroll container the drag library auto-scrolls. */}
            <div
              ref={boardRef}
              style={{ height: boardHeight }}
              className="-mx-1 flex items-start gap-3 overflow-auto overscroll-contain px-1 pb-3"
            >
              {dealStages.map((stage) => (
                <DealColumn
                  stage={stage.value}
                  deals={dealsByStage[stage.value]}
                  openAmount={summary.openAmount}
                  isClosed={closedStages.includes(stage.value)}
                  key={stage.value}
                />
              ))}
            </div>
          </DragDropContext>
        </DealBoardSignalsProvider>
      </div>

      {pendingMove ? (
        <DealStageChangeDialog
          open
          dealName={pendingMove.deal.name}
          fromStage={pendingMove.deal.stage}
          toStage={pendingMove.destination.stage}
          isPending={isMoving}
          gate={gate}
          isGatePending={isGatePending}
          canOverride={(identity?.role as CrmRole | undefined) === "admin"}
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
  stageChange?: {
    reason: string;
    attachments: File[];
    overrideReason?: string;
  },
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
        overrideReason: stageChange.overrideReason,
      }),
    ]);
  }
};
