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
import { RequiredReasonField } from "../misc/RequiredReasonField";

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

        <RequiredReasonField
          id="quote-reason"
          label={translate("resources.quotes.dialog.reason")}
          value={reason}
          rows={4}
          placeholder={translate("resources.quotes.dialog.reason_placeholder")}
          onChange={setReason}
        />

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
