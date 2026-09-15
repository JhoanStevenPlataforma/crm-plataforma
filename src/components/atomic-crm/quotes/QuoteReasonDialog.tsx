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

/**
 * "Why?", asked at the moment of the move.
 *
 * Which moves need an answer is not this component's decision and not the
 * toolbar's either: `quote_transitions.requires_reason` says so, and the
 * database refuses the move without one (`quote_reason_required`). Approving,
 * sending back, revising and cancelling are the four that do — every one of
 * them is a decision somebody will have to account for later, and a version
 * chain whose reasons are missing is half an audit trail.
 *
 * The dialog never writes anything. It collects, the caller persists, and
 * cancelling leaves the quote exactly where it was.
 */
export const QuoteReasonDialog = ({
  open,
  title,
  description,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  isPending?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const [reason, setReason] = useState("");

  // A fresh dialog per move: the previous reason must never be submitted for
  // the next one by a user who did not read the form again.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="quote-reason">
            {translate("resources.quotes.dialog.reason")}
          </Label>
          <Textarea
            id="quote-reason"
            value={reason}
            rows={4}
            autoFocus
            placeholder={translate(
              "resources.quotes.dialog.reason_placeholder",
            )}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={onCancel}>
            {translate("ra.action.cancel")}
          </Button>
          <Button
            disabled={trimmed === "" || isPending}
            onClick={() => onConfirm(trimmed)}
          >
            {translate("resources.quotes.dialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
