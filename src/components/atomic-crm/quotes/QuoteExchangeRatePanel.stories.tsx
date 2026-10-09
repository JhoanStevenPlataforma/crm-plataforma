import type { Meta } from "@storybook/react-vite";
import {
  RecordContextProvider,
  ResourceContextProvider,
  useGetOne,
  type Identifier,
} from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";

import { canAccess } from "../providers/commons/canAccess";
import {
  DEMO_CURRENCIES,
  DEMO_EXCHANGE_RATE_PROVIDERS,
  DEMO_EXCHANGE_RATE_SETTINGS,
} from "../providers/fakerest/dataGenerator/currencies";
import type { Db } from "../providers/fakerest/dataGenerator/types";
import type {
  CrmRole,
  ExchangeRate,
  ExchangeRateSettings,
  Quote,
  QuoteLine,
  QuoteSummary,
  QuoteVersion,
  Sale,
} from "../types";
import { QuoteExchangeRatePanel } from "./QuoteExchangeRatePanel";
import { quoteLines, quoteVersions, quotes } from "./quoteFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Quote Exchange Rate Panel",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const TODAY = dayOffset(0);

/** Today's official USD rate, as somebody typed it in (demo holds no feed). */
const officialToday: ExchangeRate = {
  id: 1,
  currency_code: "USD",
  base_currency_code: "COP",
  rate: 4000,
  kind: "official",
  provider_id: null,
  effective_date: TODAY,
  fetched_at: `${TODAY}T08:00:00.000Z`,
  note: "TRM of the day",
};

/** A USD draft priced at that rate. */
const usdVersion: Partial<QuoteVersion> = {
  currency: "USD",
  base_currency: "COP",
  exchange_rate: 4000,
  rate_kind: "official",
  exchange_rate_id: 1,
  rate_effective_date: TODAY,
};

type Scenario = {
  role?: CrmRole;
  quote?: Partial<Quote>;
  version?: Partial<QuoteVersion>;
  rates?: ExchangeRate[];
  settings?: Partial<ExchangeRateSettings>;
  lines?: QuoteLine[];
};

const dbFor = ({
  role = "rep",
  quote,
  version = usdVersion,
  rates = [officialToday],
  settings,
  lines = [],
}: Scenario): Partial<Db> =>
  ({
    sales: [
      {
        ...DEFAULT_USER,
        role,
        avatar: DEFAULT_USER.avatar as Sale["avatar"],
        disabled: false,
        user_id: DEFAULT_USER.id.toString(),
      },
    ],
    currencies: DEMO_CURRENCIES,
    exchange_rate_providers: DEMO_EXCHANGE_RATE_PROVIDERS,
    exchange_rate_settings: [
      { ...DEMO_EXCHANGE_RATE_SETTINGS[0], ...settings },
    ],
    exchange_rates: rates,
    quotes: [{ ...quotes[0], currency: "USD", ...quote }],
    quote_versions: [{ ...quoteVersions[0], ...version }],
    quote_lines: lines,
  }) as Partial<Db>;

/** Read, not handed over, so a rate change lands and re-renders. */
const Host = ({ id }: { id: Identifier }) => {
  const { data } = useGetOne<QuoteSummary>("quotes", { id });
  if (!data) return null;
  return (
    <ResourceContextProvider value="quotes">
      <RecordContextProvider value={data}>
        <div className="p-4">
          <QuoteExchangeRatePanel />
        </div>
      </RecordContextProvider>
    </ResourceContextProvider>
  );
};

/**
 * The role is set twice, as in `QuoteActions.stories.tsx`: the `sales` row is
 * what the demo mirror of `set_quote_version_rate()` decides on, and
 * `canAccess` is what the panel decides what to OFFER on.
 */
const Panel = ({ scenario = {} }: { scenario?: Scenario }) => {
  const role = scenario.role ?? "rep";
  return (
    <StoryWrapper
      data={dbFor(scenario)}
      authProvider={{
        canAccess: async (params: { action: string; resource: string }) =>
          canAccess(role, params),
        getIdentity: async () => ({
          id: DEFAULT_USER.id,
          fullName: `${DEFAULT_USER.first_name} ${DEFAULT_USER.last_name}`,
          role,
        }),
      }}
    >
      <Host id={quotes[0].id} />
    </StoryWrapper>
  );
};

/** A rep's USD draft at today's rate, with no tolerance to move it. */
export const RepDraft = () => <Panel />;

/** A manager may set a custom rate, in writing. */
export const ManagerDraft = () => <Panel scenario={{ role: "manager" }} />;

/** A rep allowed ±2% around the official rate. */
export const RepWithTolerance = () => (
  <Panel scenario={{ settings: { rep_custom_rate_tolerance_percent: 2 } }} />
);

/** Priced at a rate from ten days ago, older than the three-day threshold. */
export const StaleDraft = () => (
  <Panel
    scenario={{
      version: {
        ...usdVersion,
        exchange_rate: 3900,
        exchange_rate_id: 99,
        rate_effective_date: dayOffset(-10),
      },
    }}
  />
);

/** An issued version: the rate is frozen with it, and nothing is offered. */
export const Issued = () => (
  <Panel
    scenario={{
      role: "manager",
      quote: { status_key: "sent" },
      version: { ...usdVersion, issued_at: "2026-09-10T10:00:00.000Z" },
    }}
  />
);

/** Quoted in the base currency: there is no rate to show. */
export const BaseCurrency = () => (
  <Panel
    scenario={{
      quote: { currency: "COP" },
      version: {
        currency: "COP",
        base_currency: "COP",
        exchange_rate: 1,
        rate_kind: "base",
      },
    }}
  />
);

/**
 * The TRM of yesterday, valid yesterday only, and no sync since: younger than
 * the threshold, yet past the validity its source states -- stale by the one
 * rule (`fx_rate_is_stale()`), and refused at issue.
 */
export const StaleByValidity = () => (
  <Panel
    scenario={{
      rates: [
        {
          ...officialToday,
          rate: 3300,
          effective_date: dayOffset(-1),
          valid_until: dayOffset(-1),
          note: "TRM of yesterday",
        },
      ],
      version: {
        ...usdVersion,
        exchange_rate: 3300,
        rate_effective_date: dayOffset(-1),
      },
    }}
  />
);

/** A commercial rate chosen five days ago that expired yesterday. */
export const ExpiredCommercial = () => (
  <Panel
    scenario={{
      rates: [
        officialToday,
        {
          ...officialToday,
          id: 2,
          kind: "commercial",
          rate: 4100,
          effective_date: dayOffset(-5),
          valid_until: dayOffset(-1),
          note: "Commercial rate for the week",
        },
      ],
      version: {
        ...usdVersion,
        rate_kind: "commercial",
        exchange_rate: 4100,
        exchange_rate_id: 2,
        rate_effective_date: dayOffset(-5),
      },
    }}
  />
);

/**
 * A quotation in COP priced from a USD list: rate 1, and a line converted at
 * yesterday's TRM, no longer in force now that today's exists.
 */
export const BaseWithConvertedLines = () => (
  <Panel
    scenario={{
      quote: { currency: "COP" },
      version: {
        currency: "COP",
        base_currency: "COP",
        exchange_rate: 1,
        exchange_rate_id: null,
        rate_kind: "base",
        rate_effective_date: dayOffset(-1),
      },
      rates: [
        {
          ...officialToday,
          id: 1,
          rate: 3300,
          effective_date: dayOffset(-1),
          valid_until: dayOffset(-1),
          note: "TRM of yesterday",
        },
        { ...officialToday, id: 2, rate: 3400, valid_until: TODAY },
      ],
      lines: [
        {
          ...quoteLines[0],
          quantity: 1,
          discount_percent: 0,
          unit_price: 3300000,
          source_currency: "USD",
          source_unit_price: 1000,
          source_exchange_rate: 3300,
          source_exchange_rate_id: 1,
        },
      ],
    }}
  />
);
