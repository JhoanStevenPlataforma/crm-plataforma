import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RecordContextProvider, ResourceContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import {
  DEMO_CURRENCIES,
  DEMO_EXCHANGE_RATE_PROVIDERS,
  DEMO_EXCHANGE_RATE_SETTINGS,
} from "../providers/fakerest/dataGenerator/currencies";
import type { Db } from "../providers/fakerest/dataGenerator/types";
import type { ExchangeRate, QuoteSummary, QuoteVersion } from "../types";
import { QuoteLines } from "./QuoteLines";
import {
  quoteStatuses,
  quoteVersions,
  quotes,
  taxRates,
} from "./quoteFixtures";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const rate = (row: Partial<ExchangeRate>): ExchangeRate =>
  ({
    base_currency_code: "COP",
    provider_id: null,
    fetched_at: `${day(0)}T08:00:00.000Z`,
    note: "Typed in",
    valid_until: null,
    ...row,
  }) as ExchangeRate;

/** A USD quotation priced from a EUR list: one product at 100 EUR. */
const dataFor = (
  defaultKind: "official" | "commercial",
  version: Partial<QuoteVersion>,
  rates: ExchangeRate[],
): Partial<Db> =>
  ({
    currencies: DEMO_CURRENCIES,
    exchange_rate_providers: DEMO_EXCHANGE_RATE_PROVIDERS,
    exchange_rate_settings: [
      {
        ...DEMO_EXCHANGE_RATE_SETTINGS[0],
        quote_rate_kind_default: defaultKind,
      },
    ],
    exchange_rates: rates,
    tax_rates: taxRates,
    quote_statuses: quoteStatuses,
    price_lists: [
      {
        id: 2,
        code: "EUR-2026",
        name: "Europe 2026",
        currency: "EUR",
        is_default: false,
        is_active: true,
      },
    ],
    products: [
      {
        id: 5,
        sku: "EU-001",
        name: "European spare part",
        kind: "product",
        category: "parts",
        unit: "unit",
        list_price: 100,
        currency: "EUR",
        tax_rate_id: 3,
        is_active: true,
      },
    ],
    price_list_items: [
      {
        id: 9,
        price_list_id: 2,
        product_id: 5,
        unit_price: 100,
        tax_rate_id: 3,
        min_quantity: 1,
      },
    ],
    quotes: [
      { ...quotes[0], currency: "USD", price_list_id: 2, valid_until: day(10) },
    ],
    quote_versions: [
      {
        ...quoteVersions[0],
        currency: "USD",
        base_currency: "COP",
        valid_until: day(10),
        subtotal: 0,
        discount_total: 0,
        tax_total: 0,
        total: 0,
        ...version,
      },
    ],
    quote_lines: [],
  }) as Partial<Db>;

const record = (): QuoteSummary =>
  ({
    ...quotes[0],
    currency: "USD",
    price_list_id: 2,
    status_label: "Draft",
    current_version_id: quoteVersions[0].id,
    current_version_number: 1,
  }) as QuoteSummary;

/** Picks the EUR product, reads the preview, adds the line, reads the price stored. */
const previewThenStore = async (data: Partial<Db>) => {
  const screen = await render(
    <StoryWrapper data={data}>
      <ResourceContextProvider value="quotes">
        <RecordContextProvider value={record()}>
          <QuoteLines />
        </RecordContextProvider>
      </ResourceContextProvider>
    </StoryWrapper>,
  );
  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /European spare part/ }).click();
  const preview = page.getByText(/→ USD \$\d/);
  await expect.element(preview).toBeVisible();
  const previewText = preview.element().textContent ?? "";

  await page.getByRole("button", { name: "Add line" }).click();
  const stored = page.getByRole("spinbutton", {
    name: "Unit price of European spare part",
  });
  await expect.element(stored).toBeVisible();
  const storedValue = (stored.element() as HTMLInputElement).value;
  screen.unmount();
  return { previewText, storedValue };
};

/**
 * The picker previews a converted price with the backend's own resolution
 * (`fx_line_source_rate()`), so what the rep is shown is what the line is
 * stored at. Against the demo mirror, which `fx_quote_source_rates.test.sql`
 * pins to the SQL with the same figures.
 */
describe("QuoteLines: a price from a list in another currency", () => {
  it("previews the rate a custom version will really convert at: the commercial EUR by default", async () => {
    const { previewText, storedValue } = await previewThenStore(
      dataFor(
        "commercial",
        {
          rate_kind: "custom",
          exchange_rate: 4100,
          exchange_rate_id: null,
          rate_effective_date: day(0),
          rate_set_at: new Date().toISOString(),
          rate_reason: "Negotiated",
        },
        [
          rate({
            id: 1,
            currency_code: "USD",
            rate: 4000,
            kind: "official",
            effective_date: day(0),
            valid_until: day(0),
          }),
          rate({
            id: 2,
            currency_code: "EUR",
            rate: 3700,
            kind: "official",
            effective_date: day(0),
          }),
          rate({
            id: 3,
            currency_code: "EUR",
            rate: 3800,
            kind: "commercial",
            effective_date: day(0),
            valid_until: day(30),
          }),
        ],
      ),
    );

    // 100 x 3800 / 4100 -- not 100 x 3700 / 4100 = 90.24.
    expect(previewText).toContain("$92.68");
    expect(storedValue).toBe("92.68");
  });

  it("pairs the EUR of the version's own rate day, never a later one", async () => {
    const { previewText, storedValue } = await previewThenStore(
      dataFor(
        "official",
        {
          rate_kind: "official",
          exchange_rate: 3300,
          exchange_rate_id: 1,
          rate_effective_date: day(-1),
          rate_set_at: `${day(-1)}T15:00:00.000Z`,
        },
        [
          rate({
            id: 1,
            currency_code: "USD",
            rate: 3300,
            kind: "official",
            effective_date: day(-1),
            valid_until: day(-1),
          }),
          rate({
            id: 2,
            currency_code: "USD",
            rate: 3400,
            kind: "official",
            effective_date: day(0),
            valid_until: day(0),
          }),
          rate({
            id: 3,
            currency_code: "EUR",
            rate: 3666.6666666667,
            kind: "official",
            effective_date: day(-1),
          }),
          rate({
            id: 4,
            currency_code: "EUR",
            rate: 3863.6363636364,
            kind: "official",
            effective_date: day(0),
          }),
        ],
      ),
    );

    // 100 x 3666.67 / 3300 -- not today's EUR over yesterday's USD (117.08).
    expect(previewText).toContain("$111.11");
    expect(storedValue).toBe("111.11");
  });
});
