import { Paperclip, X } from "lucide-react";
import { useTranslate } from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { TaskAttachmentFileInput } from "../tasks/TaskAttachmentFileInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { findDealLabel } from "./dealUtils";

/**
 * What happened to make this deal move? Asked at the moment of the drop.
 *
 * A kanban that writes `stage` and nothing else produces a board full of cards
 * nobody can account for a month later: the deal is in "proposal sent", and the
 * reason lives in somebody's inbox. The reason is required here for the same
 * reason `move_deal_stage()` refuses a blank one — an optional field on a form
 * everyone is in a hurry to dismiss is an empty column.
 *
 * The dialog never moves the deal itself. It collects, the caller persists, and
 * cancelling puts the card back where it was.
 */
export const DealStageChangeDialog = ({
  open,
  dealName,
  fromStage,
  toStage,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  dealName: string;
  fromStage: string;
  toStage: string;
  isPending?: boolean;
  onConfirm: (reason: string, files: File[]) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const { dealStages } = useConfigurationContext();
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // A fresh dialog per move: the previous reason must never be submitted for
  // the next card by a user who did not read the form again.
  useEffect(() => {
    if (open) {
      setReason("");
      setFiles([]);
    }
  }, [open]);

  const trimmedReason = reason.trim();
  // A stage configured after this deal was created has no label; showing the
  // raw value beats showing "undefined".
  const stageLabel = (stage: string) =>
    findDealLabel(dealStages, stage) ?? stage;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate("resources.deals.stage_change.title", {
              stage: stageLabel(toStage),
            })}
          </DialogTitle>
          <DialogDescription>
            {translate("resources.deals.stage_change.description", {
              deal: dealName,
              from: stageLabel(fromStage),
              to: stageLabel(toStage),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="deal-stage-change-reason">
            {translate("resources.deals.stage_change.reason")}
          </Label>
          <Textarea
            id="deal-stage-change-reason"
            value={reason}
            rows={4}
            autoFocus
            placeholder={translate(
              "resources.deals.stage_change.reason_placeholder",
            )}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <TaskAttachmentFileInput
            label="resources.deals.stage_change.add_files"
            isPending={isPending}
            onSelect={(selected) =>
              setFiles((current) => [...current, ...selected])
            }
          />

          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={isPending}
                    aria-label={translate(
                      "resources.deals.stage_change.remove_file",
                      { name: file.name },
                    )}
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={onCancel}>
            {translate("ra.action.cancel")}
          </Button>
          <Button
            disabled={trimmedReason === "" || isPending}
            onClick={() => onConfirm(trimmedReason, files)}
          >
            {translate("resources.deals.stage_change.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
