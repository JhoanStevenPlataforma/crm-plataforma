import {
  required,
  useCanAccess,
  useGetList,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Link } from "react-router";

import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateInput } from "@/components/admin/date-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput";
import { contactDisplayName } from "../contacts/contactName";
import { contactOptionText } from "../misc/ContactOption";
import type { PriceList, QuoteSummary } from "../types";

/**
 * "Lista de precios" is required and there is none: without this, the form
 * shows an empty mandatory select and no way forward. Whoever may create a
 * list gets the link; anybody else is told whom to ask.
 */
const NoPriceListNotice = () => {
  const translate = useTranslate();
  const { canAccess } = useCanAccess({
    resource: "price_lists",
    action: "create",
  });
  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {translate(
            canAccess
              ? "resources.quotes.no_price_list.can_create"
              : "resources.quotes.no_price_list.ask_admin",
          )}
        </span>
        {canAccess ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/price_lists/create">
              {translate("resources.quotes.no_price_list.action")}
            </Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};

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
  const companyId = useWatch({ name: "company_id" });

  return (
    <div className="flex flex-col gap-4 w-full">
      {priceLists != null && choices.length === 0 ? (
        <NoPriceListNotice />
      ) : null}
      <TextInput source="title" helperText={false} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
        {/* Searchable, not a plain select: a ReferenceInput loads one page
            (25 rows), so a select silently hid every customer past the 25th. */}
        <div className="sm:flex-1">
          <ReferenceInput source="company_id" reference="companies">
            <AutocompleteCompanyInput
              label="resources.quotes.fields.company_id"
              validate={required()}
            />
          </ReferenceInput>
        </div>
        {/* Filtered on the company being typed, not the saved record's: on a
            new quote there is no saved record yet, and on an edit the user may
            be changing the company right now. */}
        <div className="sm:flex-1">
          <ReferenceInput
            source="contact_id"
            reference="contacts"
            filter={companyId ? { company_id: companyId } : undefined}
          >
            <AutocompleteInput
              label="resources.quotes.fields.contact_id"
              optionText={contactOptionText}
              inputText={contactDisplayName}
              helperText={false}
            />
          </ReferenceInput>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
        <div className="sm:flex-1">
          <ReferenceInput
            source="deal_id"
            reference="deals"
            filter={companyId ? { company_id: companyId } : undefined}
          >
            <AutocompleteInput
              label="resources.quotes.fields.deal_id"
              optionText="name"
              helperText={false}
            />
          </ReferenceInput>
        </div>
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
