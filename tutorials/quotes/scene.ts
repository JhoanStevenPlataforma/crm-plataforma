import { createClient } from "@supabase/supabase-js";

import type { CreateQuote, IssueQuote } from "../../e2e/fixtures";
import { PRESENTER } from "../studio";

/**
 * The made-up company every quotation tutorial is filmed in.
 *
 * One cast for the seven films, so a viewer who watches them in order sees
 * the product of tutorial 1 priced in tutorial 2 and quoted in tutorial 3.
 * Each tutorial builds only the part of the scene it starts FROM -- what it
 * teaches is done on camera, never prepared here.
 *
 * Everything is in COP on a COP list: a quotation in the base currency needs
 * no exchange rate, so no film depends on one being fresh.
 */

export const CAST = {
  company: "Ferretería del Norte",
  contact: { first_name: "Carolina", last_name: "Rojas" },
  deal: "Renovación anual",
  priceList: { code: "LISTA-2026", name: "Lista general 2026" },
  products: {
    kit: { sku: "KIT-INST", name: "Kit de instalación", list_price: 450_000 },
    maintenance: {
      sku: "SRV-MANT",
      name: "Mantenimiento anual",
      list_price: 1_200_000,
    },
    training: {
      sku: "CAP-EQUIPO",
      name: "Capacitación del equipo",
      list_price: 800_000,
    },
  },
} as const;

const service = createClient(
  process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
  process.env.SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * The installation's base currency. A fresh e2e database has no configuration
 * row, and the app then falls back to USD in every currency field.
 */
export const setBaseCurrency = async (): Promise<void> => {
  const { error } = await service
    .from("configuration")
    .upsert({ id: 1, config: { currency: "COP" } });
  if (error) throw new Error(`Failed to set the currency: ${error.message}`);
};

interface Factories {
  createProduct: (product: {
    sku: string;
    name: string;
    currency: string;
    list_price: number;
    tax_rate_id: number | null;
  }) => Promise<{ id: number }>;
  createPriceList: (list: {
    code: string;
    name: string;
    currency: string;
    items: { product_id: number; unit_price: number }[];
  }) => Promise<{ id: number }>;
  createCompany: (company: {
    name: string;
    salesId: number;
  }) => Promise<{ id: number }>;
  createContact: (contact: {
    first_name: string;
    last_name: string;
    company_id: number;
    sales_id: number;
    emails?: string[];
  }) => Promise<{ id: number }>;
  createDeal: (deal: {
    name: string;
    company_id: number;
    sales_id: number;
    amount: number;
    stage?: string;
  }) => Promise<{ id: number }>;
  taxRateByCode: (code: string) => Promise<{ id: number }>;
}

/** The three products of the catalogue, taxed at IVA 19%. */
export const stockCatalogue = async (factories: Factories) => {
  const iva = await factories.taxRateByCode("iva_19");
  const create = (
    product: (typeof CAST.products)[keyof typeof CAST.products],
  ) =>
    factories.createProduct({
      ...product,
      currency: "COP",
      tax_rate_id: iva.id,
    });
  return {
    ivaId: iva.id,
    kit: await create(CAST.products.kit),
    maintenance: await create(CAST.products.maintenance),
    training: await create(CAST.products.training),
  };
};

/** The catalogue, its price list, and a customer with an open deal. */
export const openForBusiness = async (
  factories: Factories,
  presenterId: number,
  // The product video picks the story up after the lead was converted, with
  // the amount and the address it was given on camera.
  {
    dealAmount = 0,
    dealStage,
    contactEmail,
  }: { dealAmount?: number; dealStage?: string; contactEmail?: string } = {},
) => {
  const catalogue = await stockCatalogue(factories);
  const priceList = await factories.createPriceList({
    ...CAST.priceList,
    currency: "COP",
    items: [
      { product_id: catalogue.kit.id, unit_price: 420_000 },
      { product_id: catalogue.maintenance.id, unit_price: 1_150_000 },
      { product_id: catalogue.training.id, unit_price: 800_000 },
    ],
  });
  const company = await factories.createCompany({
    name: CAST.company,
    salesId: presenterId,
  });
  const contact = await factories.createContact({
    ...CAST.contact,
    company_id: company.id,
    sales_id: presenterId,
    ...(contactEmail ? { emails: [contactEmail] } : {}),
  });
  const deal = await factories.createDeal({
    name: CAST.deal,
    company_id: company.id,
    sales_id: presenterId,
    amount: dealAmount,
    ...(dealStage ? { stage: dealStage } : {}),
  });
  return { catalogue, priceList, company, contact, deal };
};

type Business = Awaited<ReturnType<typeof openForBusiness>>;

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** A draft of the quotation tutorial 3 writes: three kits and a maintenance. */
export const draftQuote = (
  createQuote: CreateQuote,
  business: Business,
  presenterId: number,
  title = "Renovación anual 2026",
) =>
  createQuote({
    company_id: business.company.id,
    contact_id: business.contact.id,
    deal_id: business.deal.id,
    sales_id: presenterId,
    currency: "COP",
    price_list_id: business.priceList.id,
    title,
    valid_until: inDays(30),
    terms: "Pago a 30 días. Instalación incluida.",
    lines: [
      {
        product_id: business.catalogue.kit.id,
        name: CAST.products.kit.name,
        quantity: 3,
        unit_price: 420_000,
        tax_rate_id: business.catalogue.ivaId,
      },
      {
        product_id: business.catalogue.maintenance.id,
        name: CAST.products.maintenance.name,
        quantity: 1,
        unit_price: 1_150_000,
        tax_rate_id: business.catalogue.ivaId,
      },
    ],
  });

/** The same quotation, already sent: issued by the presenter, link in hand. */
export const sentQuote = async (
  createQuote: CreateQuote,
  issueQuote: IssueQuote,
  business: Business,
  presenterId: number,
  title?: string,
) => {
  const quote = await draftQuote(createQuote, business, presenterId, title);
  const issued = await issueQuote({
    quote_id: quote.id,
    email: PRESENTER.email,
    password: PRESENTER.password,
  });
  return { ...quote, token: issued.token };
};
