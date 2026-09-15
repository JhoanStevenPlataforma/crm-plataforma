import { X } from "lucide-react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
  useUpdate,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatMoneyExact } from "../misc/reporting";
import type { PriceBookEntry, QuoteLine, QuoteSummary } from "../types";
import { QuoteTotals } from "./QuoteTotals";
import {
  effectiveDiscountPercent,
  lineAmounts,
  quoteAmounts,
} from "./quoteMath";
import { useQuoteDraft } from "./useQuoteDraft";

/** Catalogue scale, not CRM scale (quotes §11). */
const CATALOGUE_PAGE = { page: 1, perPage: 1000 };

/** The three columns a rep negotiates on. Everything else is the snapshot. */
type EditableField = "quantity" | "unit_price" | "discount_percent";

const LIMITS: Record<EditableField, { min: number; max?: number }> = {
  quantity: { min: 0 },
  unit_price: { min: 0 },
  discount_percent: { min: 0, max: 100 },
};

const isWithinLimits = (field: EditableField, value: number) => {
  const { min, max } = LIMITS[field];
  if (!Number.isFinite(value)) return false;
  // `quantity > 0` is a check constraint, not a minimum: a line of nothing is
  // not a line.
  if (field === "quantity" ? value <= min : value < min) return false;
  return max == null || value <= max;
};

const entryLabel = (entry: PriceBookEntry) =>
  entry.min_quantity > 1
    ? `${entry.name} (${entry.sku}) — ${entry.min_quantity}+`
    : `${entry.name} (${entry.sku})`;

/**
 * The lines of a quotation: the document itself (quotes §2.4).
 *
 * Every row is saved the moment it changes rather than through a form-wide
 * Save, because each write is one the server answers on its own: the totals are
 * recomputed by a trigger, and a batch that half-failed would leave a document
 * whose figures no longer match its lines.
 *
 * What a new line posts is deliberately SHORT — the version, the product, a
 * quantity, a price and the tax rate the price book resolved. `sku`, `name`,
 * `unit` and `tax_rate_percent` are filled by `quote_lines_snapshot_defaults`
 * on the way in, which is what keeps the arithmetic the server's (D8): the
 * client used to copy them, and a line that arrived without
 * `tax_rate_percent` was taxed at 0% silently (§13.6 #10).
 *
 * The picker reads `price_book`, never `products`: the view is what knows a
 * list's own price, a per-list tax override, and which products may be quoted
 * in this currency at all. A product priced in another currency with no
 * override is absent from it on purpose — a silent currency mismatch is worse
 * than a missing row.
 */
export const QuoteLines = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const { version, lines, isEditable, isUnknown } = useQuoteDraft(quote);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [entryId, setEntryId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const { data: priceBook } = useGetList<PriceBookEntry>(
    "price_book",
    {
      filter: { price_list_id: quote?.price_list_id },
      sort: { field: "name", order: "ASC" },
      pagination: CATALOGUE_PAGE,
    },
    { enabled: quote?.price_list_id != null },
  );

  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const [remove, { isPending: isRemoving }] = useDelete();
  const isMutating = isCreating || isUpdating || isRemoving;

  if (!quote) return null;

  const onError = () =>
    notify("resources.quotes.lines.error", { type: "error" });

  const editKey = (line: QuoteLine, field: EditableField) =>
    `${line.id}:${field}`;

  const rawOf = (line: QuoteLine, field: EditableField) =>
    edits[editKey(line, field)] ?? String(line[field]);

  /** What the row currently shows, falling back to the stored value. */
  const valueOf = (line: QuoteLine, field: EditableField) => {
    const parsed = Number(rawOf(line, field));
    return isWithinLimits(field, parsed) ? parsed : line[field];
  };

  const setEdit = (line: QuoteLine, field: EditableField, raw: string) =>
    setEdits((current) => ({ ...current, [editKey(line, field)]: raw }));

  const clearEdit = (line: QuoteLine, field: EditableField) =>
    setEdits((current) => {
      const { [editKey(line, field)]: _dropped, ...rest } = current;
      return rest;
    });

  /**
   * Committed on blur rather than on every keystroke: a quantity is typed one
   * digit at a time, and saving "1" on the way to "12" would write a document
   * the rep never meant.
   */
  const commit = (line: QuoteLine, field: EditableField) => {
    const raw = edits[editKey(line, field)];
    if (raw == null) return;

    const parsed = Number(raw);
    if (!isWithinLimits(field, parsed)) {
      notify(`resources.quotes.lines.invalid.${field}`, { type: "error" });
      clearEdit(line, field);
      return;
    }
    if (parsed === line[field]) {
      clearEdit(line, field);
      return;
    }

    update(
      "quote_lines",
      { id: line.id, data: { [field]: parsed }, previousData: line },
      {
        onSuccess: () => {
          clearEdit(line, field);
          refresh();
        },
        onError,
      },
    );
  };

  const addLine = () => {
    const entry = (priceBook ?? []).find((row) => row.id === entryId);
    const parsed = Number(quantity);
    if (!entry || !version || !isWithinLimits("quantity", parsed)) return;

    create(
      "quote_lines",
      {
        data: {
          version_id: version.id,
          product_id: entry.product_id,
          quantity: parsed,
          unit_price: entry.unit_price,
          // The price book resolved the per-list override; the server turns the
          // rate into the percentage the line freezes.
          tax_rate_id: entry.tax_rate_id ?? null,
          position: lines.length + 1,
        },
      },
      {
        // Cleared only once the line exists, so a refused one can be corrected
        // rather than retyped.
        onSuccess: () => {
          setEntryId("");
          setQuantity("1");
          refresh();
        },
        onError,
      },
    );
  };

  const removeLine = (line: QuoteLine) =>
    remove(
      "quote_lines",
      { id: line.id, previousData: line },
      { onSuccess: () => refresh(), onError },
    );

  const displayed = lines.map((line) => ({
    line,
    draft: {
      quantity: valueOf(line, "quantity"),
      unit_price: valueOf(line, "unit_price"),
      discount_percent: valueOf(line, "discount_percent"),
      tax_rate_percent: line.tax_rate_percent,
    },
  }));

  const drafts = displayed.map(({ draft }) => draft);
  const currency = quote.currency;
  const selected = (priceBook ?? []).find((row) => row.id === entryId);
  const canAdd =
    isEditable &&
    !isUnknown &&
    !isMutating &&
    selected != null &&
    isWithinLimits("quantity", Number(quantity));

  return (
    <div className="flex w-full flex-col gap-3">
      <h3 className="text-sm font-medium">
        {translate("resources.quotes.lines.title")}
      </h3>

      {isUnknown ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.lines.load_error")}
        </p>
      ) : displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.lines.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">
                  {translate("resources.quotes.lines.product")}
                </th>
                <th className="py-1 text-right font-normal">
                  {translate("resources.quotes.lines.quantity")}
                </th>
                <th className="py-1 text-right font-normal">
                  {translate("resources.quotes.lines.unit_price")}
                </th>
                <th className="py-1 text-right font-normal">
                  {translate("resources.quotes.lines.discount_percent")}
                </th>
                <th className="py-1 text-right font-normal">
                  {translate("resources.quotes.lines.tax_rate_percent")}
                </th>
                <th className="py-1 text-right font-normal">
                  {translate("resources.quotes.lines.line_total")}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {displayed.map(({ line, draft }) => (
                <tr key={line.id} className="border-t">
                  <td className="py-1 pr-3">
                    <span className="font-medium">{line.name}</span>
                    {line.sku ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({line.sku})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {isEditable ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className="ml-auto h-8 w-24 text-right"
                        aria-label={translate(
                          "resources.quotes.lines.quantity_of",
                          { name: line.name },
                        )}
                        value={rawOf(line, "quantity")}
                        onChange={(event) =>
                          setEdit(line, "quantity", event.target.value)
                        }
                        onBlur={() => commit(line, "quantity")}
                      />
                    ) : (
                      draft.quantity
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {isEditable ? (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className="ml-auto h-8 w-32 text-right"
                        aria-label={translate(
                          "resources.quotes.lines.unit_price_of",
                          { name: line.name },
                        )}
                        value={rawOf(line, "unit_price")}
                        onChange={(event) =>
                          setEdit(line, "unit_price", event.target.value)
                        }
                        onBlur={() => commit(line, "unit_price")}
                      />
                    ) : (
                      formatMoneyExact(draft.unit_price, currency)
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {isEditable ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        inputMode="decimal"
                        className="ml-auto h-8 w-20 text-right"
                        aria-label={translate(
                          "resources.quotes.lines.discount_of",
                          { name: line.name },
                        )}
                        value={rawOf(line, "discount_percent")}
                        onChange={(event) =>
                          setEdit(line, "discount_percent", event.target.value)
                        }
                        onBlur={() => commit(line, "discount_percent")}
                      />
                    ) : (
                      `${draft.discount_percent}%`
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {draft.tax_rate_percent}%
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoneyExact(lineAmounts(draft).line_total, currency)}
                  </td>
                  <td className="py-1 text-right">
                    {isEditable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        aria-label={translate("resources.quotes.lines.remove", {
                          name: line.name,
                        })}
                        onClick={() => removeLine(line)}
                        disabled={isMutating}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuoteTotals
        amounts={quoteAmounts(drafts)}
        currency={currency}
        effectiveDiscount={effectiveDiscountPercent(drafts)}
      />

      {!isEditable ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.lines.frozen")}
        </p>
      ) : quote.price_list_id == null ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.lines.no_price_list")}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={entryId} onValueChange={setEntryId}>
            <SelectTrigger
              className="sm:flex-1"
              aria-label={translate("resources.quotes.lines.product")}
            >
              <SelectValue
                placeholder={translate("resources.quotes.lines.product")}
              />
            </SelectTrigger>
            <SelectContent>
              {(priceBook ?? []).map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entryLabel(entry)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-label={translate("resources.quotes.lines.quantity")}
            className="sm:w-28"
          />
          <Button type="button" size="sm" onClick={addLine} disabled={!canAdd}>
            {translate("resources.quotes.lines.add")}
          </Button>
        </div>
      )}
    </div>
  );
};
