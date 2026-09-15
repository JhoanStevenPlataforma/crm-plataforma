import { useTranslate } from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import {
  portalErrorKeyOf,
  type QuotePortalAcceptance,
  type QuotePortalErrorKey,
} from "./quotePortalClient";

/**
 * The shape `quote_portal_begin_answer()` accepts, checked here too so the
 * button is never enabled for an answer bound to bounce. The server decides.
 */
export const PORTAL_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * "I accept", signed.
 *
 * An acceptance is a commercial commitment recorded against a name, an email
 * address and a moment, so the form asks for them explicitly. Name and email
 * are PREFILLED with the addressee the document names — the person it was
 * prepared for is the likeliest signatory — and editable, because it is often
 * somebody else who signs. The description repeats the version and the total:
 * what is accepted is that document, at that figure.
 *
 * When the server still refuses (a newer version was issued, the offer expired
 * while the page was open), its sentence appears in this dialog, where the
 * customer is looking, rather than behind it.
 */
export const QuotePortalAcceptDialog = ({
  open,
  number,
  versionNumber,
  total,
  defaultName,
  defaultEmail,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  number: string;
  versionNumber: number;
  /** Already formatted, in the document's currency. */
  total: string;
  defaultName: string;
  defaultEmail: string;
  onCancel: () => void;
  /** Resolves once the answer is recorded; rejects with the server's refusal. */
  onSubmit: (answer: QuotePortalAcceptance) => Promise<void>;
}) => {
  const translate = useTranslate();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<QuotePortalErrorKey | null>(null);

  // A fresh form every time it opens: a confirmation ticked for one attempt
  // must never carry over, unread, to the next.
  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setEmail(defaultEmail);
    setIsConfirmed(false);
    setError(null);
  }, [open, defaultName, defaultEmail]);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const isValid =
    trimmedName !== "" &&
    PORTAL_EMAIL_PATTERN.test(trimmedEmail) &&
    isConfirmed;

  const submit = async () => {
    setIsPending(true);
    setError(null);
    try {
      await onSubmit({ name: trimmedName, email: trimmedEmail });
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
            {translate("resources.quotes.portal.accept_dialog.title", {
              number,
            })}
          </DialogTitle>
          <DialogDescription>
            {translate("resources.quotes.portal.accept_dialog.description", {
              version: versionNumber,
              total,
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid && !isPending) void submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="quote-portal-accept-name">
              {translate("resources.quotes.portal.accept_dialog.name")}
            </Label>
            <Input
              id="quote-portal-accept-name"
              value={name}
              autoComplete="name"
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quote-portal-accept-email">
              {translate("resources.quotes.portal.accept_dialog.email")}
            </Label>
            <Input
              id="quote-portal-accept-email"
              type="email"
              value={email}
              autoComplete="email"
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="quote-portal-accept-confirm"
              checked={isConfirmed}
              onCheckedChange={(checked) => setIsConfirmed(checked === true)}
            />
            <Label
              htmlFor="quote-portal-accept-confirm"
              className="leading-snug font-normal"
            >
              {translate("resources.quotes.portal.accept_dialog.confirm")}
            </Label>
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
            <Button type="submit" disabled={!isValid || isPending}>
              {translate("resources.quotes.portal.accept_dialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
