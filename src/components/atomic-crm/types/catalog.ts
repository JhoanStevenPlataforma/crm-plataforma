/**
 * The commercial catalogue quotes are priced from: tax rates, products and price
 * lists (docs/proposals/quotes-cpq-module.md §2.1–§2.2; the writable columns are
 * in §13.2).
 */

import type { Identifier } from "ra-core";

/** Mirrors the check constraint on `public.products.kind`. */
export type ProductKind =
  | "product"
  | "service"
  | "plan"
  | "subscription"
  | "concept";

export type TaxRate = {
  id: Identifier;
  code: string;
  label: string;
  /** A percentage: `19` is IVA 19%. */
  rate: number;
  is_default: boolean;
  active: boolean;
  rank: number;
  /** Seeded by the migration. The UI keeps its `code` fixed (§13.6 #5). */
  is_system: boolean;
};

export type Product = {
  id: Identifier;
  sku: string;
  name: string;
  description?: string | null;
  /** For the sales team only; never part of the customer portal (§6.3). */
  internal_notes?: string | null;
  kind: ProductKind;
  /** A `productCategories` value from the configuration. */
  category?: string | null;
  /** A `productUnits` value from the configuration. */
  unit: string;
  list_price: number;
  /** ISO 4217. Required, with no database default (F3). */
  currency: string;
  tax_rate_id?: Identifier | null;
  is_active: boolean;
  sales_id?: Identifier | null;
  created_at?: string;
  updated_at?: string;
};

export type PriceList = {
  id: Identifier;
  code: string;
  name: string;
  currency: string;
  /** One active default per currency, enforced by a unique index. */
  is_default: boolean;
  is_active: boolean;
  /** Informational: `price_book` does not read the validity dates (§13.2). */
  valid_from?: string | null;
  valid_to?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PriceListItem = {
  id: Identifier;
  price_list_id: Identifier;
  product_id: Identifier;
  unit_price: number;
  /** Overrides the product's own rate for this list. */
  tax_rate_id?: Identifier | null;
  min_quantity: number;
};
