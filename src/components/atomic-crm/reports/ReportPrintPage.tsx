import { useGetList, useTranslate } from "ra-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { Report, ReportDataset, ReportSpec } from "../types";
import { ReportResultView } from "./ReportResultView";
import "./reportPrint.css";
import { useReportLabels } from "./reportLabels";
import { REPORT_PRINT_PATH, REPORTS_PATH } from "./reportsPath";
import { parseSpec, resolvePeriod, validateAgainstCatalog } from "./reportSpec";
import { useReportCatalog, useReportQuery } from "./useReportQuery";

/**
 * Several reports, one PDF.
 *
 * Printing from a report page produces a document about ONE question, which is
 * the wrong unit for the thing people actually assemble: a monthly review, a
 * board pack. Re-printing five reports and stapling five PDFs together is the
 * workaround this replaces.
 *
 * Each report runs its own query, so this page cannot be one component: hooks
 * cannot be called in a loop. `PrintedReport` below is one report's worth of
 * fetch-and-render, and it reports upward when it has settled.
 *
 * THE PRINT DIALOG WAITS FOR ALL OF THEM. Opening it early prints skeletons —
 * silently, and the user finds out when they open the file. The dialog is only
 * triggered once every child has either data or an error, and never
 * automatically on a second render.
 */

const PrintedReport = ({
  report,
  onSettled,
}: {
  report: Report;
  onSettled: () => void;
}) => {
  const translate = useTranslate();
  const labels = useReportLabels();
  const catalog = useReportCatalog();

  const spec: ReportSpec | null = parseSpec(report.spec);
  const dataset: ReportDataset | undefined = catalog.data?.find(
    (item) => item.key === spec?.dataset,
  );
  const invalid = spec ? validateAgainstCatalog(spec, dataset) : "unknown_spec";
  const range = resolvePeriod(spec?.period) ?? undefined;

  const result = useReportQuery(spec, {
    enabled: Boolean(spec && dataset && !invalid),
    range,
  });

  // "Settled" includes the failures: a report that cannot run must not hold the
  // print dialog hostage while the other four sit there ready.
  const settled = Boolean(invalid) || !result.isPending;
  const reported = useRef(false);

  useEffect(() => {
    if (settled && !reported.current) {
      reported.current = true;
      onSettled();
    }
  }, [settled, onSettled]);

  return (
    <section className="report-print-chart flex flex-col gap-3 break-after-page">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold">{labels.reportName(report)}</h2>
        <p className="text-xs text-muted-foreground">
          {range
            ? `${range.from} → ${range.to}`
            : translate("crm.analytics.basis.now")}
        </p>
      </div>

      {!spec || !dataset || invalid ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.reports.print_skipped")}
        </p>
      ) : (
        <ReportResultView
          spec={spec}
          dataset={dataset}
          result={result.data}
          isPending={result.isPending}
          error={result.error}
        />
      )}
    </section>
  );
};

export const ReportPrintPage = () => {
  const translate = useTranslate();
  const [searchParams] = useSearchParams();

  // Ids come from a hand-editable query string, so they are parsed rather than
  // trusted. Row level security decides what actually comes back regardless —
  // asking for a report you cannot read returns nothing, not an error.
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 20);

  const { data, isPending, error } = useGetList<Report>("reports", {
    filter: { "id@in": `(${ids.join(",")})` },
    sort: { field: "id", order: "ASC" },
    pagination: { page: 1, perPage: 20 },
    // An empty selection has nothing to ask for, and `id@in ()` is not valid.
    ...(ids.length === 0 ? { filter: { id: -1 } } : {}),
  });

  // Kept in the order the user picked them in the library, not the order the
  // database returned. A board pack has a running order.
  const reports = ids
    .map((id) => data?.find((report) => report.id === id))
    .filter((report): report is Report => Boolean(report));

  const [settledCount, setSettledCount] = useState(0);
  const printed = useRef(false);
  const onSettled = useCallback(() => setSettledCount((n) => n + 1), []);

  const ready = reports.length > 0 && settledCount >= reports.length;

  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    // One frame after the last chart settles, so the SVGs have actually been
    // laid out. Printing in the same tick captures empty plot areas.
    const timer = setTimeout(() => window.print(), 350);
    return () => clearTimeout(timer);
  }, [ready]);

  if (ids.length === 0) {
    return (
      <p className="text-sm text-muted-foreground mt-4">
        {translate("crm.reports.print_nothing_selected")}
      </p>
    );
  }

  return (
    <div className="report-print-root flex flex-col gap-8 mt-1">
      <div className="report-print-hide flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-muted-foreground">
            {translate("crm.reports.print_title", { count: reports.length })}
          </h1>
          <p className="text-xs text-muted-foreground">
            {ready
              ? translate("crm.reports.print_ready")
              : translate("crm.reports.print_preparing")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={REPORTS_PATH}>{translate("crm.reports.back")}</Link>
          </Button>
          {/* Offered as well as fired automatically: the automatic call happens
              once, and a user who cancelled the dialog needs a way back to it
              without reloading. */}
          <Button size="sm" disabled={!ready} onClick={() => window.print()}>
            {translate("crm.reports.print_again")}
          </Button>
        </div>
      </div>

      {/* The cover block, on paper only. It names the pack and states whose
          figures these are — the same caveat every single-report PDF carries,
          and more necessary here because a pack gets forwarded. */}
      <div className="report-print-only">
        <h1 style={{ fontSize: "18pt", margin: 0 }}>
          {translate("crm.reports.print_title", { count: reports.length })}
        </h1>
        <p style={{ fontSize: "9pt", margin: "6px 0 16px" }}>
          {new Date().toLocaleDateString()} ·{" "}
          {translate("crm.reports.print_scope_note")}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {translate("crm.reports.list_error")}
        </p>
      ) : null}

      {isPending ? (
        <div className="flex flex-col gap-4">
          {ids.map((id) => (
            <Skeleton key={id} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        reports.map((report) => (
          <PrintedReport
            key={report.id}
            report={report}
            onSettled={onSettled}
          />
        ))
      )}
    </div>
  );
};

ReportPrintPage.path = REPORT_PRINT_PATH;
