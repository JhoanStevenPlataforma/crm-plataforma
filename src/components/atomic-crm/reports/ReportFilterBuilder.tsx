import { useTranslate } from "ra-core";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  ReportDataset,
  ReportField,
  ReportFilter,
  ReportFilterOp,
} from "../types";
import { useReportLabels } from "./reportLabels";
import { isListOp, isValuelessOp, operatorsFor } from "./reportSpec";

/**
 * The filter rows of the builder.
 *
 * Every operator offered here is one the executor accepts for that field's
 * type — `operatorsFor` mirrors `report_filter_sql`'s allowlist. The database
 * refuses anything else regardless; the point of mirroring is that a user never
 * builds a filter that only fails after a round trip.
 *
 * Changing the field RESETS the operator rather than keeping one that no longer
 * applies. Silently carrying `contains` from a company name over to an amount
 * produces a filter the server rejects, and the user would have no idea which
 * of the two changes caused it.
 */

const valueToText = (value: ReportFilter["value"]): string => {
  if (value == null) return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
};

export const ReportFilterBuilder = ({
  dataset,
  filters,
  onChange,
}: {
  dataset: ReportDataset;
  filters: ReportFilter[];
  onChange: (filters: ReportFilter[]) => void;
}) => {
  const translate = useTranslate();
  const labels = useReportLabels();

  const filterable = dataset.fields.filter(
    (field) => field.filterable && field.role === "dimension",
  );

  const fieldOf = (key: string): ReportField | undefined =>
    dataset.fields.find((field) => field.key === key);

  const update = (index: number, next: Partial<ReportFilter>) =>
    onChange(
      filters.map((filter, i) =>
        i === index ? { ...filter, ...next } : filter,
      ),
    );

  const add = () => {
    const first = filterable[0];
    if (!first) return;
    onChange([
      ...filters,
      { field: first.key, op: operatorsFor(first.data_type)[0], value: "" },
    ]);
  };

  return (
    <div className="flex flex-col gap-2">
      {filters.map((filter, index) => {
        const field = fieldOf(filter.field);
        const ops = field ? operatorsFor(field.data_type) : [];
        const needsValue = !isValuelessOp(filter.op);
        const list = isListOp(filter.op);

        return (
          <div
            key={index}
            className="flex flex-col gap-1.5 rounded-md border p-2 bg-background"
          >
            <div className="flex items-center gap-1.5">
              <Select
                value={filter.field}
                onValueChange={(key) => {
                  const next = fieldOf(key);
                  update(index, {
                    field: key,
                    op: next ? operatorsFor(next.data_type)[0] : "eq",
                    value: "",
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterable.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {labels.field(dataset.key, option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-none"
                onClick={() => onChange(filters.filter((_, i) => i !== index))}
                aria-label={translate("crm.reports.remove_filter")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Select
                value={filter.op}
                onValueChange={(op) =>
                  update(index, {
                    op: op as ReportFilterOp,
                    // A valueless operator keeps no value, and switching between
                    // scalar and list shapes clears it: "won" is not a valid
                    // `between`, and carrying it over produces a server error
                    // the user cannot explain.
                    value: isValuelessOp(op as ReportFilterOp) ? undefined : "",
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs w-36 flex-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ops.map((op) => (
                    <SelectItem key={op} value={op}>
                      {translate(`crm.reports.op.${op}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {needsValue ? (
                <Input
                  className="h-8 text-xs flex-1 min-w-0"
                  type={
                    field?.data_type === "date" || field?.data_type === "month"
                      ? list
                        ? "text"
                        : "date"
                      : "text"
                  }
                  value={valueToText(filter.value)}
                  placeholder={
                    list
                      ? translate("crm.reports.value_list_placeholder")
                      : translate("crm.reports.value_placeholder")
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    update(index, {
                      // A list operator takes a comma-separated list. Blank
                      // entries are dropped so a trailing comma while typing is
                      // not sent as an empty value the executor would refuse.
                      value: list
                        ? raw
                            .split(",")
                            .map((part) => part.trim())
                            .filter(Boolean)
                        : raw,
                    });
                  }}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={add}
        disabled={filters.length >= 12 || filterable.length === 0}
      >
        {translate("crm.reports.add_filter")}
      </Button>
    </div>
  );
};
