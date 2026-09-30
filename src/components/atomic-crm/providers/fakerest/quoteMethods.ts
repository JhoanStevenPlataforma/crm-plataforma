/**
 * Demo-mode stand-ins for the quote RPCs (quotes §13.4).
 *
 * `quotes.ts` mirrors what the schema COMPUTES — the views, the generated
 * columns, the line triggers. This file mirrors what the schema DECIDES: the
 * status machine, the freeze, the discount ceiling and the tokens. The split is
 * the same one the database makes, and it matters here for one reason: a demo
 * that lets a rep do something the real backend refuses teaches the wrong
 * thing, and does it convincingly.
 *
 * Every refusal is thrown as the `QuoteRpcError` the Supabase provider throws,
 * carrying the same stable key — so a screen has one error path, not two.
 *
 * What demo mode deliberately does NOT reproduce: RLS. FakeRest has no row
 * filter, so "somebody else's quote" is visible here in a way it is not in the
 * real backend. The capability checks that are about a ROLE rather than about
 * visibility — a rep may not approve, only an admin overrides the ceiling — are
 * mirrored, because those are the ones a demo would otherwise misrepresent.
 */

import { syncDealFromQuote } from "./dealQuoteSync";
import type { DataProvider, Identifier } from "ra-core";

import { quoteAmounts } from "../../quotes/quoteMath";
import type {
  Company,
  Contact,
  Quote,
  QuoteAccessToken,
  QuoteComment,
  QuoteDiscountGate,
  QuoteDiscountRule,
  QuoteLine,
  QuoteLink,
  QuoteStatusChange,
  QuoteStatusKey,
  QuoteTransition,
  QuoteVersion,
  Sale,
} from "../../types";
import { QUOTE_ERROR, QuoteRpcError } from "../commons/quoteRpc";
import type { QuoteErrorKey } from "../commons/quoteRpc";
import { DEFAULT_TOKEN_DAYS } from "../supabase/quoteMethods";
import type { QuoteMethods } from "../supabase/quoteMethods";

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
 * Always throws. A `function` declaration on purpose, not a `const` arrow:
 * TypeScript narrows after a `never`-returning call only when the callee is
 * declared this way, so `if (!draft) refuse(...)` leaves `draft` defined below.
 */
function refuse(
  key: QuoteErrorKey,
  message: string,
  gate?: QuoteDiscountGate,
): never {
  throw new QuoteRpcError(message, key, gate);
}

/** `round(numeric, 2)`, which takes a half AWAY FROM ZERO. */
const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/** Today, as the database's `current_date` compares it: a calendar day. */
const today = () => new Date().toISOString().slice(0, 10);

const hasElapsed = (validUntil?: string | null) =>
  validUntil != null && validUntil.slice(0, 10) < today();

const versionsOf = async (dataProvider: DataProvider, quoteId: Identifier) =>
  (await listAll<QuoteVersion>(dataProvider, "quote_versions"))
    .filter((version) => sameId(version.quote_id, quoteId))
    .sort((a, b) => b.version_number - a.version_number);

const linesOf = async (
  dataProvider: DataProvider,
  versionId: Identifier | null | undefined,
) =>
  versionId == null
    ? []
    : (await listAll<QuoteLine>(dataProvider, "quote_lines")).filter((line) =>
        sameId(line.version_id, versionId),
      );

const quoteOf = async (dataProvider: DataProvider, quoteId: Identifier) => {
  const { data } = await dataProvider.getOne<Quote>("quotes", { id: quoteId });
  return data;
};

/**
 * The role of the person asking, read off their `sales` row rather than off the
 * identity payload — the same place `current_sales_role()` reads it, so a demo
 * cannot be talked into a privilege by a stale identity.
 */
const roleOf = async (
  dataProvider: DataProvider,
  salesId: Identifier | null | undefined,
): Promise<string | null> => {
  if (salesId == null) return null;
  const sales = await listAll<Sale>(dataProvider, "sales", { id: salesId });
  return sales.find((sale) => sameId(sale.id, salesId))?.role ?? null;
};

/**
 * `quote_party_snapshot()`: the customer's address on the day we sent it.
 *
 * The same keys as the SQL function, field for field. `QuoteDocument` prints an
 * issued version from this object and from nothing else (Phase 6), so a demo
 * snapshot that dropped the tax identifier would print a document the real
 * backend never would. No internal id, and only the first email and number —
 * the SQL picks the same — because this object is rendered verbatim on a page
 * an anonymous visitor can open (§6.3).
 */
const partySnapshotOf = async (
  dataProvider: DataProvider,
  quote: Quote,
): Promise<Record<string, unknown>> => {
  const [companies, contacts, sales] = await Promise.all([
    listAll<Company>(dataProvider, "companies", { id: quote.company_id }),
    quote.contact_id == null
      ? Promise.resolve([] as Contact[])
      : listAll<Contact>(dataProvider, "contacts", { id: quote.contact_id }),
    listAll<Sale>(dataProvider, "sales", { id: quote.sales_id }),
  ]);
  const company = companies.find((row) => sameId(row.id, quote.company_id));
  const contact = contacts.find((row) => sameId(row.id, quote.contact_id));
  const owner = sales.find((row) => sameId(row.id, quote.sales_id));
  const ownerName = [owner?.first_name, owner?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    company: company
      ? {
          name: company.name,
          address: company.address ?? null,
          zipcode: company.zipcode ?? null,
          city: company.city ?? null,
          state_abbr: company.state_abbr ?? null,
          country: company.country ?? null,
          tax_identifier: company.tax_identifier ?? null,
          phone_number: company.phone_number ?? null,
          website: company.website ?? null,
        }
      : null,
    contact: contact
      ? {
          first_name: contact.first_name,
          last_name: contact.last_name,
          title: contact.title ?? null,
          email: contact.email_jsonb?.[0]?.email ?? null,
          phone: contact.phone_jsonb?.[0]?.number ?? null,
        }
      : null,
    // `coalesce(..., 'Sales team')`, as the SQL writes it.
    owner: { name: ownerName || "Sales team" },
    snapshot_at: new Date().toISOString(),
  };
};

/**
 * `refresh_quote_version_totals()`, recomputed before a version is frozen: the
 * figure a customer signs has to be the one the lines add up to.
 */
const refreshTotals = async (
  dataProvider: DataProvider,
  version: QuoteVersion,
) => {
  const lines = await linesOf(dataProvider, version.id);
  const { data } = await dataProvider.update<QuoteVersion>("quote_versions", {
    id: version.id,
    data: quoteAmounts(lines),
    previousData: version,
  });
  return data;
};

/**
 * `quote_discount_gate()`, the rule with two callers (§3.1).
 *
 * Read off the LINES, never off `quote_versions.discount_percent`: that column
 * records an intent, and a commercial control has to be based on what the
 * document actually grants.
 */
export const computeQuoteDiscountGate = async (
  dataProvider: DataProvider,
  quoteId: Identifier,
  actorSalesId: Identifier | null | undefined,
): Promise<QuoteDiscountGate> => {
  const quote = await quoteOf(dataProvider, quoteId);
  const role = await roleOf(dataProvider, actorSalesId);
  const [version] = await versionsOf(dataProvider, quoteId);
  const lines = await linesOf(dataProvider, version?.id);

  // Computed with `quoteMath`, not read off `line_gross` / `line_discount`.
  // Those are generated columns in the database and the SQL gate does read
  // them — here they are filled by a demo callback, so a row that arrived any
  // other way (a seeded fixture, a story) would carry none and the ceiling
  // would silently evaluate a document worth nothing. The arithmetic is the
  // same either way: `quoteAmounts` is what fills them in the first place.
  const { subtotal: gross, discount_total: discount } = quoteAmounts(lines);
  const effective = gross === 0 ? 0 : round2((discount * 100) / gross);

  const rules = await listAll<QuoteDiscountRule>(
    dataProvider,
    "quote_discount_rules",
  );
  const rule = rules.find((row) => row.role === role);

  // No role, no rule for it, the rule not switched on yet, or a quote created
  // before it was. Reported with `max_allowed: null` so a caller can tell "no
  // rule applies here" from "the rule is satisfied".
  // A quote created BEFORE the rule was switched on is not governed by it —
  // switching a ceiling on must not refuse the first issue of every quote in
  // flight on deploy day. An unknown creation date does not buy that exemption:
  // the column is `not null` in the database, so the only way to be here
  // without one is a fixture, and a fixture is not a reason to skip a control.
  const predatesRule =
    rule?.enforced_from != null &&
    quote.created_at != null &&
    quote.created_at < rule.enforced_from;

  if (
    role == null ||
    rule == null ||
    rule.enforced_from == null ||
    predatesRule
  ) {
    return {
      quote_id: quoteId,
      role,
      max_allowed: null,
      effective_discount_percent: effective,
      ok: true,
      reason_required: false,
      requires_reason_above: null,
      since: rule?.enforced_from ?? null,
      offending_line_ids: [],
    };
  }

  let max = rule.max_discount_percent;
  let approverRole: string | null = null;
  let approvalReason: string | null = null;

  // AN APPROVAL RAISES THE CEILING TO THE APPROVER'S — that is what
  // `pending_approval -> approved` is for. Never lower than the asker's own: an
  // approval by somebody with a smaller limit is not a reason to refuse what
  // the asker could have issued alone.
  if (quote.status_key === "approved") {
    const approval = (
      await listAll<QuoteStatusChange>(dataProvider, "quote_status_changes")
    )
      .filter(
        (change) =>
          sameId(change.quote_id, quoteId) && change.to_status === "approved",
      )
      .sort((a, b) => Number(b.id) - Number(a.id))[0];

    if (approval) {
      approverRole = await roleOf(dataProvider, approval.sales_id);
      approvalReason = approval.reason?.trim() || null;
      const approverMax = rules.find(
        (row) => row.role === approverRole,
      )?.max_discount_percent;
      if (approverMax != null && approverMax > max) max = approverMax;
    }
  }

  // THE REASON BAND: inside the ceiling but above `requires_reason_above`, an
  // issue still needs a written motive. A written approval already is one — the
  // rep is not asked to restate what a manager signed off on.
  const reasonRequired =
    rule.requires_reason_above != null &&
    effective > rule.requires_reason_above &&
    approvalReason == null;

  return {
    quote_id: quoteId,
    role,
    approved_by_role: approverRole,
    max_allowed: max,
    effective_discount_percent: effective,
    ok: effective <= max,
    reason_required: reasonRequired,
    requires_reason_above: rule.requires_reason_above ?? null,
    since: rule.enforced_from,
    // Which lines to point the user at. The aggregate decides the verdict; this
    // is what lets the dialog say WHERE the problem is.
    offending_line_ids: lines
      .filter((line) => line.discount_percent > max)
      .map((line) => line.id),
  };
};

/**
 * `apply_quote_status()`: the shared core every move goes through.
 *
 * It exists as its own function in SQL because the portal path has no current
 * user and must not restate the legality rules. It is mirrored here so the demo
 * REFUSES an illegal move with the same key, rather than merely failing to
 * offer a button for it.
 */
const applyQuoteStatus = async (
  dataProvider: DataProvider,
  quoteId: Identifier,
  toStatus: QuoteStatusKey,
  options: {
    reason?: string | null;
    actorKind: "internal" | "customer" | "system";
    salesId?: Identifier | null;
    overrideReason?: string | null;
  },
): Promise<Quote> => {
  const quote = await quoteOf(dataProvider, quoteId);
  const reason = options.reason?.trim() || null;

  if (quote.status_key === toStatus) {
    refuse(
      QUOTE_ERROR.statusUnchanged,
      `Quote ${quoteId} is already ${toStatus}`,
    );
  }

  const edge = (
    await listAll<QuoteTransition>(dataProvider, "quote_transitions")
  ).find(
    (row) =>
      row.from_status_key === quote.status_key &&
      row.to_status_key === toStatus,
  );

  if (!edge) {
    refuse(
      QUOTE_ERROR.transitionIllegal,
      `No move from ${quote.status_key} to ${toStatus}`,
    );
  }

  if (
    edge.allowed_actor !== "any" &&
    edge.allowed_actor !== options.actorKind
  ) {
    refuse(
      QUOTE_ERROR.actorNotAllowed,
      `${options.actorKind} may not move a quote to ${toStatus}`,
    );
  }

  if (edge.requires_reason && reason == null) {
    refuse(QUOTE_ERROR.reasonRequired, `Moving to ${toStatus} needs a reason`);
  }

  if (
    edge.requires_issued_version &&
    !(await versionsOf(dataProvider, quoteId)).some(
      (version) => version.issued_at != null,
    )
  ) {
    refuse(QUOTE_ERROR.notIssued, `Quote ${quoteId} has no issued version`);
  }

  await dataProvider.create("quote_status_changes", {
    data: {
      quote_id: quoteId,
      from_status: quote.status_key,
      to_status: toStatus,
      reason,
      sales_id: options.salesId ?? null,
      actor_kind: options.actorKind,
      changed_at: new Date().toISOString(),
      // Recorded only when it was actually needed, as the RPC does: an override
      // marker on an issue that met the rule is a false accusation.
      override_reason: options.overrideReason ?? null,
    },
  });

  const { data } = await dataProvider.update<Quote>("quotes", {
    id: quoteId,
    data: { status_key: toStatus, updated_at: new Date().toISOString() },
    previousData: quote,
  });
  // `quotes_sync_deal`, which demo mode has no trigger for.
  await syncDealFromQuote(
    dataProvider,
    quoteId,
    toStatus,
    options.salesId ?? null,
  );
  return data;
};

/**
 * `mint_quote_token()`: the one place a link is made and its expiry clamped.
 *
 * A LINK NEVER OUTLIVES THE OFFER — the window is cut to the day after
 * `valid_until`, which is the rule the real function owns and the reason
 * issuing an elapsed offer is refused rather than merely unhelpful.
 *
 * Demo mode stores NO token and no hash: there is no portal to open, and a demo
 * that kept the raw value would be modelling the one thing the real table
 * exists to prevent.
 */
const mintToken = async (
  dataProvider: DataProvider,
  quote: Quote,
  version: QuoteVersion,
  options: { tokenDays?: number; tokenLabel?: string | null },
  salesId: Identifier | null | undefined,
): Promise<QuoteLink> => {
  const days = options.tokenDays ?? DEFAULT_TOKEN_DAYS;
  const requested = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const clamp =
    version.valid_until == null
      ? null
      : new Date(`${version.valid_until.slice(0, 10)}T00:00:00.000Z`);
  if (clamp) clamp.setUTCDate(clamp.getUTCDate() + 1);
  const expiresAt = clamp != null && clamp < requested ? clamp : requested;

  const { data: token } = await dataProvider.create("quote_access_tokens", {
    data: {
      quote_id: quote.id,
      version_id: version.id,
      label: options.tokenLabel ?? null,
      created_by: salesId ?? null,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: null,
      revoked_by: null,
      last_seen_at: null,
      view_count: 0,
    },
  });

  return {
    quote_id: quote.id,
    version_id: version.id,
    version_number: version.version_number,
    token_id: token.id,
    // 256 random bits, hex-encoded, exactly as the real token is shaped — and
    // kept nowhere, exactly as the real one is.
    token: randomToken(),
    expires_at: expiresAt.toISOString(),
  };
};

/** A demo token row: the permanent one keeps its raw token, as the real one does. */
type DemoToken = QuoteAccessToken & { token?: string | null };

/**
 * The quotation's live permanent link, token included. Listing the table goes
 * through the summary projection, which drops the raw token (as the real view
 * does), so the row is found there and read back by id.
 */
const permanentLinkOf = async (
  dataProvider: DataProvider,
  quoteId: Identifier,
): Promise<DemoToken | undefined> => {
  const row = (
    await listAll<DemoToken>(dataProvider, "quote_access_tokens")
  ).find(
    (candidate) =>
      sameId(candidate.quote_id, quoteId) &&
      candidate.is_permanent === true &&
      !candidate.revoked_at,
  );
  if (!row) return undefined;
  const { data } = await dataProvider.getOne<DemoToken>("quote_access_tokens", {
    id: row.id,
  });
  return data;
};

const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/**
 * `ensure_quote_share_link()`: the quotation's permanent link — the live one,
 * or a new one. `version` is the newest issued version, the one it opens.
 */
const ensureShareLink = async (
  dataProvider: DataProvider,
  quote: Quote,
  version: QuoteVersion,
  salesId: Identifier | null | undefined,
): Promise<QuoteLink> => {
  let permanent = await permanentLinkOf(dataProvider, quote.id);

  if (!permanent) {
    const { data } = await dataProvider.create<DemoToken>(
      "quote_access_tokens",
      {
        data: {
          quote_id: quote.id,
          version_id: version.id,
          token: randomToken(),
          label: null,
          created_by: salesId ?? null,
          created_at: new Date().toISOString(),
          expires_at: null,
          revoked_at: null,
          revoked_by: null,
          last_seen_at: null,
          view_count: 0,
        },
      },
    );
    permanent = data;
  }

  return {
    quote_id: quote.id,
    version_id: version.id,
    version_number: version.version_number,
    token_id: permanent.id,
    token: permanent.token ?? "",
    expires_at: null,
    is_permanent: true,
  };
};

/**
 * `quote_access_tokens_summary`: the token columns without the hash — and
 * without the permanent link's raw token, which only `getQuoteShareLink`
 * reads — plus whether the link still opens and whether it is the permanent one.
 */
export const decorateQuoteTokens = (tokens: DemoToken[]): QuoteAccessToken[] =>
  tokens.map(({ token, ...row }) => ({
    ...row,
    is_active:
      row.revoked_at == null &&
      (row.expires_at == null ||
        new Date(row.expires_at).getTime() > Date.now()),
    is_permanent: token != null,
  }));

/**
 * `getDataProvider` is a thunk, not the provider itself: these methods are
 * spread into the object that BECOMES the provider, so the decorated one — the
 * one carrying the line triggers a cloned line has to go through — does not
 * exist yet at the moment this is called.
 */
export const createDemoQuoteMethods = (
  getDataProvider: () => DataProvider,
  getSalesId: () => Promise<Identifier | null>,
): QuoteMethods => ({
  getQuoteDiscountGate: async (quoteId) =>
    computeQuoteDiscountGate(getDataProvider(), quoteId, await getSalesId()),

  transitionQuote: async (quoteId, toStatus, options = {}) => {
    const dataProvider = getDataProvider();
    const salesId = await getSalesId();

    // Approving is what raises the discount ceiling at issue time, so it is the
    // one internal move an owner may not make: a rep approving their own quote
    // would be a rep setting their own limit.
    if (toStatus === "approved") {
      const role = await roleOf(dataProvider, salesId);
      if (role !== "manager" && role !== "admin") {
        refuse(
          QUOTE_ERROR.approvalRequiresManager,
          `Only a manager may approve quote ${quoteId}`,
        );
      }
    }

    return applyQuoteStatus(dataProvider, quoteId, toStatus, {
      reason: options.reason,
      actorKind: "internal",
      salesId,
    });
  },

  issueQuoteVersion: async (quoteId, options = {}) => {
    const dataProvider = getDataProvider();
    const salesId = await getSalesId();
    const quote = await quoteOf(dataProvider, quoteId);
    const versions = await versionsOf(dataProvider, quoteId);
    const draft = versions.find((version) => version.issued_at == null);

    if (!draft) {
      refuse(QUOTE_ERROR.noDraft, `Quote ${quoteId} has no draft to issue`);
    }

    // An empty document is not a quotation. Caught here rather than by the
    // customer.
    if ((await linesOf(dataProvider, draft.id)).length === 0) {
      refuse(QUOTE_ERROR.empty, `Quote ${quoteId} has no lines to issue`);
    }

    // An offer that has already lapsed cannot be sent: the link would be
    // clamped to a date in the past and dead on arrival (§13.6 #12).
    if (hasElapsed(draft.valid_until)) {
      refuse(
        QUOTE_ERROR.validityElapsed,
        `The offer in quote ${quoteId} expired on ${draft.valid_until}`,
      );
    }

    const gate = await computeQuoteDiscountGate(dataProvider, quoteId, salesId);
    let override = options.overrideReason?.trim() || null;

    if (!gate.ok) {
      // Only an admin overrides, and only in writing. A manager may issue
      // anybody's quote, but not past the rule.
      const role = await roleOf(dataProvider, salesId);
      if (override == null || role !== "admin") {
        refuse(
          QUOTE_ERROR.discountExceedsLimit,
          `Quote ${quoteId} grants ${gate.effective_discount_percent}% discount, above the ${gate.max_allowed}% allowed`,
          gate,
        );
      }
    } else {
      // The gate was satisfied, so nothing was overridden.
      override = null;
      if (gate.reason_required && !options.reason?.trim()) {
        refuse(
          QUOTE_ERROR.discountReasonRequired,
          `Quote ${quoteId} grants ${gate.effective_discount_percent}% discount, above the ${gate.requires_reason_above}% that needs a written reason`,
          gate,
        );
      }
    }

    // The previous document stops being current.
    for (const previous of versions.filter(
      (version) => version.issued_at != null && version.superseded_at == null,
    )) {
      await dataProvider.update("quote_versions", {
        id: previous.id,
        data: { superseded_at: new Date().toISOString() },
        previousData: previous,
      });
    }

    const totalled = await refreshTotals(dataProvider, draft);
    const { data: issued } = await dataProvider.update<QuoteVersion>(
      "quote_versions",
      {
        id: draft.id,
        data: {
          issued_at: new Date().toISOString(),
          issued_by: salesId ?? null,
          party_snapshot: await partySnapshotOf(dataProvider, quote),
        },
        previousData: totalled,
      },
    );

    const link = await ensureShareLink(dataProvider, quote, issued, salesId);

    await applyQuoteStatus(dataProvider, quoteId, "sent", {
      reason: options.reason,
      actorKind: "internal",
      salesId,
      overrideReason: override,
    });

    return link;
  },

  createQuoteLink: async (quoteId, options = {}) => {
    const dataProvider = getDataProvider();
    const salesId = await getSalesId();
    const quote = await quoteOf(dataProvider, quoteId);
    const versions = await versionsOf(dataProvider, quoteId);
    const live = versions.find(
      (version) => version.issued_at != null && version.superseded_at == null,
    );

    if (!live) {
      refuse(
        QUOTE_ERROR.notIssued,
        `Quote ${quoteId} has no issued version to link to`,
      );
    }

    // Refused while a revision is open: `revise_quote()` revoked the links to
    // the version it replaces precisely so nobody accepts it, and a fresh link
    // would reopen that door.
    if (versions.some((version) => version.issued_at == null)) {
      refuse(
        QUOTE_ERROR.draftExists,
        `Quote ${quoteId} has an open revision: issue it instead`,
      );
    }

    if (hasElapsed(live.valid_until)) {
      refuse(
        QUOTE_ERROR.validityElapsed,
        `The offer in quote ${quoteId} expired on ${live.valid_until}`,
      );
    }

    return mintToken(dataProvider, quote, live, options, salesId);
  },

  getQuoteShareLink: async (quoteId, options = {}) => {
    const dataProvider = getDataProvider();
    const quote = await quoteOf(dataProvider, quoteId);
    const live = (await versionsOf(dataProvider, quoteId)).find(
      (version) => version.issued_at != null,
    );
    const hasLink = (await permanentLinkOf(dataProvider, quoteId)) != null;

    // Reading never writes.
    if (!options.create && (!live || !hasLink)) return null;
    if (!live) {
      refuse(
        QUOTE_ERROR.notIssued,
        `Quote ${quoteId} has no issued version to link to`,
      );
    }
    return ensureShareLink(dataProvider, quote, live, await getSalesId());
  },

  reviseQuote: async (quoteId, reason) => {
    const dataProvider = getDataProvider();
    const salesId = await getSalesId();

    // A revision without a stated motive leaves the version chain legible and
    // the reason for it lost, which is half an audit trail.
    if (!reason?.trim()) {
      refuse(
        QUOTE_ERROR.reasonRequired,
        "A reason is required to revise a quote",
      );
    }

    const versions = await versionsOf(dataProvider, quoteId);

    if (versions.some((version) => version.issued_at == null)) {
      refuse(
        QUOTE_ERROR.draftExists,
        `Quote ${quoteId} already has an editable draft`,
      );
    }

    const last = versions.find((version) => version.issued_at != null);
    if (!last) {
      refuse(
        QUOTE_ERROR.notIssued,
        `Quote ${quoteId} has no issued version to revise`,
      );
    }

    // The status moves FIRST: lines may only be written while the quote is a
    // draft, and the clone below writes lines. It also means an illegal
    // revision — of an accepted quote, say — is refused before anything has
    // been copied.
    await applyQuoteStatus(dataProvider, quoteId, "draft", {
      reason,
      actorKind: "internal",
      salesId,
    });

    const { data: draft } = await dataProvider.create<QuoteVersion>(
      "quote_versions",
      {
        data: {
          quote_id: quoteId,
          currency: last.currency,
          version_number: last.version_number + 1,
          issued_at: null,
          valid_until: last.valid_until ?? null,
          terms: last.terms ?? null,
          discount_percent: last.discount_percent ?? null,
          subtotal: last.subtotal,
          discount_total: last.discount_total,
          tax_total: last.tax_total,
          total: last.total,
        },
      },
    );

    // Copied in document order, and the source line's id is dropped: the clone
    // is a new row, not the same line pointed at twice.
    const lines = (await linesOf(dataProvider, last.id)).sort(
      (a, b) => a.position - b.position,
    );
    for (const line of lines) {
      const { id: _dropped, ...columns } = line;
      await dataProvider.create("quote_lines", {
        data: { ...columns, version_id: draft.id, quote_id: quoteId },
      });
    }

    // The quotation's link is NOT revoked: it keeps showing the last issued
    // document, which cannot be answered while the quote is a draft.
    return draft;
  },

  revokeQuoteToken: async (tokenId) => {
    const dataProvider = getDataProvider();
    const salesId = await getSalesId();
    const token = (
      await listAll<QuoteAccessToken>(dataProvider, "quote_access_tokens")
    ).find((row) => sameId(row.id, tokenId));

    // Idempotent: revoking twice is not an error, and re-stamping the date
    // would rewrite when the link actually stopped working.
    if (!token || token.revoked_at != null) return;

    await dataProvider.update("quote_access_tokens", {
      id: tokenId,
      data: {
        revoked_at: new Date().toISOString(),
        revoked_by: salesId ?? null,
      },
      previousData: token,
    });
  },

  /**
   * `mark_quote_comments_read()`. The write goes through the `quote_comments`
   * callbacks like any other, and the read mark is the one change they let a
   * customer comment take.
   */
  markQuoteCommentsRead: async (quoteId) => {
    const dataProvider = getDataProvider();
    await quoteOf(dataProvider, quoteId);
    const unread = (
      await listAll<QuoteComment>(dataProvider, "quote_comments")
    ).filter(
      (comment) =>
        sameId(comment.quote_id, quoteId) &&
        comment.author_kind === "customer" &&
        comment.read_by_internal_at == null &&
        comment.deleted_at == null,
    );
    const readAt = new Date().toISOString();
    for (const comment of unread) {
      await dataProvider.update("quote_comments", {
        id: comment.id,
        data: { read_by_internal_at: readAt },
        previousData: comment,
      });
    }
    return unread.length;
  },
});
