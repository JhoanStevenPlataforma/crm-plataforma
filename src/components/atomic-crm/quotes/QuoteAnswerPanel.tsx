import { useGetList, useTranslate } from "ra-core";
import { useId } from "react";

import { DateField } from "@/components/admin/date-field";
import { cn } from "@/lib/utils";

import { formatMoneyExact } from "../misc/reporting";
import type { QuotePortalEvent, QuoteVersion } from "../types";

/**
 * A version has one answer, so one event is all there is to find.
 */
const ANSWER_PAGE = { page: 1, perPage: 1 };

/**
 * What the customer answered, and the evidence of it (quotes §6.4, Phase 10).
 *
 * The answer was recorded in full from the first day the portal existed — who
 * accepted, with what address, by what method, the figure they agreed to, and
 * why a refusal was a refusal — and until this panel NOTHING inside the CRM
 * showed any of it. The document's banner says "accepted on the 4th by Lucía"
 * and stops there, which is the part that belongs on paper; the rest is the
 * team's record of how the answer arrived.
 *
 * THE VERSION IS THE SOURCE, the portal event is enrichment. The columns are
 * written in the same transaction as the status move and cannot disagree with
 * it, whereas an `offline` acceptance recorded by the team has no portal event
 * at all. So the panel renders from the version alone and treats a missing or
 * unreadable event as a fact it simply does not have — never as a failure.
 * That is also what makes it safe in demo mode, which has no portal (§13.6 #16)
 * and therefore no events collection to read.
 *
 * The event is worth the one request because of the REFUSAL: a decline records
 * its reason on the version but signs the name and the email onto the trail, so
 * without it "who declined" is unanswerable on this screen.
 *
 * Internal, never printed: `acceptance_evidence` is explicitly not in the
 * portal payload and not on the timeline. The address is evidence, not
 * authentication (§13.6 #15) — behind a proxy it is whatever the proxy wrote.
 */
export const QuoteAnswerPanel = ({
  version,
}: {
  version?: QuoteVersion | null;
}) => {
  const translate = useTranslate();
  const headingId = useId();
  const isAccepted = version?.accepted_at != null;
  const isRejected = version?.rejected_at != null;
  const hasAnswer = isAccepted || isRejected;

  const { data: events } = useGetList<QuotePortalEvent>(
    "quote_portal_events",
    {
      filter: {
        version_id: version?.id,
        "event_type@in": "(accepted,rejected)",
      },
      sort: { field: "occurred_at", order: "DESC" },
      pagination: ANSWER_PAGE,
    },
    { enabled: hasAnswer && version?.id != null, retry: false },
  );
  const event = events?.[0] ?? null;

  if (!version || !hasAnswer) return null;

  // The version's own columns first, the trail only where the version has no
  // column for it. `acceptance_evidence` deliberately supplies ONLY the
  // browser: its `version_number`, `currency` and `total` are a copy of the
  // three columns beside it on a row that is frozen forever, so preferring one
  // over the other would be a choice between two values that cannot differ —
  // and `token_id`, which link was used, means nothing to a reader without the
  // token's label.
  const evidence = version.acceptance_evidence ?? null;
  const name = version.accepted_by_name ?? event?.actor_name ?? null;
  const email = version.accepted_by_email ?? event?.actor_email ?? null;
  const address = version.accepted_ip ?? event?.ip_address ?? null;
  const userAgent = evidence?.user_agent ?? event?.user_agent ?? null;
  const reason = version.rejected_reason_code;

  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-medium">
        {translate("resources.quotes.answer.title")}
      </h3>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-md border px-3 py-2 text-sm",
          isAccepted && "border-success bg-success/5",
        )}
      >
        <p className="font-medium">
          {translate(
            isAccepted
              ? "resources.quotes.answer.accepted"
              : "resources.quotes.answer.rejected",
          )}
        </p>
        <dl className="flex flex-col gap-1.5 text-xs">
          <Fact label={translate("resources.quotes.answer.when")}>
            <DateField
              source={isAccepted ? "accepted_at" : "rejected_at"}
              record={version}
              showDate
              showTime
            />
          </Fact>
          {isRejected && reason ? (
            <Fact label={translate("resources.quotes.answer.reason")}>
              {/* The customer's own words for the code, not a second list:
                  the form that collected it reads these same labels. */}
              {translate(
                `resources.quotes.portal.reject_dialog.reasons.${reason}`,
              )}
            </Fact>
          ) : null}
          {isRejected && version.rejected_reason ? (
            <Fact label={translate("resources.quotes.answer.reason_detail")}>
              {/* Plain text, whoever wrote it (§6.6). */}
              <span className="whitespace-pre-line">
                {version.rejected_reason}
              </span>
            </Fact>
          ) : null}
          {name ? (
            <Fact label={translate("resources.quotes.answer.who")}>{name}</Fact>
          ) : null}
          {email ? (
            <Fact label={translate("resources.quotes.answer.email")}>
              {email}
            </Fact>
          ) : null}
          {isAccepted ? (
            <Fact label={translate("resources.quotes.answer.agreed")}>
              {translate("resources.quotes.answer.agreed_value", {
                version: version.version_number,
                total: formatMoneyExact(version.total, version.currency),
              })}
            </Fact>
          ) : null}
          {isAccepted && version.acceptance_method ? (
            <Fact label={translate("resources.quotes.answer.method")}>
              {translate(
                `resources.quotes.answer.methods.${version.acceptance_method}`,
              )}
            </Fact>
          ) : null}
          {address ? (
            <Fact label={translate("resources.quotes.answer.address")}>
              <span className="font-mono">{address}</span>
            </Fact>
          ) : null}
          {userAgent ? (
            <Fact label={translate("resources.quotes.answer.browser")}>
              <span className="break-all">{userAgent}</span>
            </Fact>
          ) : null}
        </dl>
        {address ? (
          <p className="text-xs text-muted-foreground">
            {translate("resources.quotes.answer.evidence_note")}
          </p>
        ) : null}
      </div>
    </section>
  );
};

const Fact = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-baseline gap-x-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0">{children}</dd>
  </div>
);
