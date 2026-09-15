import { ArrowRight } from "lucide-react";
import { useDataProvider, useNotify, useTranslate } from "ra-core";

import { findDealLabel } from "../deals/dealUtils";
import { AttachmentList } from "../notes/NoteAttachments";
import type { CrmDataProvider } from "../providers/types";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { AttachmentNote, TimelineEvent } from "../types";

/**
 * The body of a `deal.stage_changed` entry: where the deal went, why, and with
 * which files.
 *
 * Everything comes from the event payload, which the view already carries — a
 * timeline that had to fetch one row per entry to explain itself would be a
 * request per event on a page that shows twenty-five.
 *
 * A move with no reason renders as such instead of silently rendering nothing:
 * these are the stage changes that bypassed the kanban dialog (the edit form,
 * an import), and hiding them is how a partial history starts reading as a
 * complete one. A move an admin pushed past the completed-task rule is called
 * out here for the same reason: an override only counts as written down if
 * somebody reading the deal can see it.
 */
export const StageChangeDetails = ({ event }: { event: TimelineEvent }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const { dealStages } = useConfigurationContext();

  const payload = event.payload ?? {};
  const fromStage = readString(payload.from_stage);
  const toStage = readString(payload.to_stage);
  const reason = readString(payload.reason);
  const attachments = readAttachments(payload.attachments);
  const overrideReason = readString(payload.override_reason);

  /**
   * Files written since the bucket became private carry a `path` and no `src`,
   * so the URL is minted here, on the click, and the storage policy re-checks
   * deal visibility at that moment. Opening in a new tab from inside the
   * handler is deliberate: the signed URL only lives for a minute, so it must
   * not be rendered into the page ahead of time.
   */
  const openAttachment = async (attachment: AttachmentNote) => {
    if (!attachment.path) return;
    try {
      const url = await dataProvider.getDealAttachmentUrl(attachment.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notify("resources.deals.stage_change.attachment_error", {
        type: "error",
      });
      console.error("openStageChangeAttachment.error", error);
    }
  };

  const stageLabel = (stage: string) =>
    findDealLabel(dealStages, stage) ?? stage;

  return (
    <div className="flex flex-col gap-1">
      {toStage ? (
        <div className="flex items-center gap-1.5 text-sm">
          {fromStage ? (
            <>
              <span className="text-muted-foreground">
                {stageLabel(fromStage)}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </>
          ) : null}
          <span className="font-medium">{stageLabel(toStage)}</span>
        </div>
      ) : null}

      {reason ? (
        <p className="text-sm whitespace-pre-line">{reason}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          {translate("resources.deals.stage_change.no_reason")}
        </p>
      )}

      {overrideReason ? (
        <p className="text-sm text-destructive whitespace-pre-line">
          {translate("resources.deals.stage_change.overridden", {
            reason: overrideReason,
          })}
        </p>
      ) : null}

      <AttachmentList attachments={attachments} onOpen={openAttachment} />
    </div>
  );
};

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/**
 * The payload is JSON from the database, so it is narrowed rather than cast: a
 * row written before a shape change must not crash the page it appears on.
 */
const readAttachments = (value: unknown): AttachmentNote[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is AttachmentNote =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { src?: unknown }).src === "string",
  );
};
