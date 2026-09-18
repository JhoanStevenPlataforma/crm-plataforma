/**
 * The quote fixtures the stories and the tests share.
 *
 * One set, not one per file, for the reason the module itself is built on:
 * every screen here renders the SAME document, so a fixture that drifts between
 * two tests is two different documents agreeing with nothing.
 *
 * `PARITY_CASES` is the important half. Its expected amounts are not computed
 * by this codebase — they are the values PostgreSQL actually stored, copied
 * from `supabase/tests/database/quotes_schema.test.sql`, which asserts them
 * against the real generated columns. That is what makes `quoteMath.test.ts` a
 * check of AGREEMENT WITH THE SERVER rather than a restatement of the
 * implementation in a second place.
 */

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
  QuoteVersion,
  Sale,
  TaxRate,
} from "../types";
import type { QuoteLineDraft } from "./quoteMath";

type ParityCase = {
  what: string;
  line: QuoteLineDraft;
  /** `[line_gross, line_discount, line_tax, line_total]`, as stored. */
  expected: [number, number, number, number];
};

/** Line amounts as `quotes_schema.test.sql` observed them in the database. */
export const PARITY_CASES: ParityCase[] = [
  {
    what: "3 x 1000.00, 10% off, 19% IVA",
    line: {
      quantity: 3,
      unit_price: 1000,
      discount_percent: 10,
      tax_rate_percent: 19,
    },
    expected: [3000, 300, 513, 3213],
  },
  {
    // THE case naive floating point gets wrong: `1.005 * 100` is
    // 100.49999999999999, so `Math.round` takes the half DOWN to 1.00 where the
    // database stores 1.01. Every other case here survives naive rounding by
    // luck, which is why this one is in the suite.
    what: "1.005 x 1.00, a quantity landing on half a cent",
    line: {
      quantity: 1.005,
      unit_price: 1,
      discount_percent: 0,
      tax_rate_percent: 19,
    },
    expected: [1.01, 0, 0.19, 1.2],
  },
  {
    what: "1.5 x 333.33 = 499.995, which rounds up",
    line: {
      quantity: 1.5,
      unit_price: 333.33,
      discount_percent: 0,
      tax_rate_percent: 19,
    },
    expected: [500, 0, 95, 595],
  },
  {
    // 0.0057 of tax on a three-cent line: the per-line rounding the document
    // prints, and the reason the totals are never summed unrounded.
    what: "1 x 0.03 at 19%",
    line: {
      quantity: 1,
      unit_price: 0.03,
      discount_percent: 0,
      tax_rate_percent: 19,
    },
    expected: [0.03, 0, 0.01, 0.04],
  },
];

export const quoteStatuses: QuoteStatus[] = [
  {
    id: 1,
    key: "draft",
    label: "Draft",
    color: "#64748b",
    rank: 10,
    is_open: true,
    is_terminal: false,
    counts_as_won: false,
    is_system: true,
  },
  {
    id: 4,
    key: "sent",
    label: "Sent",
    color: "#2563eb",
    rank: 40,
    is_open: true,
    is_terminal: false,
    counts_as_won: false,
    is_system: true,
  },
  {
    id: 8,
    key: "accepted",
    label: "Accepted",
    color: "#16a34a",
    rank: 80,
    is_open: false,
    is_terminal: true,
    counts_as_won: true,
    is_system: true,
  },
];

export const taxRates: TaxRate[] = [
  {
    id: 1,
    code: "iva_19",
    label: "IVA 19%",
    rate: 19,
    is_default: true,
    active: true,
    rank: 10,
    is_system: true,
  },
  {
    id: 3,
    code: "exento",
    label: "Exento",
    rate: 0,
    is_default: false,
    active: true,
    rank: 30,
    is_system: true,
  },
];

export const products: Product[] = [
  {
    id: 1,
    sku: "SRV-001",
    name: "Implementation project",
    kind: "service",
    category: "services",
    unit: "hour",
    list_price: 220000,
    currency: "COP",
    tax_rate_id: 1,
    is_active: true,
  },
  {
    id: 2,
    sku: "LIC-001",
    name: "Annual license",
    kind: "subscription",
    category: "software",
    unit: "license",
    list_price: 1200000,
    currency: "COP",
    tax_rate_id: 1,
    is_active: true,
  },
];

export const priceLists: PriceList[] = [
  {
    id: 1,
    code: "COP-2026",
    name: "Colombia 2026",
    currency: "COP",
    is_default: true,
    is_active: true,
  },
];

/**
 * One product is priced by the list and one is not, which is the pair
 * `price_book` exists to reconcile: the second falls back to its own
 * `list_price` because its currency matches the list's.
 */
export const priceListItems: PriceListItem[] = [
  {
    id: 1,
    price_list_id: 1,
    product_id: 1,
    unit_price: 200000,
    tax_rate_id: null,
    min_quantity: 1,
  },
];

/** What the picker offers: `price_book`, keyed as the view keys it. */
export const priceBook: PriceBookEntry[] = [
  {
    id: "1:1:1",
    price_list_id: 1,
    price_list_code: "COP-2026",
    price_list_name: "Colombia 2026",
    currency: "COP",
    product_id: 1,
    sku: "SRV-001",
    name: "Implementation project",
    kind: "service",
    category: "services",
    unit: "hour",
    unit_price: 200000,
    is_list_price: true,
    min_quantity: 1,
    tax_rate_id: 1,
    tax_rate_code: "iva_19",
    tax_rate_percent: 19,
  },
  {
    id: "1:2:1",
    price_list_id: 1,
    price_list_code: "COP-2026",
    price_list_name: "Colombia 2026",
    currency: "COP",
    product_id: 2,
    sku: "LIC-001",
    name: "Annual license",
    kind: "subscription",
    category: "software",
    unit: "license",
    unit_price: 1200000,
    is_list_price: false,
    min_quantity: 1,
    tax_rate_id: 1,
    tax_rate_code: "iva_19",
    tax_rate_percent: 19,
  },
];

export const companies: Company[] = [
  {
    id: 1,
    name: "Acme Andina",
    logo: {} as Company["logo"],
    sales_id: 0,
  } as Company,
];

export const deals: Deal[] = [
  {
    id: 1,
    name: "Acme renewal",
    company_id: 1,
    contact_ids: [],
    stage: "proposal-sent",
    sales_id: 0,
  } as unknown as Deal,
];

export const quotes: Quote[] = [
  {
    id: 1,
    quote_number: "Q-2026-00001",
    title: "Renewal proposal",
    deal_id: 1,
    company_id: 1,
    contact_id: null,
    sales_id: 0,
    price_list_id: 1,
    currency: "COP",
    status_key: "draft",
    valid_until: "2026-12-31",
    terms: null,
    internal_notes: null,
  },
];

export const quoteVersions: QuoteVersion[] = [
  {
    id: 10,
    quote_id: 1,
    currency: "COP",
    version_number: 1,
    issued_at: null,
    valid_until: "2026-12-31",
    terms: null,
    discount_percent: null,
    subtotal: 600000,
    discount_total: 60000,
    tax_total: 102600,
    total: 642600,
  },
];

export const quoteLines: QuoteLine[] = [
  {
    id: 100,
    version_id: 10,
    quote_id: 1,
    product_id: 1,
    sku: "SRV-001",
    name: "Implementation project",
    description: null,
    unit: "hour",
    quantity: 3,
    unit_price: 200000,
    discount_percent: 10,
    tax_rate_id: 1,
    tax_rate_percent: 19,
    position: 1,
  },
];

/**
 * The team a thread is written by: the signed-in user of the stories (id 0,
 * as the demo's default user) and a colleague who does not own the quote.
 */
export const commentAuthors: Sale[] = [
  { id: 0, first_name: "Jane", last_name: "Doe", role: "admin" } as Sale,
  { id: 7, first_name: "Carlos", last_name: "Ruiz", role: "rep" } as Sale,
];

/**
 * A negotiation on quote 1, one of each kind: the owner's internal note, the
 * customer's question from the link to version 1 (unread), a colleague's
 * internal reply to it, and a shared message its author deleted.
 */
export const quoteComments: QuoteComment[] = [
  {
    id: 1,
    quote_id: 1,
    currency: "COP",
    parent_id: null,
    author_sales_id: 0,
    author_kind: "internal",
    visibility: "internal",
    body: "Purchasing confirms stock for October.",
    created_at: "2026-09-11T09:00:00.000Z",
  },
  {
    id: 2,
    quote_id: 1,
    currency: "COP",
    version_id: 10,
    parent_id: null,
    author_sales_id: null,
    author_kind: "customer",
    author_name: "Lucía Gómez",
    author_email: "lucia@acme.example",
    visibility: "shared",
    body: "Could the onboarding\nstart in October?",
    read_by_internal_at: null,
    created_at: "2026-09-11T14:00:00.000Z",
  },
  {
    id: 3,
    quote_id: 1,
    currency: "COP",
    parent_id: 2,
    author_sales_id: 7,
    author_kind: "internal",
    visibility: "internal",
    body: "I will check the delivery calendar.",
    created_at: "2026-09-11T15:00:00.000Z",
  },
  {
    id: 4,
    quote_id: 1,
    currency: "COP",
    parent_id: null,
    author_sales_id: 0,
    author_kind: "internal",
    visibility: "shared",
    body: "A message taken back",
    created_at: "2026-09-11T16:00:00.000Z",
    deleted_at: "2026-09-11T16:05:00.000Z",
  },
];
