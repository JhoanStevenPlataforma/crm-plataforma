import * as Papa from "papaparse";
import { useCallback, useMemo, useRef, useState } from "react";

/**
 * One rejected CSV row. `line` is the line number the user sees in a
 * spreadsheet (the header is line 1), and `reason` is an i18n key, so the
 * dialog can tell the user exactly which rows to fix and why.
 */
export type ImportRowError = {
  line: number;
  reason: string;
};

export const MALFORMED_ROW = "crm.import_rows.malformed";
export const SAVE_FAILED = "crm.import_rows.save_failed";

// Data rows start on line 2: line 1 is the header.
const lineOf = (rowIndex: number) => rowIndex + 2;

type Import =
  | {
      state: "idle";
    }
  | {
      state: "parsing";
    }
  | {
      state: "running" | "complete";

      rowCount: number;
      importCount: number;
      errorCount: number;
      errors: ImportRowError[];

      // The remaining time in milliseconds
      remainingTime: number | null;
    }
  | {
      state: "error";

      error: Error;
    };

type usePapaParseProps<T> = {
  // The import batch size
  batchSize?: number;

  // processBatch returns the number of imported items
  processBatch(batch: T[]): Promise<void>;

  // Returns an i18n key explaining why a row cannot be imported, or null.
  // A rejected row is never sent to processBatch.
  validateRow?: (row: T) => string | null;
};

export function usePapaParse<T>({
  batchSize = 10,
  processBatch,
  validateRow,
}: usePapaParseProps<T>) {
  const importIdRef = useRef<number>(0);

  const [importer, setImporter] = useState<Import>({
    state: "idle",
  });

  const reset = useCallback(() => {
    setImporter({
      state: "idle",
    });
    importIdRef.current += 1;
  }, []);

  const parseCsv = useCallback(
    (file: File) => {
      setImporter({
        state: "parsing",
      });

      const importId = importIdRef.current;
      Papa.parse<T>(file, {
        header: true,
        skipEmptyLines: true,
        async complete(results) {
          if (importIdRef.current !== importId) {
            return;
          }

          // A row Papa could not parse is still returned in `data`, with its
          // columns shifted: importing it would save garbage, so it is
          // rejected with the rest of the invalid rows.
          const malformed = new Set(
            results.errors
              .map((error) => error.row)
              .filter((row): row is number => typeof row === "number"),
          );
          const rejected: ImportRowError[] = [];
          const accepted: { row: T; index: number }[] = [];
          results.data.forEach((row, index) => {
            const reason = malformed.has(index)
              ? MALFORMED_ROW
              : (validateRow?.(row) ?? null);
            if (reason) {
              rejected.push({ line: lineOf(index), reason });
            } else {
              accepted.push({ row, index });
            }
          });

          setImporter({
            state: "running",
            rowCount: results.data.length,
            errorCount: rejected.length,
            errors: rejected,
            importCount: 0,
            remainingTime: null,
          });

          let totalTime = 0;
          for (let i = 0; i < accepted.length; i += batchSize) {
            if (importIdRef.current !== importId) {
              return;
            }

            const batch = accepted.slice(i, i + batchSize);
            try {
              const start = Date.now();
              await processBatch(batch.map(({ row }) => row));
              totalTime += Date.now() - start;

              const meanTime = totalTime / (i + batch.length);
              setImporter((previous) => {
                if (previous.state === "running") {
                  const importCount = previous.importCount + batch.length;
                  return {
                    ...previous,
                    importCount,
                    remainingTime:
                      meanTime * (accepted.length - i - batch.length),
                  };
                }
                return previous;
              });
            } catch (error) {
              console.error("Failed to import batch", error);
              setImporter((previous) =>
                previous.state === "running"
                  ? {
                      ...previous,
                      errorCount: previous.errorCount + batch.length,
                      errors: [
                        ...previous.errors,
                        ...batch.map(({ index }) => ({
                          line: lineOf(index),
                          reason: SAVE_FAILED,
                        })),
                      ],
                    }
                  : previous,
              );
            }
          }

          setImporter((previous) =>
            previous.state === "running"
              ? {
                  ...previous,
                  state: "complete",
                  remainingTime: null,
                }
              : previous,
          );
        },
        error(error) {
          console.error(error);
          setImporter({
            state: "error",
            error,
          });
        },
        dynamicTyping: true,
      });
    },
    [batchSize, processBatch, validateRow],
  );

  return useMemo(
    () => ({
      importer,
      parseCsv,
      reset,
    }),
    [importer, parseCsv, reset],
  );
}
