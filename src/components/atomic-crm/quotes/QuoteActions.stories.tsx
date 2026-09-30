import type { Meta } from "@storybook/react-vite";
import {
  RecordContextProvider,
  ResourceContextProvider,
  useGetOne,
  type Identifier,
} from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";

import type { Db } from "../providers/fakerest/dataGenerator/types";
import type { Quote, QuoteLine, QuoteSummary, QuoteVersion } from "../types";
import { QuoteActions } from "./QuoteActions";
import { QuoteLinksPanel } from "./QuoteLinksPanel";
import {
  companies,
  priceListItems,
  priceLists,
  products,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
  taxRates,
} from "./quoteFixtures";

const meta = {
  title: "Atomic CRM/Quotes/Quote Actions",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

/** The eleven statuses, not the three the line fixtures needed. */
const allStatuses = [
  ...quoteStatuses,
  ...(
    [
      ["pending_approval", "Pending approval", 20],
      ["approved", "Approved", 30],
      ["negotiating", "Negotiating", 70],
      ["rejected", "Rejected", 90],
      ["canceled", "Canceled", 110],
    ] as const
  ).map(([key, label, rank], index) => ({
    id: 100 + index,
    key,
    label,
    color: "#64748b",
    rank,
    is_open: key !== "canceled" && key !== "rejected",
    is_terminal: key === "canceled" || key === "rejected",
    counts_as_won: false,
    is_system: true,
  })),
];

/**
 * A quotation created a year ago, so a ceiling switched on today governs it.
 * The gate exempts quotes that predate the rule on purpose (§3.1), and a
 * fixture without a date would silently take that exemption.
 */
const CREATED_AT = "2025-09-01T09:00:00.000Z";

const baseDb = {
  companies,
  products,
  price_lists: priceLists,
  price_list_items: priceListItems,
  tax_rates: taxRates,
  quote_statuses: allStatuses,
  sales: [
    {
      ...DEFAULT_USER,
      role: "admin",
      avatar: DEFAULT_USER.avatar,
      disabled: false,
    },
  ],
};

type Scenario = {
  quote?: Partial<Quote>;
  version?: Partial<QuoteVersion>;
  lines?: QuoteLine[];
  /** The role of the only user: the gate and the approval rule read it. */
  role?: "rep" | "manager" | "admin";
  /** `enforced_from` on every ceiling. Absent means the rule is off. */
  enforcedFrom?: string;
  /** The ceiling each role gets, and the band above which a motive is asked. */
  ceiling?: number;
  reasonAbove?: number;
};

const dbFor = ({
  quote,
  version,
  lines,
  role = "admin",
  enforcedFrom,
  ceiling = 5,
  reasonAbove = 2,
}: Scenario): Partial<Db> =>
  ({
    ...baseDb,
    sales: [{ ...baseDb.sales[0], role }],
    quotes: [{ ...quotes[0], created_at: CREATED_AT, ...quote }],
    quote_versions: [{ ...quoteVersions[0], ...version }],
    quote_lines: lines ?? quoteLines,
    // A tuned installation: both ceilings lowered to 5%, so the document's 10%
    // is over the limit for whoever is asking. The seeded admin ceiling is
    // 100%, which is why an admin is normally never blocked — the override path
    // exists for the installation that lowers it, and that is the one modelled
    // here.
    ...(enforcedFrom
      ? {
          quote_discount_rules: (["rep", "manager", "admin"] as const).map(
            (ruleRole, index) => ({
              id: index + 1,
              role: ruleRole,
              max_discount_percent: ceiling,
              requires_reason_above: reasonAbove,
              enforced_from: enforcedFrom,
            }),
          ),
        }
      : {}),
  }) as Partial<Db>;

/**
 * The quote is READ rather than handed over as a literal, so a move actually
 * lands: `refresh()` re-reads it and the toolbar re-renders from what the
 * provider now holds. A static record would show the old status forever and
 * every assertion about a move would be vacuous.
 */
const Host = ({ id, withLinks }: { id: Identifier; withLinks?: boolean }) => {
  const { data } = useGetOne<QuoteSummary>("quotes", { id });
  if (!data) return null;
  return (
    <ResourceContextProvider value="quotes">
      <RecordContextProvider value={data}>
        <div className="flex flex-col gap-6 p-4">
          <QuoteActions />
          {withLinks ? <QuoteLinksPanel /> : null}
        </div>
      </RecordContextProvider>
    </ResourceContextProvider>
  );
};

/**
 * The role is set in TWO places, and they are not the same question.
 *
 * The `sales` row is what the mirror reads to decide (as `current_sales_role()`
 * does), and the identity is what the screen reads to decide what to OFFER. A
 * story that set only the first would render an admin's override box to a rep
 * and prove nothing about either.
 */
const Panel = ({
  scenario = {},
  withLinks,
}: {
  scenario?: Scenario;
  withLinks?: boolean;
}) => (
  <StoryWrapper
    data={dbFor(scenario)}
    authProvider={{
      getIdentity: async () => ({
        id: DEFAULT_USER.id,
        fullName: `${DEFAULT_USER.first_name} ${DEFAULT_USER.last_name}`,
        role: scenario.role ?? "admin",
      }),
    }}
  >
    <Host id={quotes[0].id} withLinks={withLinks} />
  </StoryWrapper>
);

/** A draft with lines: the three moves a draft offers. */
export const Draft = () => <Panel withLinks />;

/** Nothing to send: a quote with no lines is not a quotation. */
export const EmptyDraft = () => <Panel scenario={{ lines: [] }} />;

/**
 * The discount ceiling switched on, and the document 10% over a 5% limit. The
 * rep's way forward is an approval, not a longer sentence.
 */
export const OverTheCeiling = () => (
  <Panel scenario={{ role: "rep", enforcedFrom: "2025-01-01T00:00:00.000Z" }} />
);

/** The same document, as an admin: the override appears, in writing. */
export const OverTheCeilingAsAdmin = () => (
  <Panel
    scenario={{ role: "admin", enforcedFrom: "2025-01-01T00:00:00.000Z" }}
  />
);

/**
 * Inside the ceiling, above the band: the issue goes through, but not silently.
 * A different motive from the override and stored in a different place — this
 * one lands on the `sent` history row (§13.6 #1).
 */
export const InsideTheReasonBand = () => (
  <Panel
    scenario={{
      role: "rep",
      enforcedFrom: "2025-01-01T00:00:00.000Z",
      ceiling: 25,
      reasonAbove: 5,
    }}
  />
);

/** A rep on a quote waiting for sign-off: approving is not theirs to do. */
export const PendingApprovalAsRep = () => (
  <Panel
    scenario={{ role: "rep", quote: { status_key: "pending_approval" } }}
  />
);

/** An issued document: negotiate, revise or cancel — never edit. */
export const Sent = () => (
  <Panel
    withLinks
    scenario={{
      quote: { status_key: "sent" },
      version: { issued_at: "2026-09-10T10:00:00.000Z" },
    }}
  />
);

/**
 * The customer declined the version they were sent. The way on is to
 * renegotiate THIS quotation — a new version of it, the same link — not to
 * start another one.
 */
export const Rejected = () => (
  <Panel
    withLinks
    scenario={{
      quote: { status_key: "rejected" },
      version: {
        issued_at: "2026-09-10T10:00:00.000Z",
        rejected_at: "2026-09-12T10:00:00.000Z",
        rejected_reason_code: "price",
      },
    }}
  />
);

/** An offer that lapsed before it was sent: the link would be dead on arrival. */
export const LapsedDraft = () => (
  <Panel
    scenario={{
      quote: { valid_until: "2020-01-01" },
      version: { valid_until: "2020-01-01" },
    }}
  />
);

/** A terminal status has no moves left, and the toolbar says so. */
export const Canceled = () => (
  <Panel scenario={{ quote: { status_key: "canceled" } }} />
);
