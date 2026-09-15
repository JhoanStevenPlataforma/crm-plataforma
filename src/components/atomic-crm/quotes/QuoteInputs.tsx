import { required, useGetList, useRecordContext, useTranslate } from "ra-core";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { DateInput } from "@/components/admin/date-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

import type { PriceList, QuoteSummary } from "../types";

/** The catalogue is hundreds of rows, not CRM scale (quotes §11). */
const CATALOGUE_PAGE = { page: 1, perPage: 1000 };

/**
 * A date already past is an offer that is dead on arrival: `create_quote_link()`
 * refuses to mint a link for one (`quote_validity_elapsed`, §13.6 #12), so the
 * editor must not offer the date in the first place. Compared as ISO strings,
 * which sort correctly, and in the browser's own timezone — "today" for the
 * person typing is the only "today" that matters here.
 */
const todayISO = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const notInThePast = (value: string | null | undefined) =>
  value && value.slice(0, 10) < todayISO()
    ? "resources.quotes.validation.valid_until_past"
    : undefined;

/**
 * The quote's currency follows its price list, and is never typed.
 *
 * `quotes_price_list_currency_fkey` is a COMPOSITE key: a quote priced from a
 * list in another currency is unrepresentable, not merely discouraged. Deriving
 * the currency here means the refusal never has to be explained to anybody,
 * because the pair can only ever match.
 */
const CurrencyFromPriceList = ({ priceLists }: { priceLists: PriceList[] }) => {
  const priceListId = useWatch({ name: "price_list_id" });
  const { setValue } = useFormContext();
  const currency = priceLists.find(
    (list) => String(list.id) === String(priceListId),
  )?.currency;

  useEffect(() => {
    if (currency) {
      setValue("currency", currency, { shouldDirty: true });
    }
  }, [currency, setValue]);

  return null;
};

/**
 * A quotation's header (quotes §2.3, §13.2).
 *
 * Two columns are NOT here and their absence is the design: `status_key` moves
 * only through `transition_quote()` (Phase 5), and `quote_number` is the
 * sequence's. Posting either back unchanged is fine, which is why the edit form
 * may still carry them.
 *
 * `valid_until` and `terms` belong to the draft VERSION, not to the header —
 * the header copy is a server-kept mirror and changing it is refused
 * (`quote_header_derived`). The data provider routes them to the draft, so the
 * form can stay declarative; they are offered only while the quote is a draft,
 * because an issued document is immutable (§4).
 */
export const QuoteInputs = () => {
  const translate = useTranslate();
  const record = useRecordContext<QuoteSummary>();
  const isDraft = record == null || record.status_key === "draft";

  const { data: priceLists } = useGetList<PriceList>("price_lists", {
    filter: { is_active: true },
    sort: { field: "name", order: "ASC" },
    pagination: CATALOGUE_PAGE,
  });

  // On an existing quote the currency is fixed: it is carried by the versions,
  // the lines and the composite key. Only lists in that currency are offered,
  // so the choice cannot produce a refusal.
  const choices = (priceLists ?? []).filter(
    (list) => record == null || list.currency === record.currency,
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      <TextInput source="title" helperText={false} />

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <ReferenceInput source="company_id" reference="companies">
          <SelectInput
            label="resources.quotes.fields.company_id"
            validate={required()}
            className="sm:flex-1"
            helperText={false}
          />
        </ReferenceInput>
        <ReferenceInput
          source="contact_id"
          reference="contacts_summary"
          filter={
            record?.company_id ? { company_id: record.company_id } : undefined
          }
        >
          <SelectInput
            label="resources.quotes.fields.contact_id"
            optionText={(contact) =>
              `${contact.first_name} ${contact.last_name}`
            }
            className="sm:flex-1"
            helperText={false}
          />
        </ReferenceInput>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <ReferenceInput source="deal_id" reference="deals">
          <SelectInput
            label="resources.quotes.fields.deal_id"
            className="sm:flex-1"
            helperText={false}
          />
        </ReferenceInput>
        <SelectInput
          source="price_list_id"
          choices={choices.map((list) => ({
            id: list.id,
            name: `${list.name} (${list.currency})`,
          }))}
          validate={required()}
          className="sm:flex-1"
          helperText="resources.quotes.helpers.price_list_id"
        />
        <TextInput
          source="currency"
          readOnly
          className="sm:w-28"
          helperText={false}
        />
      </div>
      {record == null ? (
        <CurrencyFromPriceList priceLists={priceLists ?? []} />
      ) : null}

      {isDraft ? (
        <>
          <DateInput
            source="valid_until"
            min={todayISO()}
            validate={notInThePast}
            helperText="resources.quotes.helpers.valid_until"
          />
          <TextInput
            source="terms"
            multiline
            helperText="resources.quotes.helpers.terms"
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.helpers.frozen_document")}
        </p>
      )}

      <TextInput
        source="internal_notes"
        multiline
        helperText="resources.quotes.helpers.internal_notes"
      />
    </div>
  );
};
