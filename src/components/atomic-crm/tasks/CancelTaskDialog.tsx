import { useTranslate } from "ra-core";
import { useState } from "react";

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
 * Cancelling a task requires a reason (proposal §4.4).
 *
 * This is not UI politeness: `transition_task()` refuses the move without one.
 * Asking here turns a database error into a prompt, and the reason ends up on
 * the `task.canceled` event, where it answers "why did this never happen?"
 * months later.
 */
export const CancelTaskDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) => {
  const translate = useTranslate();
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  const trimmed = reason.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("resources.tasks.cancel.title")}</DialogTitle>
          <DialogDescription>
            {translate("resources.tasks.cancel.description")}
          </DialogDescription>
        </DialogHeader>

        <RequiredReasonField
          id="task-cancel-reason"
          label={translate("resources.tasks.cancel.reason")}
          value={reason}
          onChange={setReason}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate("ra.action.cancel")}
          </Button>
          <Button
            disabled={trimmed === ""}
            onClick={() => {
              onConfirm(trimmed);
              setReason("");
            }}
          >
            {translate("resources.tasks.cancel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
