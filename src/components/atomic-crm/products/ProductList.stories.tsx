import type { Meta } from "@storybook/react-vite";
import { ResourceContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import { canAccess } from "../providers/commons/canAccess";
import type { CrmRole, Product, TaxRate } from "../types";
import { ProductList } from "./ProductList";

const meta = {
  title: "Atomic CRM/Products/Product List",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

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
];

const products: Product[] = [
  {
    id: 1,
    sku: "SRV-001",
    name: "Implementation project",
    kind: "service",
    category: "services",
    unit: "hour",
    list_price: 9_200_000,
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
    list_price: 1234.5,
    currency: "USD",
    tax_rate_id: null,
    is_active: false,
  },
];

/** The application's own access rules, evaluated for one role. */
const asRole = (role: CrmRole) => ({
  canAccess: async (params: { action: string; resource: string }) =>
    canAccess(role, params),
});

export const AsManager = () => (
  <StoryWrapper data={{ products, tax_rates }} authProvider={asRole("manager")}>
    <ResourceContextProvider value="products">
      <ProductList />
    </ResourceContextProvider>
  </StoryWrapper>
);

/** A rep quotes from the catalogue, so they read it, but cannot change it. */
export const AsSalesRep = () => (
  <StoryWrapper data={{ products, tax_rates }} authProvider={asRole("rep")}>
    <ResourceContextProvider value="products">
      <ProductList />
    </ResourceContextProvider>
  </StoryWrapper>
);
