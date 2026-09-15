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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import { PORTAL_EMAIL_PATTERN } from "./QuotePortalAcceptDialog";
import {
  portalErrorKeyOf,
  QUOTE_REJECTION_REASONS,
  type QuotePortalErrorKey,
  type QuotePortalRejection,
  type QuoteRejectionReason,
} from "./quotePortalClient";

const isRejectionReason = (value: string): value is QuoteRejectionReason =>
  (QUOTE_REJECTION_REASONS as readonly string[]).includes(value);

/**
 * "No, and here is why."
 *
 * The reason is required — it is what makes "why do we lose deals" a report
 * rather than a guess — and everything else is optional. A customer asked to
 * fill in a form in order to say no mostly says nothing at all, so the name and
 * the email are not prefilled and not demanded: a decline is not a commitment,
 * and the link already records whom it was sent to.
 */
export const QuotePortalRejectDialog = ({
  open,
  number,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  number: string;
  onCancel: () => void;
  /** Resolves once the answer is recorded; rejects with the server's refusal. */
  onSubmit: (answer: QuotePortalRejection) => Promise<void>;
}) => {
  const translate = useTranslate();
  const [reasonCode, setReasonCode] = useState<QuoteRejectionReason | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<QuotePortalErrorKey | null>(null);

  useEffect(() => {
    if (!open) return;
    setReasonCode(null);
    setReason("");
    setName("");
    setEmail("");
    setError(null);
  }, [open]);

  const trimmedEmail = email.trim();
  const isValid =
    reasonCode != null &&
    (trimmedEmail === "" || PORTAL_EMAIL_PATTERN.test(trimmedEmail));

  const submit = async (code: QuoteRejectionReason) => {
    setIsPending(true);
    setError(null);
    try {
      await onSubmit({
        reason_code: code,
        reason: reason.trim() || null,
        name: name.trim() || null,
        email: trimmedEmail || null,
      });
    } catch (caught) {
      setError(portalErrorKeyOf(caught));
    } finally {
      setIsPending(false);
    }
  };

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
            {translate("resources.quotes.portal.reject_dialog.title", {
              number,
            })}
          </DialogTitle>
          <DialogDescription>
            {translate("resources.quotes.portal.reject_dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid && reasonCode && !isPending) void submit(reasonCode);
          }}
        >
          <div className="flex flex-col gap-2">
            <p
              id="quote-portal-reject-reason-code"
              className="text-sm font-medium"
            >
              {translate("resources.quotes.portal.reject_dialog.reason_code")}
            </p>
            <RadioGroup
              aria-labelledby="quote-portal-reject-reason-code"
              value={reasonCode ?? ""}
              onValueChange={(value) => {
                if (isRejectionReason(value)) setReasonCode(value);
              }}
            >
              {QUOTE_REJECTION_REASONS.map((code) => (
                <div key={code} className="flex items-center gap-2">
                  <RadioGroupItem
                    id={`quote-portal-reject-${code}`}
                    value={code}
                  />
                  <Label
                    htmlFor={`quote-portal-reject-${code}`}
                    className="font-normal"
                  >
                    {translate(
                      `resources.quotes.portal.reject_dialog.reasons.${code}`,
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quote-portal-reject-reason">
              {translate("resources.quotes.portal.reject_dialog.reason")}
            </Label>
            <Textarea
              id="quote-portal-reject-reason"
              value={reason}
              rows={3}
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quote-portal-reject-name">
                {translate("resources.quotes.portal.reject_dialog.name")}
              </Label>
              <Input
                id="quote-portal-reject-name"
                value={name}
                autoComplete="name"
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quote-portal-reject-email">
                {translate("resources.quotes.portal.reject_dialog.email")}
              </Label>
              <Input
                id="quote-portal-reject-email"
                type="email"
                value={email}
                autoComplete="email"
                maxLength={320}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {translate(`resources.quotes.portal.errors.${error}`)}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onCancel}
            >
              {translate("ra.action.cancel")}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!isValid || isPending}
            >
              {translate("resources.quotes.portal.reject_dialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
