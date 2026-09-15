import { useTranslate, type Identifier } from "ra-core";

import { cn } from "@/lib/utils";

import { formatMoneyExact } from "../misc/reporting";
import type { QuoteVersion } from "../types";
import { formatDocumentDate } from "./quoteDocumentData";

/**
 * The versions of a quotation, newest first, and which one the page shows
 * (quotes §4).
 *
 * `quote_versions` had no screen before this one, and `useQuoteDraft` only ever
 * reads the newest row — so the documents a customer was actually sent were
 * unreachable from the CRM the moment a revision was opened. Every version
 * stays readable here, frozen as it was issued.
 *
 * The newest row is the "current" one by the same rule `quotes_summary` uses
 * (`order by version_number desc limit 1`): the draft while one is open,
 * otherwise the latest issued document.
 */
export const QuoteVersionsPanel = ({
  versions,
  selectedId,
  onSelect,
  isUnknown,
}: {
  versions: QuoteVersion[];
  selectedId?: Identifier | null;
  onSelect: (id: Identifier) => void;
  isUnknown?: boolean;
}) => {
  const translate = useTranslate();

  if (isUnknown) {
    return (
      <p className="text-sm text-destructive">
        {translate("resources.quotes.versions.load_error")}
      </p>
    );
  }
  if (versions.length === 0) return null;

  const stateOf = (version: QuoteVersion) => {
    if (version.issued_at == null) {
      return translate("resources.quotes.versions.draft");
    }
    const issued = translate("resources.quotes.versions.issued", {
      date: formatDocumentDate(version.issued_at),
    });
    if (version.accepted_at != null) {
      return `${issued} · ${translate("resources.quotes.versions.accepted")}`;
    }
    if (version.rejected_at != null) {
      return `${issued} · ${translate("resources.quotes.versions.rejected")}`;
    }
    if (version.superseded_at != null) {
      return `${issued} · ${translate("resources.quotes.versions.superseded")}`;
    }
    return issued;
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {translate("resources.quotes.versions.title")}
      </h3>
      <ul className="flex flex-col gap-1">
        {versions.map((version, index) => {
          const isSelected = String(version.id) === String(selectedId);
          return (
            <li key={version.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(version.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "border-primary bg-accent",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {translate("resources.quotes.versions.view", {
                      number: version.version_number,
                    })}
                    {index === 0 ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {translate("resources.quotes.versions.current")}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    {formatMoneyExact(version.total, version.currency)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {stateOf(version)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
