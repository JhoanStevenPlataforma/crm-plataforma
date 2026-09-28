import { Check, Copy } from "lucide-react";
import { useTranslate } from "ra-core";
import { useEffect, useState } from "react";
import { useHref } from "react-router";

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

import type { QuoteLink } from "../types";
import { quotePortalLocation } from "./portal/quotePortalPaths";

/**
 * The customer link, shown the one time it can be.
 *
 * The database stores only the token's sha256 (§6.2), so this is not a dialog
 * that can be reopened: closing it discards the only copy, and the way back is
 * to mint another link, never to look this one up. The wording says so, because
 * a rep hunting for a copy button that is not there is the predictable failure —
 * it is how HubSpot's stable-forever link has trained everyone to behave.
 *
 * This is the one place the token becomes an address (Phase 7). The router
 * builds it from `quotePortalLocation`, which puts the token in the fragment,
 * so the link is right whichever router the app runs under.
 *
 * There is no "open" button, on purpose: the portal cannot tell a rep from the
 * customer, and opening the link counts as the customer's view — it moves a
 * sent quote to `viewed`. The description says so.
 */
export const QuoteLinkDialog = ({
  link,
  onClose,
}: {
  /** Null while nothing has been minted: the dialog is closed. */
  link: QuoteLink | null;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const [isCopied, setIsCopied] = useState(false);
  // Closing discards the only copy of the link. A stray Escape or a click
  // outside used to do that silently; now, until the link has been copied,
  // any way of closing asks first.
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const href = useHref(quotePortalLocation(link?.token ?? ""));
  const url = link ? new URL(href, window.location.href).toString() : "";

  useEffect(() => {
    if (link) {
      setIsCopied(false);
      setIsConfirmingClose(false);
    }
  }, [link]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
    } catch {
      // A clipboard the browser refuses (an insecure origin, a denied
      // permission) costs the convenience, not the link: the field below is
      // selectable, which is why the link is rendered rather than hidden behind
      // the button.
      setIsCopied(false);
    }
  };

  const requestClose = () => {
    if (isCopied) {
      onClose();
    } else {
      setIsConfirmingClose(true);
    }
  };

  return (
    <Dialog
      open={link != null}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate("resources.quotes.link.title", {
              version: link?.version_number ?? 1,
            })}
          </DialogTitle>
          <DialogDescription>
            {translate("resources.quotes.link.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="quote-link-url">
            {translate("resources.quotes.link.url")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="quote-link-url"
              readOnly
              value={url}
              className="font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
              // Copying by hand (ctrl+C on the selected text) counts too.
              onCopy={() => setIsCopied(true)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={translate("resources.quotes.link.copy")}
              onClick={copy}
            >
              {isCopied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          {link?.expires_at ? (
            <p className="text-xs text-muted-foreground">
              {translate("resources.quotes.link.expires", {
                date: new Date(link.expires_at).toLocaleDateString(),
              })}
            </p>
          ) : null}
        </div>

        {isConfirmingClose ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-tint p-3 text-sm"
          >
            <p>{translate("resources.quotes.link.close_uncopied")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmingClose(false)}
              >
                {translate("resources.quotes.link.keep_open")}
              </Button>
              <Button variant="destructive" size="sm" onClick={onClose}>
                {translate("resources.quotes.link.close_anyway")}
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button onClick={requestClose}>
            {translate("resources.quotes.link.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
