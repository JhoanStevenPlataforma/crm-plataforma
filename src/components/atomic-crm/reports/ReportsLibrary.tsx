import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { Plus, Printer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

import { ANALYTICS_PATH } from "../analytics/analyticsPath";
import type { Report } from "../types";
import { useReportLabels } from "./reportLabels";
import {
  REPORT_NEW_PATH,
  REPORTS_PATH,
  reportPath,
  reportPrintPath,
} from "./reportsPath";
import { PageHeader } from "@/components/admin/page-header";

/**
 * The library: every question this installation knows how to ask.
 *
 * Two groups, and the split is deliberate. The built-ins are the worked
 * examples — one per visualisation, covering the questions a commercial team
 * asks weekly — and they exist mostly so the builder gets discovered by people
 * who would never open an empty one. "Duplicate and change something" is a far
 * lower barrier than a blank form with a dataset picker.
 *
 * Reports are listed, never executed here. A library that ran seventeen
 * aggregate queries to draw seventeen preview cards would be slower than the
 * reports themselves.
 */

const ReportCard = ({
  report,
  badge,
  selected,
  onToggle,
}: {
  report: Report;
  badge?: string;
  selected: boolean;
  onToggle: (id: number) => void;
}) => {
  // A built-in's name and description live in the database in English; a user's
  // own report keeps whatever they typed. `useReportLabels` knows the
  // difference, so a personal report is never "translated" into something its
  // author did not write.
  const labels = useReportLabels();
  const description = labels.reportDescription(report);

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4 flex items-start gap-3">
        {/* Outside the link, not inside it: a checkbox nested in an anchor is
            a click target the browser resolves as navigation, so ticking one
            would open the report instead of selecting it. */}
        <Checkbox
          className="mt-0.5 flex-none"
          checked={selected}
          onCheckedChange={() => onToggle(report.id)}
          aria-label={labels.reportName(report)}
        />
        <Link
          to={reportPath(report.id)}
          className="flex flex-col gap-1 no-underline min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium min-w-0">
              {labels.reportName(report)}
            </h3>
            {badge ? (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5 flex-none">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {description}
            </p>
          ) : null}
        </Link>
      </CardContent>
    </Card>
  );
};

const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-medium">{title}</h2>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
    {children}
  </section>
);

export const ReportsLibrary = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();

  //
  // The PDF selection, held in component state rather than in the URL.
  //
  // Every other piece of state in this module lives in the query string, on the
  // principle that a report is something people send each other. A selection is
  // the exception: it is a scratch choice made seconds before pressing a
  // button, and putting it in the URL would make the back button undo ticks one
  // at a time. The resulting DOCUMENT is what gets shared, and that has its own
  // link.
  //
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : // Appended, not sorted: the order of selection is the running order
          // of the printed pack.
          [...current, id],
    );

  // One request for the lot. Row level security already limits what comes back
  // — a rep sees the built-ins, the shared ones and their own — so filtering by
  // owner here would be a second, weaker copy of a rule the database enforces.
  const { data, isPending, error } = useGetList<Report>("reports", {
    sort: { field: "updated_at", order: "DESC" },
    pagination: { page: 1, perPage: 200 },
  });

  const reports = data ?? [];
  const builtins = reports.filter((report) => report.is_builtin);
  const mine = reports.filter(
    (report) => !report.is_builtin && report.sales_id === identity?.id,
  );
  const shared = reports.filter(
    (report) =>
      !report.is_builtin &&
      report.sales_id !== identity?.id &&
      report.visibility === "shared",
  );

  return (
    <div className="flex flex-col gap-8 mt-1">
      <PageHeader
        className="mb-0"
        title={translate("crm.reports.title")}
        description={translate("crm.reports.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            {/* Appears only once something is ticked. A permanently visible
              "export 0 reports" button is a control that spends most of its
              life disabled, which teaches people to ignore it. */}
            {selected.length > 0 ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected([])}
                >
                  {translate("ra.action.clear_input_value")}
                </Button>
                <Button asChild size="sm">
                  <Link to={reportPrintPath(selected)}>
                    <Printer className="h-3.5 w-3.5" />
                    {translate("crm.reports.export_selected", {
                      smart_count: selected.length,
                    })}
                  </Link>
                </Button>
              </>
            ) : null}
            {/* The two screens answer different questions and say so: the summary
              is where a problem is noticed, this is where it is investigated. */}
            <Button asChild variant="outline" size="sm">
              <Link to={ANALYTICS_PATH}>
                {translate("crm.reports.see_analytics")}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to={REPORT_NEW_PATH}>
                <Plus className="h-3.5 w-3.5" />
                {translate("crm.reports.new")}
              </Link>
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          {translate("crm.reports.list_error")}
        </p>
      ) : null}

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : null}

      {mine.length > 0 ? (
        <Section title={translate("crm.reports.group.mine")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mine.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                selected={selected.includes(report.id)}
                onToggle={toggle}
                badge={
                  report.visibility === "shared"
                    ? translate("crm.reports.shared")
                    : undefined
                }
              />
            ))}
          </div>
        </Section>
      ) : null}

      {shared.length > 0 ? (
        <Section
          title={translate("crm.reports.group.shared")}
          // The one thing that is surprising unless stated: a shared report
          // hands over the QUESTION, not the answer. Each reader executes it
          // under their own row level security, so two people open the same
          // report and legitimately see different numbers.
          hint={translate("crm.reports.shared_scope_note")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shared.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                selected={selected.includes(report.id)}
                onToggle={toggle}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {builtins.length > 0 ? (
        <Section
          title={translate("crm.reports.group.builtin")}
          hint={translate("crm.reports.builtin_hint")}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {builtins.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                selected={selected.includes(report.id)}
                onToggle={toggle}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {!isPending && reports.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground py-8">
          {translate("crm.reports.empty")}
        </p>
      ) : null}
    </div>
  );
};

ReportsLibrary.path = REPORTS_PATH;
