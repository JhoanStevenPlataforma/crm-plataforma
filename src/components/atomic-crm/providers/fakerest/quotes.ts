/**
 * Demo-mode stand-ins for what the quotes module does in SQL.
 *
 * FakeRest has no views, no triggers and no generated columns, so three things
 * the real backend guarantees have to be reproduced here or the screens render
 * something that is not a quotation:
 *
 *   * `quotes_summary` — the names, the status badge and the current version's
 *     totals a list row shows (§13.3);
 *   * `price_book` — what the line picker offers, including a list's own price
 *     and its tax override (§2.6);
 *   * the line triggers — `quote_lines_snapshot_defaults` (the snapshot the
 *     client no longer copies, §13.6 #10), the four generated amount columns,
 *     and the totals rollup onto the version (D8).
 *
 * The arithmetic is imported from `quotes/quoteMath`, not rewritten: demo mode
 * disagreeing with the server about what a document costs is exactly the drift
 * a single implementation exists to prevent.
 */

import type { DataProvider, Identifier } from "ra-core";
import type { ResourceCallbacks } from "ra-core";

import { lineAmounts, quoteAmounts } from "../../quotes/quoteMath";
import type {
  Company,
  Deal,
  PriceBookEntry,
  PriceList,
  PriceListItem,
  Product,
  Quote,
  QuoteComment,
  QuoteLine,
  QuoteStatus,
  QuoteSummary,
  QuoteVersion,
  Sale,
  TaxRate,
} from "../../types";

/** Catalogue and document scale: one page holds everything (§11). */
const ALL = { page: 1, perPage: 1000 };
const BY_ID = { field: "id", order: "ASC" } as const;

const listAll = async <T>(
  dataProvider: DataProvider,
  resource: string,
  filter: Record<string, unknown> = {},
): Promise<T[]> => {
  const { data } = await dataProvider.getList<any>(resource, {
    filter,
    sort: BY_ID,
    pagination: ALL,
  });
  return (data ?? []) as T[];
};

const sameId = (
  a: Identifier | null | undefined,
  b: Identifier | null | undefined,
) => a != null && b != null && String(a) === String(b);

/**
 * The current version: the draft while there is one, otherwise the newest
 * issued document — the same `order by version_number desc limit 1` the view
 * uses.
 */
const currentVersionOf = (versions: QuoteVersion[], quoteId: Identifier) =>
  versions
    .filter((version) => sameId(version.quote_id, quoteId))
    .sort((a, b) => b.version_number - a.version_number)[0];

/** One quote, as `quotes_summary` would return it. */
const summaryOf = (
  quote: Quote,
  context: {
    companies: Company[];
    deals: Deal[];
    sales: Sale[];
    statuses: QuoteStatus[];
    versions: QuoteVersion[];
    lines: QuoteLine[];
    comments: QuoteComment[];
  },
): QuoteSummary => {
  const version = currentVersionOf(context.versions, quote.id);
  const status = context.statuses.find((row) => row.key === quote.status_key);
  const owner = context.sales.find((sale) => sameId(sale.id, quote.sales_id));

  return {
    ...quote,
    company_name:
      context.companies.find((company) => sameId(company.id, quote.company_id))
        ?.name ?? null,
    deal_name:
      context.deals.find((deal) => sameId(deal.id, quote.deal_id))?.name ??
      null,
    owner_name: owner ? `${owner.first_name} ${owner.last_name}` : null,
    status_label: status?.label ?? quote.status_key,
    status_color: status?.color ?? null,
    status_is_open: status?.is_open ?? null,
    status_is_terminal: status?.is_terminal ?? null,
    status_counts_as_won: status?.counts_as_won ?? null,
    current_version_id: version?.id ?? null,
    current_version_number: version?.version_number ?? null,
    issued_at: version?.issued_at ?? null,
    subtotal: version?.subtotal ?? null,
    discount_total: version?.discount_total ?? null,
    tax_total: version?.tax_total ?? null,
    total: version?.total ?? null,
    accepted_at: version?.accepted_at ?? null,
    party_snapshot: version?.party_snapshot ?? null,
    nb_issued_versions: context.versions.filter(
      (row) => sameId(row.quote_id, quote.id) && row.issued_at != null,
    ).length,
    nb_lines: context.lines.filter((line) =>
      sameId(line.version_id, version?.id),
    ).length,
    nb_shared_comments: context.comments.filter(
      (comment) =>
        sameId(comment.quote_id, quote.id) &&
        comment.visibility === "shared" &&
        comment.deleted_at == null,
    ).length,
    nb_unanswered_customer_comments: context.comments.filter(
      (comment) =>
        sameId(comment.quote_id, quote.id) &&
        comment.author_kind === "customer" &&
        comment.read_by_internal_at == null &&
        comment.deleted_at == null,
    ).length,
  };
};

export const decorateQuotes = async (
  dataProvider: DataProvider,
  quotes: Quote[],
): Promise<QuoteSummary[]> => {
  if (quotes.length === 0) return [];

  const [companies, deals, sales, statuses, versions, lines, comments] =
    await Promise.all([
      listAll<Company>(dataProvider, "companies"),
      listAll<Deal>(dataProvider, "deals"),
      listAll<Sale>(dataProvider, "sales"),
      listAll<QuoteStatus>(dataProvider, "quote_statuses"),
      listAll<QuoteVersion>(dataProvider, "quote_versions"),
      listAll<QuoteLine>(dataProvider, "quote_lines"),
      listAll<QuoteComment>(dataProvider, "quote_comments"),
    ]);

  const context = {
    companies,
    deals,
    sales,
    statuses,
    versions,
    lines,
    comments,
  };
  return quotes.map((quote) => summaryOf(quote, context));
};

/**
 * `price_book`: every active product, priced for every active list.
 *
 * The last predicate is the load-bearing one, and it is copied rather than
 * simplified: a product with no explicit row in a list falls back to its own
 * `list_price` ONLY when the currencies match. That is what stops the picker
 * offering a USD-priced product inside a COP list, and a silent currency
 * mismatch is worse than an absent row.
 */
export const getPriceBook = async (
  dataProvider: DataProvider,
  filter: Record<string, any> = {},
): Promise<PriceBookEntry[]> => {
  const [priceLists, products, items, taxRates] = await Promise.all([
    listAll<PriceList>(dataProvider, "price_lists"),
    listAll<Product>(dataProvider, "products"),
    listAll<PriceListItem>(dataProvider, "price_list_items"),
    listAll<TaxRate>(dataProvider, "tax_rates"),
  ]);

  const rows: PriceBookEntry[] = [];

  for (const priceList of priceLists.filter((list) => list.is_active)) {
    if (
      filter.price_list_id != null &&
      !sameId(priceList.id, filter.price_list_id)
    ) {
      continue;
    }

    for (const product of products.filter((row) => row.is_active)) {
      const item = items.find(
        (row) =>
          sameId(row.price_list_id, priceList.id) &&
          sameId(row.product_id, product.id),
      );
      if (!item && priceList.currency !== product.currency) continue;

      const taxRateId = item?.tax_rate_id ?? product.tax_rate_id ?? null;
      const taxRate = taxRates.find((rate) => sameId(rate.id, taxRateId));
      const minQuantity = item?.min_quantity ?? 1;

      rows.push({
        id: `${priceList.id}:${product.id}:${minQuantity}`,
        price_list_id: priceList.id,
        price_list_code: priceList.code,
        price_list_name: priceList.name,
        currency: priceList.currency,
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description ?? null,
        kind: product.kind,
        category: product.category ?? null,
        unit: product.unit,
        unit_price: item?.unit_price ?? product.list_price,
        is_list_price: item != null,
        min_quantity: minQuantity,
        tax_rate_id: taxRateId,
        tax_rate_code: taxRate?.code ?? null,
        tax_rate_percent: taxRate?.rate ?? null,
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
};

/** `refresh_quote_version_totals()`, which a trigger calls on every line write. */
const refreshVersionTotals = async (
  dataProvider: DataProvider,
  versionId: Identifier | null | undefined,
) => {
  if (versionId == null) return;
  const [version] = await listAll<QuoteVersion>(
    dataProvider,
    "quote_versions",
    {
      id: versionId,
    },
  );
  if (!version) return;

  const lines = await listAll<QuoteLine>(dataProvider, "quote_lines", {
    version_id: versionId,
  });

  await dataProvider.update("quote_versions", {
    id: versionId,
    data: quoteAmounts(lines),
    previousData: version,
  });
};

/**
 * The `quotes` triggers: the document number, the forced `draft` status and the
 * first version, which is what gives the line editor something to write to.
 */
export const quoteCallbacks = (): ResourceCallbacks<Quote> => ({
  resource: "quotes",
  beforeCreate: async (params) => ({
    ...params,
    data: {
      ...params.data,
      quote_number:
        params.data.quote_number ??
        `Q-${new Date().getFullYear()}-${`${Math.floor(Math.random() * 99999)}`.padStart(5, "0")}`,
      // A quote is born a draft whatever the request body says.
      status_key: "draft",
      created_at: params.data.created_at ?? new Date().toISOString(),
    },
  }),
  afterCreate: async (result, dataProvider) => {
    await dataProvider.create("quote_versions", {
      data: {
        quote_id: result.data.id,
        currency: result.data.currency,
        version_number: 1,
        issued_at: null,
        valid_until: result.data.valid_until ?? null,
        terms: result.data.terms ?? null,
        subtotal: 0,
        discount_total: 0,
        tax_total: 0,
        total: 0,
      },
    });
    return result;
  },
});

/**
 * The `quote_lines` triggers: the snapshot the server fills, the four generated
 * amount columns, and the totals rollup.
 */
export const quoteLineCallbacks = (): ResourceCallbacks<QuoteLine> => ({
  resource: "quote_lines",
  beforeCreate: async (params, dataProvider) => {
    const data = { ...params.data };

    if (data.product_id != null) {
      const [product] = await listAll<Product>(dataProvider, "products", {
        id: data.product_id,
      });
      if (product) {
        data.sku = data.sku ?? product.sku;
        data.name = data.name ?? product.name;
        data.unit = data.unit ?? product.unit;
        if (data.tax_rate_id == null && data.tax_rate_percent == null) {
          data.tax_rate_id = product.tax_rate_id ?? null;
        }
      }
    }

    if (data.tax_rate_percent == null) {
      const [rate] =
        data.tax_rate_id == null
          ? []
          : await listAll<TaxRate>(dataProvider, "tax_rates", {
              id: data.tax_rate_id,
            });
      data.tax_rate_percent = rate?.rate ?? 0;
    }

    if (data.quote_id == null) {
      const [version] = await listAll<QuoteVersion>(
        dataProvider,
        "quote_versions",
        { id: data.version_id },
      );
      data.quote_id = version?.quote_id;
    }

    data.discount_percent = data.discount_percent ?? 0;
    return { ...params, data: { ...data, ...lineAmounts(data) } };
  },
  afterCreate: async (result, dataProvider) => {
    await refreshVersionTotals(dataProvider, result.data.version_id);
    return result;
  },
  beforeUpdate: async (params, dataProvider) => {
    const [line] = await listAll<QuoteLine>(dataProvider, "quote_lines", {
      id: params.id,
    });
    const merged = { ...line, ...params.data };
    return { ...params, data: { ...params.data, ...lineAmounts(merged) } };
  },
  afterUpdate: async (result, dataProvider) => {
    await refreshVersionTotals(dataProvider, result.data.version_id);
    return result;
  },
  afterDelete: async (result, dataProvider) => {
    await refreshVersionTotals(dataProvider, result.data.version_id);
    return result;
  },
});
