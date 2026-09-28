import { CircleAlert, Paperclip, X } from "lucide-react";
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
import { RequiredReasonField } from "../misc/RequiredReasonField";

import { TaskAttachmentFileInput } from "../tasks/TaskAttachmentFileInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DealStageGate } from "../types";
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
 * A reason is a claim, though, and typing one costs nothing. `gate` carries the
 * part that cannot be typed: how much work was actually completed on the deal
 * since it entered the stage it is leaving. It comes from the same database
 * function that will decide the move, so this dialog cannot enable its button
 * for something the server is about to refuse.
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
  gate,
  isGatePending,
  canOverride,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  dealName: string;
  fromStage: string;
  toStage: string;
  isPending?: boolean;
  /** What `deal_stage_gate()` answered. Absent means no rule is known to apply. */
  gate?: DealStageGate;
  /** The rule is still being read. Nothing is confirmable until it is known. */
  isGatePending?: boolean;
  /** Admins, and only admins, may move a deal past an unmet requirement. */
  canOverride?: boolean;
  onConfirm: (reason: string, files: File[], overrideReason?: string) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const { dealStages } = useConfigurationContext();
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [overrideReason, setOverrideReason] = useState("");

  // A fresh dialog per move: the previous reason must never be submitted for
  // the next card by a user who did not read the form again.
  useEffect(() => {
    if (open) {
      setReason("");
      setFiles([]);
      setOverrideReason("");
    }
  }, [open]);

  const trimmedReason = reason.trim();
  const trimmedOverride = overrideReason.trim();
  const isBlocked = gate != null && !gate.ok;
  // An admin still has to say why. An override nobody wrote down is the rule
  // quietly not existing.
  const isOverridden = isBlocked && canOverride && trimmedOverride !== "";
  const canConfirm =
    trimmedReason !== "" &&
    !isPending &&
    !isGatePending &&
    (!isBlocked || isOverridden);

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

        {isGatePending ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.deals.stage_change.requirement_checking")}
          </p>
        ) : null}

        {isBlocked ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-1">
              <span>
                {translate("resources.deals.stage_change.requirement_blocked", {
                  completed: gate.completed,
                  required: gate.required,
                  stage: stageLabel(fromStage),
                })}
              </span>
              <span className="text-muted-foreground">
                {translate("resources.deals.stage_change.requirement_hint")}
              </span>
            </div>
          </div>
        ) : null}

        <RequiredReasonField
          id="deal-stage-change-reason"
          label={translate("resources.deals.stage_change.reason")}
          value={reason}
          rows={4}
          placeholder={translate(
            "resources.deals.stage_change.reason_placeholder",
          )}
          onChange={setReason}
        />

        {isBlocked && canOverride ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="deal-stage-change-override">
              {translate("resources.deals.stage_change.override")}
            </Label>
            <Textarea
              id="deal-stage-change-override"
              value={overrideReason}
              rows={2}
              placeholder={translate(
                "resources.deals.stage_change.override_placeholder",
              )}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {translate("resources.deals.stage_change.override_hint")}
            </p>
          </div>
        ) : null}

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
            disabled={!canConfirm}
            onClick={() =>
              isOverridden
                ? onConfirm(trimmedReason, files, trimmedOverride)
                : onConfirm(trimmedReason, files)
            }
          >
            {translate("resources.deals.stage_change.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
