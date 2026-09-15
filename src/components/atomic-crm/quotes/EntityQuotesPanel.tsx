import { Plus } from "lucide-react";
import {
  useCanAccess,
  useGetList,
  useTranslate,
  type Identifier,
} from "ra-core";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { formatMoneyExact } from "../misc/reporting";
import type { QuoteSummary } from "../types";
import { QuoteStatusBadge } from "./QuoteStatusBadge";
import { quoteShowPath } from "./quotePaths";

/** A deal has a handful of quotes, and every one of them is worth showing. */
const PANEL_PAGE = { page: 1, perPage: 25 };

/**
 * The quotations raised against a deal (quotes §2.3, §9).
 *
 * Creating one NAVIGATES instead of opening inline the way `EntityTasksPanel`
 * does, and that is deliberate: `DealShow` is itself a dialog, and a line-items
 * repeater inside a dialog inside a dialog is not a usable form. The defaults
 * travel in the URL rather than in the router state so the link survives a
 * reload and can be shared.
 *
 * The deal is provenance, not ownership: `quotes.deal_id` is
 * `on delete set null`, because a quotation outlives the opportunity it was
 * raised against.
 */
export const EntityQuotesPanel = ({
  dealId,
  companyId,
  dealName,
}: {
  dealId: Identifier;
  companyId: Identifier;
  dealName?: string | null;
}) => {
  const translate = useTranslate();
  const { canAccess: canCreate } = useCanAccess({
    resource: "quotes",
    action: "create",
  });

  const { data: quotes, error } = useGetList<QuoteSummary>("quotes", {
    filter: { deal_id: dealId },
    sort: { field: "created_at", order: "DESC" },
    pagination: PANEL_PAGE,
  });

  const createLink = {
    pathname: "/quotes/create",
    search: `?source=${encodeURIComponent(
      JSON.stringify({
        deal_id: dealId,
        company_id: companyId,
        title: dealName ?? undefined,
      }),
    )}`,
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.panel.load_error")}
        </p>
      ) : (quotes ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.panel.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {(quotes ?? []).map((quote) => (
            <li key={quote.id} className="flex items-center gap-3 text-sm">
              <Link
                to={quoteShowPath(quote.id)}
                className="font-medium hover:underline"
              >
                {quote.quote_number}
              </Link>
              <span className="flex-1 truncate text-muted-foreground">
                {quote.title}
              </span>
              <QuoteStatusBadge
                statusKey={quote.status_key}
                label={quote.status_label}
              />
              <span className="tabular-nums">
                {formatMoneyExact(quote.total, quote.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canCreate ? (
        <div className="my-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-6 cursor-pointer"
          >
            <Link to={createLink}>
              <Plus className="h-4 w-4" />
              {translate("resources.quotes.action.new")}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
};
