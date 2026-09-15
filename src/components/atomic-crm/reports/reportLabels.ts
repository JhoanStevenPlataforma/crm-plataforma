import { useTranslate } from "ra-core";
import { useCallback } from "react";

import type { Report, ReportDataset, ReportField } from "../types";

/**
 * Human labels for things that come out of the database.
 *
 * The catalogue lives in Postgres, which is what stops the builder and the
 * executor from ever disagreeing — but it also means `report_datasets.label`
 * and `report_fields.label` are single strings, written once, in English. A
 * Spanish user was reading "Total value" and "Expected closing month" on an
 * otherwise translated screen.
 *
 * Translating them in the DATABASE was the alternative, and it is worse: a
 * label column per locale means a migration to add a language, and the CRM
 * already resolves its vocabulary (`dealStages`, `leadSources`) in the browser
 * for exactly this reason.
 *
 * So the key is the identity and the i18n catalogue is the label. The stored
 * label becomes the FALLBACK, passed as polyglot's `_` option: an entry nobody
 * has translated yet renders the English word rather than a raw
 * `crm.reports.field.deals.stage`, which is the failure mode that makes a
 * missing translation look like a broken page.
 *
 * Field keys are namespaced BY DATASET because six of them genuinely mean
 * different things depending on where they sit — `source` is the lead's channel
 * on `leads` and the task's provenance on `tasks`, `country` is the company's
 * own on `companies` and the customer's on `deals`. A flat `field.<key>` map
 * would silently translate one of each pair wrongly.
 */

export const datasetLabelKey = (key: string) => `crm.reports.dataset.${key}`;

export const fieldLabelKey = (datasetKey: string, fieldKey: string) =>
  `crm.reports.field.${datasetKey}.${fieldKey}`;

/**
 * Built-in reports are keyed on their id, which the migration assigns
 * explicitly and never reuses — the same reason it assigns them at all, so a
 * later migration can amend one in place. A user's own report keeps the name
 * they typed and is never translated: it is their words, not ours.
 */
// `builtin_report`, not `builtin`: `crm.reports.builtin` is already the badge
// text shown on a library card, and polyglot cannot hold a string and an object
// under one key.
export const builtinNameKey = (id: number) =>
  `crm.reports.builtin_report.${id}.name`;
export const builtinDescriptionKey = (id: number) =>
  `crm.reports.builtin_report.${id}.description`;

export interface ReportLabels {
  dataset: (dataset: Pick<ReportDataset, "key" | "label">) => string;
  field: (
    datasetKey: string,
    field: Pick<ReportField, "key" | "label">,
  ) => string;
  reportName: (report: Pick<Report, "id" | "name" | "is_builtin">) => string;
  reportDescription: (
    report: Pick<Report, "id" | "description" | "is_builtin">,
  ) => string | null;
}

export const useReportLabels = (): ReportLabels => {
  const translate = useTranslate();

  const dataset = useCallback(
    (item: Pick<ReportDataset, "key" | "label">) =>
      translate(datasetLabelKey(item.key), { _: item.label }),
    [translate],
  );

  const field = useCallback(
    (datasetKey: string, item: Pick<ReportField, "key" | "label">) =>
      translate(fieldLabelKey(datasetKey, item.key), { _: item.label }),
    [translate],
  );

  const reportName = useCallback(
    (report: Pick<Report, "id" | "name" | "is_builtin">) =>
      report.is_builtin
        ? translate(builtinNameKey(report.id), { _: report.name })
        : report.name,
    [translate],
  );

  const reportDescription = useCallback(
    (report: Pick<Report, "id" | "description" | "is_builtin">) =>
      report.is_builtin
        ? translate(builtinDescriptionKey(report.id), {
            _: report.description ?? "",
          }) || null
        : report.description,
    [translate],
  );

  return { dataset, field, reportName, reportDescription };
};
