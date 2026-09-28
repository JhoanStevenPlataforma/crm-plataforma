import {
  useCreate,
  useDelete,
  useGetIdentity,
  useGetOne,
  useNotify,
  useTranslate,
  useUpdate,
} from "ra-core";
import {
  ArrowLeft,
  Copy,
  Download,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Report, ReportField, ReportRow, ReportSpec } from "../types";
import { useLeadStatusChoices } from "../leads/useLeadStatusChoices";
import { ReportBuilderPanel } from "./ReportBuilderPanel";
import { ReportResultView } from "./ReportResultView";
import { csvFilename, exportReportCsv } from "./exportReportCsv";
import {
  formatDimension,
  formatMetric,
  type LabelSources,
} from "./reportFormat";
import "./reportPrint.css";
import {
  REPORT_DETAIL_PATH,
  REPORT_NEW_PATH,
  REPORTS_PATH,
  reportPath,
} from "./reportsPath";
import {
  emptySpec,
  parseSpec,
  resolvePeriod,
  specFromParam,
  specToParam,
  validateAgainstCatalog,
} from "./reportSpec";
import {
  useReportPreference,
  useReportPreferenceMutations,
} from "./useReportPreference";
import { useReportCatalog, useReportQuery } from "./useReportQuery";

/**
 * One report: the result, and the panel that shapes it.
 *
 * Mounted on two routes because they are the same screen in two states — a new
 * report is a saved one with no id. Splitting them would duplicate the panel,
 * the runner, the export and the print header to save one conditional.
 *
 * THE SPEC LIVES IN THE URL. Not in component state: a dashboard is something
 * people send each other, a reload must not discard a manager's analysis, and
 * the back button then works as an undo for every change made in the panel.
 * That is the same decision `analyticsFilters.ts` made, for the same reasons.
 */
export const ReportPage = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const config = useConfigurationContext();
  const leadStatuses = useLeadStatusChoices();
  const { identity } = useGetIdentity();

  const catalog = useReportCatalog();
  const isNew = !reportId;

  const saved = useGetOne<Report>(
    "reports",
    { id: Number(reportId) },
    { enabled: !isNew },
  );

  const [create] = useCreate();
  const [update] = useUpdate();
  const [remove] = useDelete();

  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState("");

  const numericId = isNew ? null : Number(reportId);
  const isBuiltin = saved.data?.is_builtin ?? false;

  //
  // Two different questions, deliberately not one flag.
  //
  // `usesPreference` — is this report MINE TO SHAPE? A built-in belongs to the
  // installation and a shared report to its author, so adjusting either is a
  // personal view rather than an edit. That is the rule the auto-save follows.
  //
  // `canDelete` — may this user REMOVE it? A manager may retire a colleague's
  // report, the same privilege they already hold over leads, contacts,
  // companies and deals, and the row level security policy says so. Folding
  // both into one flag took that away: a manager stopped seeing the delete
  // button on exactly the reports the database would have let them delete.
  //
  const isMine = Boolean(saved.data) && saved.data?.sales_id === identity?.id;
  const isManager = identity?.role === "admin" || identity?.role === "manager";

  const usesPreference =
    !isNew && Boolean(saved.data) && (isBuiltin || !isMine);
  const canDelete = !isNew && !isBuiltin && (isMine || isManager);

  const preference = useReportPreference(usesPreference ? numericId : null);
  const { save: savePreference, clear: clearPreference } =
    useReportPreferenceMutations(numericId);

  // Three sources, most specific first. The URL wins because it is what the
  // user is manipulating right now; the saved preference is how they left this
  // report last time; the stored spec is the report as its author wrote it.
  const urlSpec = specFromParam(searchParams.get("spec"));
  const preferenceSpec = usesPreference ? (preference.data ?? null) : null;
  const storedSpec = saved.data ? parseSpec(saved.data.spec) : null;

  const spec: ReportSpec | null =
    urlSpec ??
    preferenceSpec ??
    storedSpec ??
    (isNew && catalog.data?.length ? emptySpec(catalog.data[0]) : null);

  useEffect(() => {
    if (saved.data && !name) setName(saved.data.name);
  }, [saved.data, name]);

  const dataset = catalog.data?.find((item) => item.key === spec?.dataset);
  const validationError = spec ? validateAgainstCatalog(spec, dataset) : null;

  const range = useMemo(
    () => resolvePeriod(spec?.period) ?? undefined,
    [spec?.period],
  );

  const result = useReportQuery(spec, {
    enabled: Boolean(spec && dataset && !validationError),
    range,
  });

  //
  // Auto-save, for read-only reports only.
  //
  // DEBOUNCED, because the spec is rewritten on every keystroke in a filter
  // value: saving on each one would be a write per character. 900 ms is long
  // enough to cover typing and short enough that closing the tab straight after
  // a click still persists the change.
  //
  // Keyed on the SERIALISED spec rather than on the parsed object, which is a
  // new identity every render — the effect would otherwise re-arm forever and
  // write in a loop.
  //
  const specParam = searchParams.get("spec");

  useEffect(() => {
    if (!usesPreference || !specParam || numericId == null || !identity?.id)
      return;
    // Nothing to save until the stored preference has been read: firing before
    // it lands would race the fetch and could persist the ORIGINAL spec over a
    // preference the user already had.
    if (preference.isPending) return;

    const parsed = specFromParam(specParam);
    if (!parsed) return;

    const timer = setTimeout(() => {
      savePreference.mutate({ salesId: Number(identity.id), spec: parsed });
    }, 900);

    return () => clearTimeout(timer);
    // `savePreference` is recreated by react-query on every render; including
    // it would re-arm the timer continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    specParam,
    usesPreference,
    numericId,
    identity?.id,
    preference.isPending,
  ]);

  const onRestoreOriginal = () => {
    clearPreference.mutate(undefined, {
      onSuccess: () => {
        // Drop the URL spec too, or the page keeps rendering the very
        // configuration that was just discarded.
        const params = new URLSearchParams(searchParams);
        params.delete("spec");
        setSearchParams(params, { replace: true });
        notify("crm.reports.restored", { type: "info" });
      },
      onError: () => notify("crm.reports.save_error", { type: "error" }),
    });
  };

  const setSpec = (next: ReportSpec) => {
    const params = new URLSearchParams(searchParams);
    params.set("spec", specToParam(next));
    // `replace` so tweaking a control does not fill the history with a step per
    // keystroke; the back button still leaves the report in one press.
    setSearchParams(params, { replace: true });
  };

  // A read-only report saves itself, so it is never "unsaved". An owned one
  // still is until the user presses save.
  const isDirty = Boolean(urlSpec) && !isNew && !usesPreference;

  const sources: LabelSources = {
    dealStages: config.dealStages,
    dealCategories: config.dealCategories,
    leadSources: config.leadSources,
    leadStatuses,
  };

  const fieldsOf = (keys: string[]): ReportField[] =>
    keys
      .map((key) => dataset?.fields.find((field) => field.key === key))
      .filter((field): field is ReportField => Boolean(field));

  const formatCell = (
    kind: "dimension" | "metric",
    field: ReportField,
    row: ReportRow,
  ) =>
    kind === "metric"
      ? formatMetric(
          field.key,
          row.metrics[field.key],
          field.data_type,
          config.currency,
        )
      : formatDimension(
          field,
          row.dimensions[field.key] ?? null,
          sources,
          translate("crm.reports.unassigned"),
        );

  const onSort = (field: string) => {
    if (!spec) return;
    setSpec({
      ...spec,
      sort: {
        field,
        direction:
          spec.sort?.field === field && spec.sort.direction === "desc"
            ? "asc"
            : "desc",
      },
    });
  };

  const onSave = async () => {
    if (!spec) return;
    const title = name.trim() || translate("crm.reports.untitled");

    // A built-in is never overwritten: saving one produces a personal copy. The
    // seeded library has to keep working for everyone, and a manager editing
    // "Sales trend" for themselves must not change what their team opens.
    if (isNew || usesPreference) {
      create(
        "reports",
        {
          data: {
            name: title,
            spec,
            visibility: "private",
            sales_id: identity?.id,
          },
        },
        {
          onSuccess: (created: Report) => {
            notify("crm.reports.saved", { type: "success" });
            navigate(reportPath(created.id));
          },
          onError: () => notify("crm.reports.save_error", { type: "error" }),
        },
      );
      return;
    }

    update(
      "reports",
      {
        id: Number(reportId),
        data: { name: title, spec },
        previousData: saved.data,
      },
      {
        onSuccess: () => {
          notify("crm.reports.saved", { type: "success" });
          const params = new URLSearchParams(searchParams);
          params.delete("spec");
          setSearchParams(params, { replace: true });
        },
        onError: () => notify("crm.reports.save_error", { type: "error" }),
      },
    );
  };

  const onDuplicate = () => {
    if (!spec) return;
    create(
      "reports",
      {
        data: {
          name: translate("crm.reports.copy_of", {
            name: name || translate("crm.reports.untitled"),
          }),
          spec,
          visibility: "private",
          sales_id: identity?.id,
        },
      },
      {
        onSuccess: (created: Report) => navigate(reportPath(created.id)),
        onError: () => notify("crm.reports.save_error", { type: "error" }),
      },
    );
  };

  const onDelete = () => {
    if (!canDelete) return;
    remove(
      "reports",
      { id: Number(reportId), previousData: saved.data },
      {
        onSuccess: () => navigate(REPORTS_PATH),
        onError: () => notify("crm.reports.delete_error", { type: "error" }),
      },
    );
  };

  const onExport = async () => {
    if (!spec || !dataset || !result.data) return;
    await exportReportCsv({
      filename: csvFilename(name || dataset.label),
      dimensions: fieldsOf(spec.dimensions),
      metrics: fieldsOf(spec.metrics),
      rows: result.data.rows,
      formatCell,
    });
  };

  if (catalog.isPending) {
    return (
      <div className="flex flex-col gap-4 mt-1">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (catalog.error) {
    return (
      <p className="text-sm text-destructive mt-4">
        {catalog.error instanceof Error &&
        catalog.error.message === "crm.reports.demo_unavailable"
          ? translate("crm.reports.demo_unavailable")
          : translate("crm.reports.catalog_error")}
      </p>
    );
  }

  if (!spec || !dataset || !catalog.data) {
    return (
      <p className="text-sm text-muted-foreground mt-4">
        {translate("crm.reports.not_found")}
      </p>
    );
  }

  return (
    <div className="report-print-root flex flex-col gap-4 mt-1">
      {/* Paper-only header. Rendered always and revealed by the print
          stylesheet, so a PDF never depends on a state change landing before
          the print dialog opens. */}
      <div className="report-print-only">
        <h1 style={{ fontSize: "16pt", margin: 0 }}>{name || dataset.label}</h1>
        <p style={{ fontSize: "9pt", margin: "4px 0 12px" }}>
          {range
            ? `${range.from} → ${range.to}`
            : translate("crm.analytics.basis.now")}
          {" · "}
          {translate("crm.reports.print_scope_note")}
        </p>
      </div>

      <div className="report-print-hide flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-9 w-9 flex-none"
          >
            <Link to={REPORTS_PATH} aria-label={translate("crm.reports.back")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={translate("crm.reports.untitled")}
            aria-label={translate("crm.reports.name")}
            className="h-9 text-base font-medium max-w-xs border-transparent hover:border-input focus:border-input px-2"
          />
          {isBuiltin ? (
            <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 flex-none">
              {translate("crm.reports.builtin")}
            </span>
          ) : null}
          {isDirty ? (
            <span className="text-xs text-muted-foreground flex-none">
              {translate("crm.reports.unsaved")}
            </span>
          ) : null}
          {/* A read-only report saves itself, so the header says so rather than
              leaving the user hunting for a save button that is not there. */}
          {usesPreference ? (
            <span className="text-xs text-muted-foreground flex-none">
              {savePreference.isPending
                ? translate("crm.reports.saving_view")
                : translate("crm.reports.view_autosaved")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {translate("crm.reports.configure")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={!result.data || result.data.rows.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
          {!isNew ? (
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
              {translate("crm.reports.duplicate")}
            </Button>
          ) : null}
          {/* Only offered once there is something to restore: the button is
              meaningless — and faintly alarming — on a report the user has
              never adjusted. */}
          {usesPreference && preference.data ? (
            <Button variant="outline" size="sm" onClick={onRestoreOriginal}>
              <RotateCcw className="h-3.5 w-3.5" />
              {translate("crm.reports.restore_original")}
            </Button>
          ) : null}
          {canDelete ? (
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              {translate("ra.action.delete")}
            </Button>
          ) : null}
          {/* A read-only report needs no save button — it saves itself — but
              "save as a copy" is still how a reader turns their adjusted view
              into a report of their own. */}
          <Button size="sm" onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            {usesPreference
              ? translate("crm.reports.save_as_copy")
              : translate("ra.action.save")}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4 items-start",
          panelOpen ? "lg:grid-cols-[300px_minmax(0,1fr)]" : "grid-cols-1",
        )}
      >
        {panelOpen ? (
          <div className="report-print-hide rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <ReportBuilderPanel
              catalog={catalog.data}
              spec={spec}
              onChange={setSpec}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-3 min-w-0 report-print-chart">
          {validationError ? (
            <p className="text-sm text-muted-foreground py-8">
              {translate(`crm.reports.invalid.${validationError}`)}
            </p>
          ) : (
            <ReportResultView
              spec={spec}
              dataset={dataset}
              result={result.data}
              isPending={result.isPending}
              error={result.error}
              onSort={onSort}
            />
          )}

          {result.data?.truncated ? (
            <p className="text-xs text-muted-foreground">
              {translate("crm.reports.truncated", {
                count: result.data.row_count,
              })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

ReportPage.newPath = REPORT_NEW_PATH;
ReportPage.detailPath = REPORT_DETAIL_PATH;
