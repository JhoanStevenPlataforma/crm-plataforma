import { useCanAccess, useGetList, useTranslate } from "ra-core";

import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { List } from "@/components/admin/list";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";

import { TopToolbar } from "../layout/TopToolbar";
import { formatMoneyExact } from "../misc/reporting";
import type { QuoteStatus, QuoteSummary } from "../types";
import { QuoteStatusBadge } from "./QuoteStatusBadge";

const QuoteListActions = () => {
  const { canAccess: canCreate } = useCanAccess({
    resource: "quotes",
    action: "create",
  });
  return (
    <TopToolbar>
      {canCreate ? <CreateButton label="resources.quotes.action.new" /> : null}
    </TopToolbar>
  );
};

/**
 * Quotations (quotes §2.3), read through `quotes_summary`.
 *
 * The list reads the view rather than the table so a row can show the company,
 * the owner, the status badge and the total of the current version without
 * resolving four references per row (§13.3).
 *
 * No delete, single or bulk: the database refuses a `DELETE` on `quotes`
 * outright (§13.2) — a quote ends as `canceled`, because a document somebody
 * was shown is a commercial record.
 *
 * The owner filter is offered, not applied by default. RLS already shows a rep
 * only their own quotes, so a default would change nothing for them and would
 * hide the team's work from the manager who came here to see it.
 */
export const QuoteList = () => {
  const translate = useTranslate();
  // Plain choices, not a `ReferenceInput`: the filter holds `status_key`, and a
  // reference input resolves its current value by calling `getMany` with that
  // value as an ID — which finds nothing, so an applied filter would render
  // blank. The catalogue is eleven rows and read by everybody (§13.2).
  const { data: statuses } = useGetList<QuoteStatus>("quote_statuses", {
    sort: { field: "rank", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });

  const filters = [
    <SearchInput source="q" alwaysOn />,
    <SelectInput
      source="status_key"
      label={false}
      alwaysOn
      choices={(statuses ?? []).map((status) => ({
        id: status.key,
        name: status.label,
      }))}
      emptyText="resources.quotes.filters.any_status"
    />,
    <ReferenceInput source="sales_id" reference="sales">
      <SelectInput
        label="resources.quotes.fields.sales_id"
        optionText={(sale) => `${sale.first_name} ${sale.last_name}`}
      />
    </ReferenceInput>,
  ];

  return (
    <List
      filters={filters}
      actions={<QuoteListActions />}
      // Newest first: a quote is worked on for days and then left alone, so
      // recency is what a rep is looking for, not the document number.
      sort={{ field: "created_at", order: "DESC" }}
    >
      <DataTable rowClick="show" bulkActionButtons={false}>
        <DataTable.Col source="quote_number" />
        <DataTable.Col source="title" />
        <DataTable.Col source="company_name" />
        <DataTable.Col<QuoteSummary>
          source="status_key"
          render={(quote) => (
            <QuoteStatusBadge
              statusKey={quote.status_key}
              label={quote.status_label}
            />
          )}
        />
        <DataTable.Col<QuoteSummary>
          source="current_version_number"
          headerClassName="text-right"
          cellClassName="text-right tabular-nums"
          render={(quote) =>
            quote.current_version_number == null
              ? "—"
              : translate("resources.quotes.version_short", {
                  number: quote.current_version_number,
                })
          }
        />
        {/* Exact, never the dashboard's compact `$9.2M`: a quotation is read to
            the last unit (quotes F4). */}
        <DataTable.Col<QuoteSummary>
          source="total"
          headerClassName="text-right"
          cellClassName="text-right tabular-nums"
          render={(quote) => formatMoneyExact(quote.total, quote.currency)}
        />
        <DataTable.Col source="valid_until">
          <DateField source="valid_until" />
        </DataTable.Col>
        <DataTable.Col source="owner_name" />
      </DataTable>
    </List>
  );
};
