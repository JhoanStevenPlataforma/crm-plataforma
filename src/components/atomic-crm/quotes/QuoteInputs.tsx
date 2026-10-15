import {
  required,
  useCanAccess,
  useGetList,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { useEffect, useRef } from "react";
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
import { useCurrencies } from "../currencies/useFx";
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
 * The currency of a NEW quotation (multi-currency,
 * docs/proposals/multi-currency-fx.md).
 *
 * It follows the chosen price list -- the common case, quoting in the list's
 * own currency -- until the rep picks another one, from then on it is theirs:
 * a USD quotation priced from a COP list is converted by the server at the
 * draft version's rate. With no list chosen yet it starts in the company's
 * default quotation currency.
 */
const DefaultQuoteCurrency = ({
  priceLists,
  fallback,
}: {
  priceLists: PriceList[];
  fallback: string | null;
}) => {
  const priceListId = useWatch({ name: "price_list_id" });
  const chosen = useWatch({ name: "currency" });
  const { setValue } = useFormContext();
  // The last value THIS component wrote; anything else came from the rep.
  const lastAuto = useRef<string | null>(null);

  const listCurrency =
    priceLists.find((list) => String(list.id) === String(priceListId))
      ?.currency ?? null;
  const target = listCurrency ?? fallback;

  useEffect(() => {
    const untouched = !chosen || chosen === lastAuto.current;
    if (target && untouched && chosen !== target) {
      lastAuto.current = target;
      setValue("currency", target, { shouldDirty: true });
    }
  }, [chosen, target, setValue]);

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

  // Any list, in any currency: its prices are converted at the quotation's
  // rate. The quotation's own currency is fixed once created -- the versions
  // and lines carry it -- and chosen from the active currencies on creation.
  const choices = priceLists ?? [];
  const { active: activeCurrencies } = useCurrencies();
  const quoteDefault =
    activeCurrencies.find((currency) => currency.is_quote_default)?.code ??
    activeCurrencies.find((currency) => currency.is_base)?.code ??
    null;
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
        {record == null ? (
          <SelectInput
            source="currency"
            label="crm.fx.quote.currency"
            choices={activeCurrencies.map((currency) => ({
              id: currency.code,
              name: `${currency.code} · ${currency.name}`,
            }))}
            validate={required()}
            className="sm:w-56"
            helperText="crm.fx.quote.currency_help"
          />
        ) : (
          <TextInput
            source="currency"
            readOnly
            className="sm:w-28"
            helperText={false}
          />
        )}
      </div>
      {record == null ? (
        <DefaultQuoteCurrency
          priceLists={priceLists ?? []}
          fallback={quoteDefault}
        />
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
