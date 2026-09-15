import type { Meta } from "@storybook/react-vite";
import { RecordContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { PriceList, PriceListItem, Product, TaxRate } from "../types";
import { PriceListItems } from "./PriceListItems";

const meta = {
  title: "Atomic CRM/Price Lists/Price List Items",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

const priceList: PriceList = {
  id: 7,
  code: "COP-2026",
  name: "Colombia 2026",
  currency: "COP",
  is_default: true,
  is_active: true,
};

const tax_rates: TaxRate[] = [
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

const products: Product[] = [
  {
    id: 1,
    sku: "SRV-001",
    name: "Implementation project",
    kind: "service",
    unit: "hour",
    list_price: 250_000,
    currency: "COP",
    tax_rate_id: 1,
    is_active: true,
  },
  // Priced on this list before it was taken out of the catalogue.
  {
    id: 2,
    sku: "W-OLD",
    name: "Old widget",
    kind: "product",
    unit: "unit",
    list_price: 1500,
    currency: "COP",
    tax_rate_id: 1,
    is_active: false,
  },
];

const price_list_items: PriceListItem[] = [
  {
    id: 1,
    price_list_id: 7,
    product_id: 2,
    unit_price: 1500,
    min_quantity: 1,
    tax_rate_id: null,
  },
];

const Items = () => (
  <RecordContextProvider value={priceList}>
    <PriceListItems />
  </RecordContextProvider>
);

export const WithPrices = () => (
  <StoryWrapper
    data={{ price_lists: [priceList], products, tax_rates, price_list_items }}
  >
    <Items />
  </StoryWrapper>
);

export const Empty = () => (
  <StoryWrapper
    data={{
      price_lists: [priceList],
      products,
      tax_rates,
      price_list_items: [],
    }}
  >
    <Items />
  </StoryWrapper>
);

/**
 * The unique key on (list, product, minimum quantity) refusing the add, as
 * PostgREST reports it. FakeRest enforces no unique keys, so the refusal is
 * injected.
 */
export const DuplicatePrice = () => (
  <StoryWrapper
    data={{
      price_lists: [priceList],
      products,
      tax_rates,
      price_list_items: [],
    }}
    dataProvider={{
      create: async () => {
        throw Object.assign(
          new Error("duplicate key value violates unique constraint"),
          { body: { code: "23505" } },
        );
      },
    }}
  >
    <Items />
  </StoryWrapper>
);
