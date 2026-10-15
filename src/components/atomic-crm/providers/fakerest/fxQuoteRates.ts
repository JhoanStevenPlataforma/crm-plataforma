/**
 * Currencies & exchange rates, the QUOTATION side of the demo backend
 * (docs/proposals/multi-currency-fx.md §4).
 *
 * The mirror of `fx_line_source_rate()`, `quote_lines_fx_convert`,
 * `set_quote_version_rate()` and the rate gate of `issue_quote_version()`.
 * Same rules, same refusal keys, so a screen behaves the same against either
 * backend:
 *
 *   * one observation per source currency per version, recorded on the line;
 *   * a line resolves on the version's rate day, never a later one;
 *   * the rate a line converts at is the backend's, never the client's: only
 *     the re-pricing and the revision write it, through `withLineRateHatch`;
 *   * one staleness rule (`rateIsStale` in `fxMath.ts`) for the version's rate
 *     and for every line's.
 */

import type { DataProvider, Identifier } from "ra-core";

import { convertPrice } from "../../currencies/fxMath";
import type {
  ExchangeRate,
  FxRateKind,
  LineSourceRate,
  Quote,
  QuoteLine,
  QuoteRateKind,
  QuoteVersion,
} from "../../types";
import { QUOTE_ERROR } from "../commons/quoteRpc";
import {
  baseOf,
  decimalsOf,
  listAll,
  loadContext,
  refuse,
  resolveRate,
  staleIn,
  today,
} from "./fx";

const sameId = (
  a: Identifier | null | undefined,
  b: Identifier | null | undefined,
) => a != null && b != null && String(a) === String(b);

/**
 * `app.fx_line_rate_write`: the version whose lines the backend itself is
 * writing rates for. JavaScript runs one write at a time, so a module-level
 * slot is the transaction-local setting's honest equivalent.
 */
let lineRateHatch: Identifier | null = null;

const withLineRateHatch = async <T>(
  versionId: Identifier,
  write: () => Promise<T>,
): Promise<T> => {
  lineRateHatch = versionId;
  try {
    return await write();
  } finally {
    lineRateHatch = null;
  }
};

const versionOf = async (
  dataProvider: DataProvider,
  versionId: Identifier | null | undefined,
): Promise<QuoteVersion | undefined> =>
  versionId == null
    ? undefined
    : (
        await listAll<QuoteVersion>(dataProvider, "quote_versions", {
          id: versionId,
        })
      )[0];

/** `fx_line_source_rate()`: what a line in `currency` converts at, and from which row. */
export const lineSourceRate = async (
  dataProvider: DataProvider,
  versionId: Identifier,
  currency: string,
  reuse = true,
): Promise<LineSourceRate | null> => {
  const version = await versionOf(dataProvider, versionId);
  if (!version || !currency || currency === version.currency) return null;

  const context = await loadContext(dataProvider);
  if (currency === (version.base_currency ?? baseOf(context))) {
    return {
      rate: 1,
      exchange_rate_id: null,
      kind: "base",
      effective_date: null,
      valid_until: null,
      is_stale: false,
    };
  }

  if (reuse) {
    const [carried] = (
      await listAll<QuoteLine>(dataProvider, "quote_lines", {
        version_id: versionId,
      })
    )
      .filter(
        (line) =>
          line.source_currency === currency &&
          line.source_exchange_rate != null,
      )
      .sort((a, b) => Number(a.id) - Number(b.id));
    if (carried) {
      const row = context.rates.find((rate) =>
        sameId(rate.id, carried.source_exchange_rate_id),
      );
      return {
        rate: Number(carried.source_exchange_rate),
        exchange_rate_id: carried.source_exchange_rate_id ?? null,
        kind: row?.kind ?? null,
        effective_date: row?.effective_date ?? null,
        valid_until: row?.valid_until ?? null,
        // A rate carried with no recorded observation cannot be vouched for.
        is_stale: row
          ? staleIn(context, row.kind, row.effective_date, row.valid_until)
          : true,
      };
    }
  }

  const kind: FxRateKind =
    version.rate_kind === "official" || version.rate_kind === "commercial"
      ? version.rate_kind
      : context.settings.quote_rate_kind_default;
  const asOf =
    version.rate_kind === "official"
      ? version.rate_effective_date
      : (version.rate_set_at?.slice(0, 10) ?? null);
  const resolved = resolveRate(context, currency, kind, asOf ?? today());
  if (!resolved) return null;
  return {
    rate: resolved.rate,
    exchange_rate_id: resolved.exchange_rate_id,
    kind: resolved.kind,
    effective_date: resolved.effective_date,
    valid_until: resolved.valid_until,
    is_stale: staleIn(
      context,
      resolved.kind,
      resolved.effective_date,
      resolved.valid_until,
    ),
  };
};

/**
 * `quote_lines_fx_convert`: a converted price, and the rate it is converted
 * at, are the backend's. `previous` is the stored row on an update: a line
 * keeps its observation while its source currency stays.
 */
export const convertLine = async (
  dataProvider: DataProvider,
  line: Partial<QuoteLine>,
  previous?: QuoteLine,
): Promise<Partial<QuoteLine>> => {
  if (line.source_currency == null) {
    return {
      ...line,
      source_unit_price: null,
      source_exchange_rate: null,
      source_exchange_rate_id: null,
    };
  }
  const version = await versionOf(dataProvider, line.version_id);
  if (!version) return line;

  if (line.source_currency === version.currency) {
    return {
      ...line,
      source_exchange_rate: null,
      source_exchange_rate_id: null,
      unit_price: Number(line.source_unit_price ?? 0),
    };
  }
  if (version.exchange_rate == null) {
    refuse(
      QUOTE_ERROR.fxRateMissing,
      `Quote version ${version.id} has no exchange rate for ${version.currency}`,
    );
  }

  let rate: number;
  let rateId: Identifier | null;
  if (
    sameId(lineRateHatch, line.version_id) &&
    line.source_exchange_rate != null
  ) {
    rate = Number(line.source_exchange_rate);
    rateId = line.source_exchange_rate_id ?? null;
  } else if (
    previous &&
    previous.source_currency === line.source_currency &&
    previous.source_exchange_rate != null
  ) {
    rate = Number(previous.source_exchange_rate);
    rateId = previous.source_exchange_rate_id ?? null;
  } else {
    const resolved = await lineSourceRate(
      dataProvider,
      version.id,
      line.source_currency,
    );
    if (!resolved) {
      refuse(
        QUOTE_ERROR.fxRateMissing,
        `No exchange rate for ${line.source_currency} on or before the rate day of quote version ${version.id}`,
      );
    }
    rate = resolved.rate;
    rateId = resolved.exchange_rate_id;
  }

  const context = await loadContext(dataProvider);
  return {
    ...line,
    source_exchange_rate: rate,
    source_exchange_rate_id: rateId,
    unit_price: convertPrice(
      Number(line.source_unit_price ?? 0),
      rate,
      Number(version.exchange_rate),
      decimalsOf(context, version.currency),
    ),
  };
};

/** Copies a revision's lines with their observations (`revise_quote()`). */
export const copyLinesWithRates = (
  dataProvider: DataProvider,
  versionId: Identifier,
  lines: Partial<QuoteLine>[],
): Promise<void> =>
  withLineRateHatch(versionId, async () => {
    for (const line of lines) {
      await dataProvider.create("quote_lines", { data: line });
    }
  });

/** One fresh observation per source currency, written to every converted line. */
const repriceLines = async (
  dataProvider: DataProvider,
  version: QuoteVersion,
): Promise<void> => {
  const lines = (
    await listAll<QuoteLine>(dataProvider, "quote_lines", {
      version_id: version.id,
    })
  ).filter(
    (line) =>
      line.source_currency != null && line.source_currency !== version.currency,
  );
  const fresh = new Map<string, LineSourceRate>();
  for (const currency of new Set(
    lines.map((line) => line.source_currency as string),
  )) {
    const resolved = await lineSourceRate(
      dataProvider,
      version.id,
      currency,
      false,
    );
    if (!resolved) {
      refuse(
        QUOTE_ERROR.fxRateMissing,
        `No exchange rate is available for ${currency}`,
      );
    }
    fresh.set(currency, resolved);
  }
  await withLineRateHatch(version.id, async () => {
    for (const line of lines) {
      const resolved = fresh.get(line.source_currency as string)!;
      await dataProvider.update("quote_lines", {
        id: line.id,
        data: {
          source_exchange_rate: resolved.rate,
          source_exchange_rate_id: resolved.exchange_rate_id,
        },
        previousData: line,
      });
    }
  });
};

/** `set_quote_version_rate()`, demo-side. */
export const setDemoQuoteVersionRate = async (
  dataProvider: DataProvider,
  salesId: Identifier | null,
  role: string | null,
  versionId: Identifier,
  kind: QuoteRateKind,
  options: { rate?: number | null; reason?: string | null } = {},
): Promise<QuoteVersion> => {
  const { data: version } = await dataProvider.getOne<QuoteVersion>(
    "quote_versions",
    {
      id: versionId,
    },
  );
  const { data: quote } = await dataProvider.getOne<Quote>("quotes", {
    id: version.quote_id,
  });

  if (version.issued_at != null) {
    refuse(QUOTE_ERROR.versionFrozen, `Quote version ${versionId} is issued`);
  }
  if (quote.status_key !== "draft") {
    refuse(QUOTE_ERROR.notDraft, "The rate is editable only on a draft");
  }

  const context = await loadContext(dataProvider);
  const base = version.base_currency ?? baseOf(context);
  if (version.currency === base && kind !== "base") {
    refuse(QUOTE_ERROR.fxRateKindInvalid, "A base quotation has no rate");
  }
  if (version.currency !== base && kind === "base") {
    refuse(QUOTE_ERROR.fxRateKindInvalid, "Not in the base currency");
  }

  const reason = options.reason?.trim() || null;
  let fields: Partial<QuoteVersion>;

  if (kind === "base") {
    // Rate 1; "update to today's rate" re-prices the lines (below).
    fields = {
      rate_kind: "base",
      exchange_rate: 1,
      exchange_rate_id: null,
      rate_provider_key: null,
      rate_effective_date: today(),
      rate_reason: null,
    };
  } else if (kind === "custom") {
    const rate = Number(options.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      refuse(QUOTE_ERROR.fxRateInvalid, "A custom rate must be positive");
    }
    if (!reason) {
      refuse(QUOTE_ERROR.fxReasonRequired, "A custom rate needs a reason");
    }
    if (role !== "admin" && role !== "manager") {
      const tolerance = context.settings.rep_custom_rate_tolerance_percent;
      if (!tolerance) {
        refuse(
          QUOTE_ERROR.fxCustomRateForbidden,
          "Custom rates are reserved to managers and administrators",
        );
      }
      const official = resolveRate(context, version.currency, "official");
      if (!official || Math.abs(rate / official.rate - 1) * 100 > tolerance) {
        refuse(
          QUOTE_ERROR.fxCustomRateOutOfTolerance,
          `The custom rate is more than ${tolerance}% from the official rate`,
        );
      }
    }
    fields = {
      rate_kind: "custom",
      exchange_rate: Math.round(rate * 1e10) / 1e10,
      exchange_rate_id: null,
      rate_provider_key: null,
      rate_effective_date: today(),
      rate_reason: reason,
    };
  } else {
    const resolved = resolveRate(context, version.currency, kind);
    if (!resolved) {
      refuse(
        QUOTE_ERROR.fxRateMissing,
        `No exchange rate is available for ${version.currency}`,
      );
    }
    fields = {
      rate_kind: resolved.kind as QuoteRateKind,
      exchange_rate: resolved.rate,
      exchange_rate_id: resolved.exchange_rate_id,
      rate_provider_key: resolved.provider_key,
      rate_effective_date: resolved.effective_date,
      rate_reason: null,
    };
  }

  const { data: updated } = await dataProvider.update<QuoteVersion>(
    "quote_versions",
    {
      id: versionId,
      data: {
        ...fields,
        rate_set_at: new Date().toISOString(),
        rate_set_by: salesId,
      },
      previousData: version,
    },
  );

  // The line callbacks recompute the totals.
  await repriceLines(dataProvider, { ...version, ...updated });

  const { data: fresh } = await dataProvider.getOne<QuoteVersion>(
    "quote_versions",
    {
      id: versionId,
    },
  );
  return fresh ?? updated;
};

/**
 * The rate gate of `issue_quote_version()`: the version's own rate, then every
 * rate a line was converted at, by the one rule. True means "refuse".
 */
export const hasStaleRate = async (
  dataProvider: DataProvider,
  version: QuoteVersion,
): Promise<boolean> => {
  const context = await loadContext(dataProvider);
  const rowOf = (id: Identifier | null | undefined): ExchangeRate | undefined =>
    context.rates.find((rate) => sameId(rate.id, id));

  const versionRow = rowOf(version.exchange_rate_id);
  const versionStale = versionRow
    ? staleIn(
        context,
        version.rate_kind,
        versionRow.effective_date,
        versionRow.valid_until,
      )
    : staleIn(context, version.rate_kind, version.rate_effective_date, null);
  if (versionStale) return true;

  const base = version.base_currency ?? baseOf(context);
  const lines = await listAll<QuoteLine>(dataProvider, "quote_lines", {
    version_id: version.id,
  });
  return lines.some((line) => {
    if (line.source_exchange_rate == null || line.source_currency === base)
      return false;
    const row = rowOf(line.source_exchange_rate_id);
    return row
      ? staleIn(context, row.kind, row.effective_date, row.valid_until)
      : true;
  });
};
