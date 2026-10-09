import { useMutation } from "@tanstack/react-query";
import {
  useCanAccess,
  useDataProvider,
  useGetOne,
  useLocaleState,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
} from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ToneBadge } from "../currencies/FxBadges";
import { deviationPercent, rateIsStale } from "../currencies/fxMath";
import { formatDay, formatRate, serverToday } from "../currencies/fxFormat";
import { useCurrentRates, useFxSettings } from "../currencies/useFx";
import { RequiredReasonField } from "../misc/RequiredReasonField";
import { quoteErrorMessage } from "../providers/commons/quoteRpc";
import type { CrmDataProvider } from "../providers/types";
import type { ExchangeRate, QuoteRateKind, QuoteSummary } from "../types";
import { QuoteSourceRates } from "./QuoteSourceRates";
import { useQuoteDraft } from "./useQuoteDraft";

const DECIMAL = /^\d+([.,]\d{1,10})?$/;

/**
 * The exchange rate of the version being worked on
 * (docs/proposals/multi-currency-fx.md).
 *
 * The rate is the VERSION's: frozen with it at issue, so a later TRM never
 * changes a document a customer holds. On a draft the rep sees the rate in
 * use, its kind, source and date -- and is told when it is stale, which the
 * server refuses to issue -- and can switch to the official or commercial
 * rate in force today, or set a custom one. Who may set which, and how far, is
 * decided by `set_quote_version_rate()`; the panel only offers what the role
 * can plausibly do and renders the refusal key otherwise.
 */
export const QuoteExchangeRatePanel = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { version, lines, isEditable } = useQuoteDraft(quote);
  const { rates } = useCurrentRates();
  const { settings } = useFxSettings();
  const { canAccess: isManager } = useCanAccess({
    resource: "exchange_rates",
    action: "create",
  });
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  // The row the version's rate was read from: its own validity decides
  // staleness, by the one rule the server applies.
  const { data: versionRow } = useGetOne<ExchangeRate>(
    "exchange_rates",
    { id: version?.exchange_rate_id ?? "" },
    { enabled: version?.exchange_rate_id != null },
  );

  const setRate = useMutation({
    mutationFn: (input: {
      kind: QuoteRateKind;
      rate?: number;
      reason?: string;
    }) =>
      dataProvider.setQuoteVersionRate(version!.id, input.kind, {
        rate: input.rate ?? null,
        reason: input.reason ?? null,
      }),
    onSuccess: () => {
      notify("crm.fx.quote.saved");
      setIsCustomOpen(false);
      refresh();
    },
    onError: (error) => notify(quoteErrorMessage(error), { type: "error" }),
  });

  if (!quote || !version) return null;

  const base = version.base_currency ?? quote.base_currency ?? null;

  /**
   * "Update to today's rate" for the LINES: the same kind again, so the
   * server re-prices every converted line at one fresh observation per
   * currency. A custom rate is re-stated with its own figure and reason.
   */
  const refreshLines = () =>
    setRate.mutate(
      version.rate_kind === "custom"
        ? {
            kind: "custom",
            rate: Number(version.exchange_rate),
            reason: version.rate_reason ?? undefined,
          }
        : { kind: version.rate_kind ?? "official" },
    );

  const sourceRates = base ? (
    <QuoteSourceRates
      version={version}
      lines={lines}
      base={base}
      staleAfterDays={settings?.stale_after_days}
      isEditable={isEditable}
      isPending={setRate.isPending}
      onRefresh={refreshLines}
    />
  ) : null;

  if (!base || quote.currency === base) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {translate("crm.fx.quote.none_needed")}
        </p>
        {sourceRates}
      </div>
    );
  }

  const current = rates.find((rate) => rate.currency_code === quote.currency);
  const tolerance = Number(settings?.rep_custom_rate_tolerance_percent ?? 0);
  const canCustom = isManager === true || tolerance > 0;
  // `fx_rate_is_stale()`, the rule `issue_quote_version()` applies, on the
  // row the rate was read from (its validity), whatever its kind.
  const isStale =
    version.issued_at == null &&
    rateIsStale({
      kind: version.rate_kind,
      effectiveDate: versionRow?.effective_date ?? version.rate_effective_date,
      validUntil: versionRow ? versionRow.valid_until : null,
      on: serverToday(),
      staleAfterDays: settings?.stale_after_days,
    });
  const params = { currency: quote.currency, base };

  return (
    <section
      aria-label={translate("crm.fx.quote.title")}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium">
            {translate("crm.fx.quote.title")}
          </h3>
          {version.exchange_rate == null ? (
            <p className="text-sm text-destructive">
              {translate("crm.fx.quote.missing", { currency: quote.currency })}
            </p>
          ) : (
            <>
              <p className="text-lg font-semibold tabular-nums">
                {translate("crm.fx.quote.rate_line", {
                  ...params,
                  rate: formatRate(version.exchange_rate, locale),
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate("crm.fx.quote.kind_source", {
                  kind: translate(`crm.fx.kinds.${version.rate_kind}`),
                  source:
                    version.rate_kind === "custom"
                      ? (version.rate_reason ?? "")
                      : current?.official_provider_name &&
                          version.rate_kind === "official"
                        ? current.official_provider_name
                        : translate("crm.fx.rates.manual"),
                })}
                {" · "}
                {translate("crm.fx.quote.effective", {
                  date: formatDay(version.rate_effective_date, locale),
                })}
              </p>
            </>
          )}
        </div>
        {version.issued_at != null ? (
          <ToneBadge tone="neutral">
            {translate("crm.fx.quote.frozen")}
          </ToneBadge>
        ) : isStale ? (
          <ToneBadge tone="warn">{translate("crm.fx.status.stale")}</ToneBadge>
        ) : null}
      </div>

      {isStale && version.issued_at == null ? (
        <p className="rounded-md bg-warning-tint px-3 py-2 text-xs text-warning">
          {translate("crm.fx.quote.stale", {
            date: formatDay(version.rate_effective_date, locale),
          })}
        </p>
      ) : null}

      {isEditable ? (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {current?.official_rate != null ? (
              <span>
                {translate("crm.fx.quote.official_now", {
                  rate: formatRate(current.official_rate, locale),
                  date: formatDay(current.official_effective_date, locale),
                })}
              </span>
            ) : null}
            {current?.commercial_rate != null ? (
              <span>
                {translate("crm.fx.quote.commercial_now", {
                  rate: formatRate(current.commercial_rate, locale),
                })}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={setRate.isPending || current?.official_rate == null}
              onClick={() => setRate.mutate({ kind: "official" })}
            >
              {version.rate_kind === "official"
                ? translate("crm.fx.quote.refresh")
                : translate("crm.fx.quote.use_official")}
            </Button>
            {current?.commercial_rate != null ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setRate.isPending}
                onClick={() => setRate.mutate({ kind: "commercial" })}
              >
                {translate("crm.fx.quote.use_commercial")}
              </Button>
            ) : null}
            {canCustom ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={setRate.isPending}
                onClick={() => setIsCustomOpen(true)}
              >
                {translate("crm.fx.quote.custom")}
              </Button>
            ) : (
              <span className="self-center text-xs text-muted-foreground">
                {translate("crm.fx.quote.custom_forbidden")}
              </span>
            )}
          </div>
        </>
      ) : null}

      {sourceRates}

      <CustomRateDialog
        open={isCustomOpen}
        currency={quote.currency}
        base={base}
        official={current?.official_rate ?? null}
        officialDate={current?.official_effective_date ?? null}
        tolerance={isManager ? null : tolerance}
        isPending={setRate.isPending}
        onCancel={() => setIsCustomOpen(false)}
        onConfirm={(rate, reason) =>
          setRate.mutate({ kind: "custom", rate, reason })
        }
      />
    </section>
  );
};

const CustomRateDialog = ({
  open,
  currency,
  base,
  official,
  officialDate,
  tolerance,
  isPending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  currency: string;
  base: string;
  official: number | null;
  officialDate: string | null;
  /** The rep's limit; null for a manager or admin. */
  tolerance: number | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (rate: number, reason: string) => void;
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setValue("");
      setReason("");
    }
  }, [open]);

  const parsed = Number(value.replace(",", "."));
  const isRateValid = DECIMAL.test(value.trim()) && parsed > 0;
  const deviation =
    isRateValid && official != null
      ? deviationPercent(parsed, Number(official))
      : null;
  const isWithinTolerance =
    tolerance == null || (deviation != null && deviation <= tolerance);
  const isValid = isRateValid && reason.trim() !== "" && isWithinTolerance;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("crm.fx.quote.custom_title")}</DialogTitle>
          <DialogDescription>
            {translate("crm.fx.quote.custom_help")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="quote-custom-rate">
              {translate("crm.fx.quote.custom_rate", { currency, base })}
            </Label>
            <Input
              id="quote-custom-rate"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {official != null ? (
              <span
                className={
                  isWithinTolerance
                    ? "text-xs text-muted-foreground"
                    : "text-xs text-destructive"
                }
              >
                {translate("crm.fx.quote.official_now", {
                  rate: formatRate(official, locale),
                  date: officialDate ? formatDay(officialDate, locale) : "—",
                })}
                {deviation != null
                  ? ` · ${translate("crm.fx.manual.deviation", {
                      percent: deviation.toLocaleString(locale, {
                        maximumFractionDigits: 2,
                      }),
                    })}`
                  : null}
              </span>
            ) : null}
            {tolerance != null ? (
              <span className="text-xs text-muted-foreground">
                {translate("crm.fx.quote.custom_tolerance", {
                  percent: tolerance,
                })}
              </span>
            ) : null}
          </div>
          <RequiredReasonField
            id="quote-custom-reason"
            label={translate("crm.fx.quote.custom_reason")}
            value={reason}
            rows={3}
            onChange={setReason}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={onCancel}>
            {translate("ra.action.cancel")}
          </Button>
          <Button
            disabled={!isValid || isPending}
            onClick={() => onConfirm(parsed, reason.trim())}
          >
            {translate("ra.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
