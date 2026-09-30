import { ChevronDown } from "lucide-react";
import { useTranslate } from "ra-core";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { formatDocumentDate } from "../quoteDocumentData";
import type { QuotePortalVersion } from "./quotePortalClient";

/** How a version stands, in the words the customer reads beside its number. */
const versionStateKey = (version: QuotePortalVersion) =>
  version.outcome === "accepted"
    ? "accepted"
    : version.outcome === "rejected"
      ? "rejected"
      : version.is_current
        ? "current"
        : "superseded";

/**
 * The version pill of the portal's header, as a selector (2026-09-29).
 *
 * The link is the quotation's, so the customer can read every version it was
 * sent — newest first, each one named by how it stands: on offer, replaced,
 * accepted, declined. Choosing one changes the document below and nothing in
 * the address: the link stays exactly the one they were sent. The version on
 * screen is the checked one, and the pill names it.
 *
 * One version, or a list the page could not read, is a plain pill: there is
 * nothing to choose.
 */
export const QuotePortalVersionPicker = ({
  versions,
  shownNumber,
  isSwitching,
  onSelect,
}: {
  versions: QuotePortalVersion[];
  /** The version whose document is on screen. */
  shownNumber: number;
  isSwitching: boolean;
  onSelect: (versionNumber: number) => void;
}) => {
  const translate = useTranslate();
  const pill = "rounded-full border border-white/15 px-2.5 py-1.5";
  const shown = versions.find((version) => version.number === shownNumber);
  const label = translate("resources.quotes.document.version", {
    number: shownNumber,
  });
  const stateOf = (version: QuotePortalVersion) =>
    translate(`resources.quotes.portal.versions.${versionStateKey(version)}`);

  if (versions.length <= 1) {
    return <span className={pill}>{label}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translate("resources.quotes.portal.versions.choose", {
          version: label,
        })}
        disabled={isSwitching}
        className={cn(
          pill,
          "inline-flex items-center gap-1.5 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60",
        )}
      >
        <span>{label}</span>
        {shown ? (
          <span className="hidden text-foreground/70 sm:inline">
            · {stateOf(shown)}
          </span>
        ) : null}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {translate("resources.quotes.portal.versions.title")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(shownNumber)}
          onValueChange={(value) => {
            const next = Number(value);
            if (next !== shownNumber) onSelect(next);
          }}
        >
          {versions.map((version) => (
            <DropdownMenuRadioItem
              key={version.number}
              value={String(version.number)}
              className="flex flex-col items-start gap-0"
            >
              <span className="font-medium">
                {translate("resources.quotes.document.version", {
                  number: version.number,
                })}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {stateOf(version)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {translate("resources.quotes.portal.versions.issued", {
                  date: formatDocumentDate(version.issued_at),
                })}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
