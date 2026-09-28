import { useEffect, useState } from "react";
import { render } from "vitest-browser-react";

import {
  MISSING_CONTACT_NAME,
  validateContactRow,
  type ContactImportSchema,
} from "../contacts/useContactImport";
import { MALFORMED_ROW, SAVE_FAILED, usePapaParse } from "./usePapaParse";

const csvFile = (text: string) =>
  new File([text], "contacts.csv", { type: "text/csv" });

/** Runs one import and prints the final importer state as JSON. */
const Harness = ({
  text,
  processBatch,
}: {
  text: string;
  processBatch: (batch: ContactImportSchema[]) => Promise<void>;
}) => {
  const { importer, parseCsv } = usePapaParse<ContactImportSchema>({
    batchSize: 2,
    processBatch,
    validateRow: validateContactRow,
  });
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) {
      setStarted(true);
      parseCsv(csvFile(text));
    }
  }, [started, parseCsv, text]);
  return importer.state === "complete" ? (
    <pre data-testid="result">{JSON.stringify(importer)}</pre>
  ) : null;
};

const runImport = async (
  text: string,
  processBatch: (batch: ContactImportSchema[]) => Promise<void>,
) => {
  const screen = await render(
    <Harness text={text} processBatch={processBatch} />,
  );
  await expect.element(screen.getByTestId("result")).toBeInTheDocument();
  return JSON.parse(screen.getByTestId("result").element().textContent ?? "{}");
};

describe("usePapaParse with the contact validator", () => {
  it("imports nothing from an unrelated CSV and says which lines failed", async () => {
    const saved: ContactImportSchema[] = [];
    const result = await runImport(
      'esto,no\n"es,un csv valido\n;;;\n',
      async (batch) => {
        saved.push(...batch);
      },
    );

    expect(saved).toEqual([]);
    expect(result.importCount).toBe(0);
    expect(result.errorCount).toBe(result.rowCount);
    expect(result.errors.length).toBe(result.rowCount);
    for (const error of result.errors) {
      expect([MALFORMED_ROW, MISSING_CONTACT_NAME]).toContain(error.reason);
      // Spreadsheet line numbers: the header is line 1.
      expect(error.line).toBeGreaterThanOrEqual(2);
    }
  });

  it("imports the valid rows and reports the nameless one by its line", async () => {
    const saved: ContactImportSchema[] = [];
    const result = await runImport(
      "first_name,last_name,email_work\nAda,Lovelace,ada@example.com\n,,nobody@example.com\nGrace,Hopper,\n",
      async (batch) => {
        saved.push(...batch);
      },
    );

    expect(saved.map((row) => row.first_name)).toEqual(["Ada", "Grace"]);
    expect(result.importCount).toBe(2);
    expect(result.errors).toEqual([{ line: 3, reason: MISSING_CONTACT_NAME }]);
  });

  it("reports every line of a batch the server refused", async () => {
    const result = await runImport(
      "first_name,last_name\nAda,Lovelace\nGrace,Hopper\n",
      async () => {
        throw new Error("refused");
      },
    );

    expect(result.importCount).toBe(0);
    expect(result.errors).toEqual([
      { line: 2, reason: SAVE_FAILED },
      { line: 3, reason: SAVE_FAILED },
    ]);
  });
});
