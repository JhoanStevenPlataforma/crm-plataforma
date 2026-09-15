import { CircleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { QuoteDiscountGate } from "../types";
import { DEFAULT_TOKEN_DAYS } from "../providers/supabase/quoteMethods";

export type IssueQuoteInput = {
  tokenDays: number;
  tokenLabel: string | null;
  reason: string | null;
  overrideReason: string | null;
};

/**
 * Sending the document: the one irreversible step in the module.
 *
 * After this the version is frozen forever — the customer's copy has to still
 * render identically in a year — so the dialog states what is about to be
 * frozen instead of confirming in the abstract.
 *
 * `gate` is what cannot be typed: how much discount this document actually
 * grants against how much the person issuing it is allowed to grant. It comes
 * from `quote_discount_gate()`, the same function `issue_quote_version()` calls
 * to decide, which is why this dialog cannot enable its button for an issue the
 * server is about to refuse. THREE different answers, and they are not
 * interchangeable:
 *
 *   * `max_allowed: null` — no rule applies. Not the same as "satisfied", and
 *     said differently, because only one of the two means the control works.
 *   * `ok: false` — above the ceiling. An ADMIN may override, in writing; for
 *     anybody else the way forward is an approval, not a longer sentence.
 *   * `reason_required` — inside the ceiling, above the band that needs a
 *     written motive. A different field from the override and stored in a
 *     different place: this one lands on the `sent` history row.
 *
 * The dialog never issues anything. It collects, the caller persists.
 */
export const QuoteIssueDialog = ({
  open,
  quoteNumber,
  versionNumber,
  validUntil,
  gate,
  isGatePending,
  canOverride,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  quoteNumber: string;
  versionNumber?: number | null;
  validUntil?: string | null;
  /** What `quote_discount_gate()` answered; absent while it is being read. */
  gate?: QuoteDiscountGate;
  isGatePending?: boolean;
  /** Admins, and only admins, may issue past the ceiling. */
  canOverride?: boolean;
  isPending?: boolean;
  onConfirm: (input: IssueQuoteInput) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const [tokenDays, setTokenDays] = useState(String(DEFAULT_TOKEN_DAYS));
  const [tokenLabel, setTokenLabel] = useState("");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (open) {
      setTokenDays(String(DEFAULT_TOKEN_DAYS));
      setTokenLabel("");
      setReason("");
      setOverrideReason("");
    }
  }, [open]);

  const days = Number(tokenDays);
  const isBlocked = gate != null && !gate.ok;
  // THE TWO MOTIVES ARE NOT CUMULATIVE, and the server says which one applies:
  // `issue_quote_version()` checks the band reason only on the branch where the
  // gate PASSED — above the ceiling, the admin override is what is needed and
  // the band reason is never asked for (§13.4). Asking for both would be this
  // dialog refusing an issue the database would have accepted, which is the
  // same drift as enabling one it would refuse, pointed the other way.
  const needsReason = gate?.reason_required === true && !isBlocked;
  const trimmedReason = reason.trim();
  const trimmedOverride = overrideReason.trim();
  // An admin still has to say why. An override nobody wrote down is the rule
  // quietly not existing.
  const isOverridden =
    isBlocked && canOverride === true && trimmedOverride !== "";
  const canConfirm =
    !isPending &&
    !isGatePending &&
    Number.isFinite(days) &&
    days > 0 &&
    (!isBlocked || isOverridden) &&
    (!needsReason || trimmedReason !== "");

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
            {translate("resources.quotes.issue.title", { number: quoteNumber })}
          </DialogTitle>
          <DialogDescription>
            {translate("resources.quotes.issue.description", {
              version: versionNumber ?? 1,
            })}
          </DialogDescription>
        </DialogHeader>

        {isGatePending ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.quotes.issue.gate_checking")}
          </p>
        ) : null}

        {gate != null && gate.max_allowed == null ? (
          <p className="text-sm text-muted-foreground">
            {translate("resources.quotes.issue.gate_no_rule", {
              percent: gate.effective_discount_percent.toFixed(2),
            })}
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
                {translate("resources.quotes.issue.gate_blocked", {
                  percent: gate.effective_discount_percent.toFixed(2),
                  max: gate.max_allowed?.toFixed(2) ?? "",
                  lines: gate.offending_line_ids.length,
                })}
              </span>
              <span className="text-muted-foreground">
                {translate(
                  canOverride
                    ? "resources.quotes.issue.gate_blocked_admin"
                    : "resources.quotes.issue.gate_blocked_hint",
                )}
              </span>
            </div>
          </div>
        ) : null}

        {needsReason ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="quote-issue-reason">
              {translate("resources.quotes.issue.reason")}
            </Label>
            <Textarea
              id="quote-issue-reason"
              value={reason}
              rows={3}
              autoFocus
              placeholder={translate(
                "resources.quotes.issue.reason_placeholder",
              )}
              onChange={(event) => setReason(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {translate("resources.quotes.issue.reason_hint", {
                above: gate?.requires_reason_above?.toFixed(2) ?? "",
              })}
            </p>
          </div>
        ) : null}

        {isBlocked && canOverride ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="quote-issue-override">
              {translate("resources.quotes.issue.override")}
            </Label>
            <Textarea
              id="quote-issue-override"
              value={overrideReason}
              rows={2}
              placeholder={translate(
                "resources.quotes.issue.override_placeholder",
              )}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {translate("resources.quotes.issue.override_hint")}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-col gap-2 sm:w-32">
            <Label htmlFor="quote-issue-days">
              {translate("resources.quotes.issue.token_days")}
            </Label>
            <Input
              id="quote-issue-days"
              type="number"
              min={1}
              value={tokenDays}
              onChange={(event) => setTokenDays(event.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="quote-issue-label">
              {translate("resources.quotes.issue.token_label")}
            </Label>
            <Input
              id="quote-issue-label"
              value={tokenLabel}
              placeholder={translate(
                "resources.quotes.issue.token_label_placeholder",
              )}
              onChange={(event) => setTokenLabel(event.target.value)}
            />
          </div>
        </div>

        {/* A link never outlives the offer: the window is cut to the day after
            `valid_until`, so a long one can silently become a short one. Said
            here rather than discovered when the customer cannot open it. */}
        {validUntil ? (
          <p className="text-xs text-muted-foreground">
            {translate("resources.quotes.issue.token_clamped", {
              date: validUntil,
            })}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={onCancel}>
            {translate("ra.action.cancel")}
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                tokenDays: days,
                tokenLabel: tokenLabel.trim() || null,
                reason: trimmedReason || null,
                overrideReason: trimmedOverride || null,
              })
            }
          >
            {translate("resources.quotes.issue.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
