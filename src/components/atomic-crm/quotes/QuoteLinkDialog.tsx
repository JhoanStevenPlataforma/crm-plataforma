import { useTranslate } from "ra-core";

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

import type { QuoteLink } from "../types";
import { QuoteShareLinkField } from "./QuoteShareLinkField";

/**
 * The customer link, right after a version is sent.
 *
 * Since 2026-09-29 it is the quotation's PERMANENT link: the same address for
 * every version, which the customer keeps and which opens the newest issued
 * one. So this is a convenience, not the only copy — the quote's page shows the
 * link again at any time (`QuoteLinksPanel`) — and closing the dialog loses
 * nothing. It used to be the one time a per-version token could be read, and it
 * asked before letting an uncopied link go; that guard has nothing left to
 * protect.
 */
export const QuoteLinkDialog = ({
  link,
  onClose,
}: {
  /** Null while nothing was sent: the dialog is closed. */
  link: QuoteLink | null;
  onClose: () => void;
}) => {
  const translate = useTranslate();

  return (
    <Dialog
      open={link != null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("resources.quotes.link.title")}</DialogTitle>
          <DialogDescription>
            {translate("resources.quotes.link.description", {
              version: link?.version_number ?? 1,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="quote-link-url">
            {translate("resources.quotes.link.url")}
          </Label>
          {link ? (
            <QuoteShareLinkField id="quote-link-url" token={link.token} />
          ) : null}
          {link?.expires_at ? (
            <p className="text-xs text-muted-foreground">
              {translate("resources.quotes.link.expires", {
                date: new Date(link.expires_at).toLocaleDateString(),
              })}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>
            {translate("resources.quotes.link.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
