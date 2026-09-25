import { ArrowRight } from "lucide-react";
import { useGetList, useTranslate } from "ra-core";
import { Link } from "react-router";

import { quoteShowPath } from "../quotes/quotePaths";
import { QuoteStatusBadge } from "../quotes/QuoteStatusBadge";
import type { QuoteStatus, TimelineEvent } from "../types";

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const readId = (value: unknown): string | number | null =>
  typeof value === "string" || typeof value === "number" ? value : null;

/** The quotation an entry is about, as a link to its page. */
export const QuoteReference = ({ event }: { event: TimelineEvent }) => {
  const payload = event.payload ?? {};
  const quoteId = readId(payload.quote_id);
  const number = readString(payload.quote_number);
  if (quoteId == null || !number) return null;
  return (
    <Link
      to={quoteShowPath(quoteId)}
      className="font-medium text-brand-strong underline-offset-2 hover:underline"
    >
      {number}
    </Link>
  );
};

/**
 * The body of a quotation's entry on a deal's timeline: which quotation, what
 * moved (status before → after, with the labels the installation gave them),
 * and why when somebody wrote it down. A customer's comment says who wrote;
 * the words themselves are read on the quotation's own page.
 *
 * Everything comes from the payload the view already carries; the status
 * labels are one cached list for the whole timeline.
 */
export const QuoteEventDetails = ({ event }: { event: TimelineEvent }) => {
  const translate = useTranslate();
  const { data: statuses = [] } = useGetList<QuoteStatus>("quote_statuses", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "rank", order: "ASC" },
  });
  const labelOf = (key: string | null) =>
    statuses.find((status) => status.key === key)?.label ?? key;

  const payload = event.payload ?? {};
  const fromStatus = readString(payload.from_status);
  const toStatus = readString(payload.to_status);
  const reason = readString(payload.reason);

  if (event.event_type === "quote.commented") {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <QuoteReference event={event} />
        <span className="text-muted-foreground">
          {translate("resources.deals.quote_history.commented", {
            name:
              readString(payload.actor_name) ??
              translate("resources.deals.quote_history.customer"),
          })}
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <QuoteReference event={event} />
        {fromStatus ? (
          <>
            <QuoteStatusBadge
              statusKey={fromStatus}
              label={labelOf(fromStatus)}
            />
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
          </>
        ) : null}
        {toStatus ? (
          <QuoteStatusBadge statusKey={toStatus} label={labelOf(toStatus)} />
        ) : null}
      </div>
      {reason ? <p className="text-sm whitespace-pre-line">{reason}</p> : null}
    </div>
  );
};
