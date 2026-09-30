import { Check, Copy, ExternalLink } from "lucide-react";
import { useTranslate } from "ra-core";
import { useEffect, useState } from "react";
import { useHref } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { quotePortalLocation } from "./portal/quotePortalPaths";

/**
 * The customer link as an address the rep can copy or open.
 *
 * The router builds it from `quotePortalLocation`, which puts the token in the
 * fragment, so the link is right whichever router the app runs under.
 *
 * "Open" is offered because the rep asked for it, and its title says what it
 * costs: the portal has no session, so it cannot tell the rep from the
 * customer, and opening the link is recorded as the customer's view — it moves
 * a sent quote to `viewed` (quotes §13.6 #13).
 */
export const QuoteShareLinkField = ({
  id,
  token,
}: {
  /** The input's id, for the label the caller renders. */
  id: string;
  token: string;
}) => {
  const translate = useTranslate();
  const [isCopied, setIsCopied] = useState(false);
  const href = useHref(quotePortalLocation(token));
  const url = new URL(href, window.location.href).toString();

  useEffect(() => setIsCopied(false), [token]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
    } catch {
      // A clipboard the browser refuses (an insecure origin, a denied
      // permission) costs the convenience, not the link: the field is
      // selectable, which is why the link is rendered rather than hidden.
      setIsCopied(false);
    }
  };

  const openLabel = translate("resources.quotes.link.open");

  return (
    <div className="flex gap-2">
      <Input
        id={id}
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
        className="shrink-0"
        aria-label={translate("resources.quotes.link.copy")}
        title={translate("resources.quotes.link.copy")}
        onClick={copy}
      >
        {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
      <Button
        asChild
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label={openLabel}
        title={`${openLabel} — ${translate("resources.quotes.link.open_counts")}`}
      >
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-4" />
        </a>
      </Button>
    </div>
  );
};
