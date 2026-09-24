import { useTranslate } from "ra-core";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { formatMoneyExact } from "../misc/reporting";
import { QuoteTotals } from "./QuoteTotals";
import {
  formatDocumentDate,
  type QuoteDocumentCompany,
  type QuoteDocumentData,
} from "./quoteDocumentData";
import "./quotePrint.css";

/** A quantity carries up to three decimals, and prints no trailing zeros. */
const formatQuantity = (quantity: number) =>
  quantity.toLocaleString("en-US", { maximumFractionDigits: 3 });

const addressLines = (company: QuoteDocumentCompany) =>
  [
    company.address,
    [[company.zipcode, company.city].filter(Boolean).join(" "), company.state]
      .filter(Boolean)
      .join(", "),
    company.country,
  ].filter((line): line is string => Boolean(line));

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
    {children}
  </h3>
);

/**
 * The quotation as a customer receives it (quotes §9).
 *
 * PLAIN PROPS, NEVER `RecordContext`, and no data fetching of any kind: the
 * customer portal (Phase 7) renders this same component with no data provider
 * behind it. Everything it prints arrives in `data`, built by
 * `quoteDocumentData.ts` — the one mapper, so the page, the print route and the
 * portal cannot print three different documents.
 *
 * Every value is rendered as React text. Nothing here is ever injected as HTML:
 * terms and line descriptions are typed by people, and on the portal they reach
 * a page anybody holding a link can open (§6.6).
 *
 * A draft and a superseded version say so ON THE PAPER, not only on the screen
 * around it. A PDF outlives the page it was printed from, and a draft forwarded
 * by email is otherwise indistinguishable from the offer.
 *
 * `footer` is the portal's answer bar, rendered inside the sheet so the buttons
 * sit under the figure they answer. The caller marks it `quote-print-hide`: a
 * button on paper is a button nobody can press.
 */
export const QuoteDocument = ({
  data,
  className,
  footer,
}: {
  data: QuoteDocumentData;
  className?: string;
  footer?: ReactNode;
}) => {
  const translate = useTranslate();
  const { quote, parties, lines, totals, terms, branding, acceptance } = data;
  const currency = quote.currency;

  return (
    <article
      aria-label={translate("resources.quotes.document.label", {
        number: quote.number,
      })}
      className={cn(
        "quote-document flex flex-col gap-6 rounded-xl border bg-card p-6 text-sm text-card-foreground",
        className,
      )}
    >
      {quote.issued_at == null ? (
        <p
          role="note"
          className="quote-print-keep rounded-md border border-warning bg-warning/10 px-3 py-2 font-medium"
        >
          {translate("resources.quotes.document.draft_banner")}
        </p>
      ) : null}
      {quote.is_superseded ? (
        <p
          role="note"
          className="quote-print-keep rounded-md border border-destructive bg-destructive/10 px-3 py-2 font-medium"
        >
          {translate("resources.quotes.document.superseded_banner")}
        </p>
      ) : null}

      <header className="quote-print-keep flex flex-wrap items-start justify-between gap-4">
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt={branding.title}
            className="h-8 w-auto"
          />
        ) : (
          <span className="text-base font-semibold">{branding.title}</span>
        )}
        <div className="flex flex-col items-end gap-0.5 text-right">
          <h2 className="text-xl font-semibold tracking-tight">
            {translate("resources.quotes.document.heading")}
          </h2>
          <p className="font-medium tabular-nums">{quote.number}</p>
          <p className="text-muted-foreground">
            {translate("resources.quotes.document.version", {
              number: quote.version_number,
            })}
          </p>
          {quote.issued_at ? (
            <p className="text-muted-foreground">
              {translate("resources.quotes.document.issued_on", {
                date: formatDocumentDate(quote.issued_at),
              })}
            </p>
          ) : null}
          {quote.valid_until ? (
            <p className="text-muted-foreground">
              {translate("resources.quotes.document.valid_until", {
                date: formatDocumentDate(quote.valid_until),
              })}
            </p>
          ) : null}
        </div>
      </header>

      <section className="quote-print-keep grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <SectionTitle>
            {translate("resources.quotes.document.prepared_for")}
          </SectionTitle>
          {parties.company ? (
            <>
              <p className="font-medium">{parties.company.name}</p>
              {parties.company.tax_identifier ? (
                <p>
                  {translate("resources.quotes.document.tax_identifier", {
                    value: parties.company.tax_identifier,
                  })}
                </p>
              ) : null}
              {addressLines(parties.company).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
              {parties.company.phone ? <p>{parties.company.phone}</p> : null}
            </>
          ) : (
            <p className="text-muted-foreground">—</p>
          )}
          {parties.contact?.name ? (
            <p className="mt-2">
              {translate("resources.quotes.document.attention", {
                name: parties.contact.title
                  ? `${parties.contact.name}, ${parties.contact.title}`
                  : parties.contact.name,
              })}
            </p>
          ) : null}
          {parties.contact?.email ? <p>{parties.contact.email}</p> : null}
        </div>
        <div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
          <SectionTitle>
            {translate("resources.quotes.document.prepared_by")}
          </SectionTitle>
          <p className="font-medium">{branding.title}</p>
          {parties.owner_name ? <p>{parties.owner_name}</p> : null}
        </div>
      </section>

      {quote.title ? (
        <h3 className="text-base font-semibold">{quote.title}</h3>
      ) : null}

      {lines.length === 0 ? (
        <p className="text-muted-foreground">
          {translate("resources.quotes.document.no_lines")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-1.5 pr-2 text-left font-normal">
                  {translate("resources.quotes.document.line_number")}
                </th>
                <th scope="col" className="py-1.5 pr-3 text-left font-normal">
                  {translate("resources.quotes.document.description")}
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-normal">
                  {translate("resources.quotes.document.quantity")}
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-normal">
                  {translate("resources.quotes.document.unit_price")}
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-normal">
                  {translate("resources.quotes.document.discount")}
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-normal">
                  {translate("resources.quotes.document.tax")}
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-normal">
                  {translate("resources.quotes.document.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key} className="border-b align-top">
                  {/* Numbered by order, not by `position`: positions keep the
                      gaps a deleted line leaves, and "1, 3" on paper reads as a
                      line the customer was not shown. */}
                  <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="font-medium">{line.name}</span>
                    {line.sku ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {line.sku}
                      </span>
                    ) : null}
                    {line.description ? (
                      <p className="whitespace-pre-line text-muted-foreground">
                        {line.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                    {formatQuantity(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ""}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                    {formatMoneyExact(line.unit_price, currency)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                    {line.discount_percent > 0
                      ? `${line.discount_percent}%`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                    {`${line.tax_rate_percent}%`}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                    {formatMoneyExact(line.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* `formatMoneyExact` inside, never `formatMoney`: a quotation is read to
          the last unit, and the compact `$9.2M` is a dashboard figure (F4). */}
      <div className="quote-print-keep">
        <QuoteTotals amounts={totals} currency={currency} />
      </div>

      {terms ? (
        <section className="quote-print-keep flex flex-col gap-1">
          <SectionTitle>
            {translate("resources.quotes.document.terms")}
          </SectionTitle>
          <p className="whitespace-pre-line">{terms}</p>
        </section>
      ) : null}

      {acceptance.accepted_at ? (
        <p
          role="note"
          className="quote-print-keep rounded-md border border-success bg-success/10 px-3 py-2"
        >
          {acceptance.accepted_by_name
            ? translate("resources.quotes.document.accepted", {
                date: formatDocumentDate(acceptance.accepted_at),
                name: acceptance.accepted_by_name,
              })
            : translate("resources.quotes.document.accepted_anonymous", {
                date: formatDocumentDate(acceptance.accepted_at),
              })}
        </p>
      ) : acceptance.rejected_at ? (
        <p
          role="note"
          className="quote-print-keep rounded-md border px-3 py-2 text-muted-foreground"
        >
          {translate("resources.quotes.document.rejected", {
            date: formatDocumentDate(acceptance.rejected_at),
          })}
        </p>
      ) : null}

      {footer}
    </article>
  );
};
