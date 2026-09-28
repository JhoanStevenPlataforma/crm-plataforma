import { useTranslate } from "ra-core";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  ReportCatalog,
  ReportDataset,
  ReportPreset,
  ReportSpec,
  ReportVisualisation,
} from "../types";
import { ReportFilterBuilder } from "./ReportFilterBuilder";
import { useReportLabels } from "./reportLabels";
import { REPORT_PRESETS, emptySpec } from "./reportSpec";

/**
 * The configuration side of the builder.
 *
 * Ordered the way the question is asked, not the way the SQL is built: what am
 * I measuring (dataset), what do I want to know (metrics), broken down how
 * (dimensions), over what (period, filters), drawn as what (visualisation).
 * A panel ordered by the generated statement would put filters before metrics
 * and read as a query tool rather than as a question.
 *
 * Every change replaces the whole spec through `onChange`. The spec is the URL,
 * so a local draft state here would be a second source of truth that the back
 * button could not undo.
 */

const VISUALISATIONS: ReportVisualisation[] = [
  "kpi",
  "table",
  "bar",
  "stacked",
  "ranking",
  "funnel",
  "donut",
];

const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-0.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
    {children}
  </div>
);

export const ReportBuilderPanel = ({
  catalog,
  spec,
  onChange,
}: {
  catalog: ReportCatalog;
  spec: ReportSpec;
  onChange: (spec: ReportSpec) => void;
}) => {
  const translate = useTranslate();
  const labels = useReportLabels();
  const isRangeInverted =
    spec.period?.preset === "custom" &&
    !!spec.period.from &&
    !!spec.period.to &&
    spec.period.from > spec.period.to;

  const dataset: ReportDataset | undefined = catalog.find(
    (item) => item.key === spec.dataset,
  );
  if (!dataset) return null;

  const metrics = dataset.fields.filter((field) => field.role === "metric");
  const dimensions = dataset.fields.filter(
    (field) => field.role === "dimension",
  );
  const dateFields = dimensions.filter(
    (field) => field.data_type === "date" || field.data_type === "month",
  );

  const toggle = (list: string[], key: string, max: number) =>
    list.includes(key)
      ? list.filter((item) => item !== key)
      : list.length >= max
        ? list
        : [...list, key];

  return (
    <div className="flex flex-col gap-6">
      <Section title={translate("crm.reports.section.dataset")}>
        <Select
          value={spec.dataset}
          onValueChange={(key) => {
            const next = catalog.find((item) => item.key === key);
            // Changing the entity invalidates every field key in the spec, so
            // it starts over rather than carrying `stage` onto `tasks` and
            // failing validation on four rows at once.
            if (next) onChange(emptySpec(next));
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {labels.dataset(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section
        title={translate("crm.reports.section.metrics")}
        hint={translate("crm.reports.hint.metrics")}
      >
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
          {metrics.map((field) => {
            const checked = spec.metrics.includes(field.key);
            return (
              <Label
                key={field.key}
                className="flex items-center gap-2 text-sm font-normal cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  // The last metric cannot be removed: the executor refuses a
                  // report with none, so allowing it would put the builder in a
                  // state whose only feedback is an error.
                  disabled={checked && spec.metrics.length === 1}
                  onCheckedChange={() =>
                    onChange({
                      ...spec,
                      metrics: toggle(spec.metrics, field.key, 6),
                      sort:
                        spec.sort?.field === field.key && checked
                          ? undefined
                          : spec.sort,
                    })
                  }
                />
                <span className="min-w-0 truncate">
                  {labels.field(dataset.key, field)}
                </span>
              </Label>
            );
          })}
        </div>
      </Section>

      <Section
        title={translate("crm.reports.section.dimensions")}
        hint={translate("crm.reports.hint.dimensions")}
      >
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
          {dimensions.map((field) => {
            const checked = spec.dimensions.includes(field.key);
            return (
              <Label
                key={field.key}
                className="flex items-center gap-2 text-sm font-normal cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  disabled={!checked && spec.dimensions.length >= 2}
                  onCheckedChange={() =>
                    onChange({
                      ...spec,
                      dimensions: toggle(spec.dimensions, field.key, 2),
                      sort:
                        spec.sort?.field === field.key && checked
                          ? undefined
                          : spec.sort,
                    })
                  }
                />
                <span className="min-w-0 truncate">
                  {labels.field(dataset.key, field)}
                </span>
              </Label>
            );
          })}
        </div>
      </Section>

      {dateFields.length > 0 ? (
        <Section
          title={translate("crm.reports.section.period")}
          hint={translate("crm.reports.hint.period")}
        >
          <Select
            value={spec.period?.field ?? "__none__"}
            onValueChange={(field) =>
              onChange({
                ...spec,
                period:
                  field === "__none__"
                    ? undefined
                    : { field, preset: spec.period?.preset ?? "last_6_months" },
              })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* "No period" is a real answer for a stock question — "who is
                  carrying overdue work" has no month — so it is offered rather
                  than forced. */}
              <SelectItem value="__none__">
                {translate("crm.reports.no_period")}
              </SelectItem>
              {dateFields.map((field) => (
                <SelectItem key={field.key} value={field.key}>
                  {labels.field(dataset.key, field)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {spec.period ? (
            <>
              <Select
                value={spec.period.preset}
                onValueChange={(preset) =>
                  onChange({
                    ...spec,
                    period: {
                      ...spec.period!,
                      preset: preset as ReportPreset,
                    },
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {translate(`crm.reports.preset.${preset}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {spec.period.preset === "custom" ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    aria-label={translate("crm.analytics.filters.from")}
                    aria-invalid={isRangeInverted}
                    value={spec.period.from ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...spec,
                        period: { ...spec.period!, from: event.target.value },
                      })
                    }
                  />
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    aria-label={translate("crm.analytics.filters.to")}
                    aria-invalid={isRangeInverted}
                    value={spec.period.to ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...spec,
                        period: { ...spec.period!, to: event.target.value },
                      })
                    }
                  />
                </div>
              ) : null}
              {/* Until it is fixed the report runs over every date, so say so
                  rather than let the figures pass for the typed range. */}
              {isRangeInverted ? (
                <p role="alert" className="text-xs text-destructive">
                  {translate("crm.analytics.filters.invalid_range")}
                </p>
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title={translate("crm.reports.section.filters")}>
        <ReportFilterBuilder
          dataset={dataset}
          filters={spec.filters}
          onChange={(filters) => onChange({ ...spec, filters })}
        />
      </Section>

      <Section title={translate("crm.reports.section.visualisation")}>
        <Select
          value={spec.visualisation}
          onValueChange={(visualisation) =>
            onChange({
              ...spec,
              visualisation: visualisation as ReportVisualisation,
            })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISUALISATIONS.map((item) => (
              <SelectItem key={item} value={item}>
                {translate(`crm.reports.visualisation.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
    </div>
  );
};
