/**
 * The refusals of the currency RPCs (docs/proposals/multi-currency-fx.md),
 * matched on the key the database puts in the exception's DETAIL -- never on
 * the message (the rule `quoteRpc.ts` states). Every key here is asserted as
 * `sqlstate:detail` in `fx_rates.test.sql` / `fx_quotes.test.sql`.
 *
 * The keys raised on the QUOTATION path (`set_quote_version_rate()`,
 * `issue_quote_version()`) live in `QUOTE_ERROR`, because those RPCs are quote
 * methods and their refusals are rendered by the quote screens.
 */

export const FX_ERROR = {
  /** The caller's role may not do this. */
  forbidden: "fx_forbidden",
  /** Rates or foreign quotations exist: the base cannot move. */
  baseLocked: "fx_base_locked",
  /** `is_base` posted instead of `set_base_currency()`. */
  baseViaFunction: "fx_base_via_function",
  baseMustBeActive: "fx_base_must_be_active",
  currencyCodeImmutable: "fx_currency_code_immutable",
  currencyInactive: "fx_currency_inactive",
  /** A provider's sync status or secret reference was posted. */
  columnProtected: "fx_column_protected",
  providerUnknown: "fx_provider_unknown",
} as const;

export type FxErrorKey = (typeof FX_ERROR)[keyof typeof FX_ERROR];

const KNOWN_KEYS = new Set<string>(Object.values(FX_ERROR));

export class FxRpcError extends Error {
  readonly key: FxErrorKey | null;

  constructor(message: string, key: FxErrorKey | null) {
    super(message);
    this.name = "FxRpcError";
    this.key = key;
  }
}

type PostgrestLikeError = {
  message?: string | null;
  details?: string | null;
};

export const fxRpcError = (
  error: PostgrestLikeError | null | undefined,
  fallbackMessage: string,
): FxRpcError => {
  const details = error?.details ?? "";
  const message = error?.message ?? "";
  const key =
    (KNOWN_KEYS.has(details) ? (details as FxErrorKey) : null) ??
    ([...KNOWN_KEYS].find((candidate) => message.includes(candidate)) as
      | FxErrorKey
      | undefined) ??
    null;
  return new FxRpcError(message || fallbackMessage, key);
};

/** The translation key for a refusal, or the generic sentence. */
export const fxErrorMessage = (error: unknown): string => {
  if (error instanceof FxRpcError && error.key) {
    return `crm.fx.errors.${error.key}`;
  }
  // A plain write refused by a guard trigger arrives as an ordinary error
  // whose body still carries the key.
  const details = (error as { body?: { details?: string } } | null)?.body
    ?.details;
  if (details && KNOWN_KEYS.has(details)) {
    return `crm.fx.errors.${details}`;
  }
  return "crm.fx.errors.generic";
};
