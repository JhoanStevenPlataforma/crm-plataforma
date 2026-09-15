import jsonExport from "jsonexport/dist";

import type { ReportField, ReportRow } from "../types";

/** Byte-order mark. Declared as an escape so the source carries no
 * invisible character — a literal BOM in a `.ts` file is one nobody can
 * see in a diff or in a code review. */
const UTF8_BOM = "﻿";

/** Combining diacritical marks, stripped after NFD normalisation. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * The current report, as CSV.
 *
 * Exports WHAT IS ON SCREEN: the same rows, the same columns, the same order,
 * the same formatting. An export that re-queried without the filters, or that
 * shipped raw values while the screen showed formatted ones, would be a second
 * answer to the question the user thinks they are downloading.
 *
 * `jsonexport` rather than a hand-rolled joiner, because it is already the
 * contact list's exporter and it handles the quoting rules that a manual
 * implementation gets wrong on the first value containing a comma.
 *
 * CSV and not xlsx: a real spreadsheet needs a new dependency, and CSV opens in
 * Excel. The BOM below is what makes it open there with accents intact — Excel
 * reads a BOM-less UTF-8 file as the system codepage, which turns every
 * "Compañía" into mojibake and is the single most reported CSV bug there is.
 */
export const exportReportCsv = async ({
  filename,
  dimensions,
  metrics,
  rows,
  formatCell,
}: {
  filename: string;
  dimensions: ReportField[];
  metrics: ReportField[];
  rows: ReportRow[];
  formatCell: (
    kind: "dimension" | "metric",
    field: ReportField,
    row: ReportRow,
  ) => string;
}): Promise<void> => {
  const records = rows.map((row) => {
    const record: Record<string, string> = {};
    for (const field of dimensions) {
      record[field.label] = formatCell("dimension", field, row);
    }
    for (const field of metrics) {
      record[field.label] = formatCell("metric", field, row);
    }
    return record;
  });

  // `headers` pins the column order. Without it jsonexport derives it from the
  // first record's key order, which is the same order here but only by
  // accident — and the export must match the table the user is looking at.
  const csv = await jsonExport(records, {
    headers: [...dimensions, ...metrics].map((field) => field.label),
  });

  const blob = new Blob([UTF8_BOM + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  // Released on the next tick rather than immediately: revoking synchronously
  // races the download in Safari and produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** A report name, made safe for a filename on every platform. */
export const csvFilename = (name: string): string =>
  name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "report";
