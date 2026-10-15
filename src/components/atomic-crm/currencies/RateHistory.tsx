import { useGetList, useGetMany, useLocaleState, useTranslate } from "ra-core";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import type { ExchangeRate, Sale } from "../types";
import { ToneBadge } from "./FxBadges";
import { formatDay, formatInstant, formatRate } from "./fxFormat";
import { RateEvolutionChart } from "./RateEvolutionChart";
import { useCurrencies, useRateProviders } from "./useFx";

const ALL = "__all";
const MANUAL = "__manual";
const MAX_ROWS = 1000;

type Filters = {
  currency: string;
  from: string;
  to: string;
  source: string;
  kind: string;
};

/**
 * Every rate ever stored -- the table is append-only, so this IS the history:
 * source and target currency, rate, the day it applies from, when it was
 * fetched, where it came from, its type and who typed it. Filtered by
 * currency, dates, source and type; the chart follows the chosen currency.
 */
export const RateHistory = () => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const { currencies, base } = useCurrencies();
  const { providers } = useRateProviders();
  const [filters, setFilters] = useState<Filters>({
    currency: ALL,
    from: "",
    to: "",
    source: ALL,
    kind: ALL,
  });

  const filter: Record<string, unknown> = {};
  if (filters.currency !== ALL) filter["currency_code@eq"] = filters.currency;
  if (filters.from) filter["effective_date@gte"] = filters.from;
  if (filters.to) filter["effective_date@lte"] = filters.to;
  if (filters.kind !== ALL) filter["kind@eq"] = filters.kind;
  if (filters.source !== ALL && filters.source !== MANUAL) {
    filter["provider_id@eq"] = filters.source;
  }

  const { data = [], total } = useGetList<ExchangeRate>("exchange_rates", {
    pagination: { page: 1, perPage: MAX_ROWS },
    sort: { field: "effective_date", order: "DESC" },
    filter,
  });
  // "Manual" is the absence of a provider; filtered here rather than through
  // an `is null` operator both data providers would have to agree on.
  const rows =
    filters.source === MANUAL
      ? data.filter((rate) => rate.provider_id == null)
      : data;

  const authorIds = [
    ...new Set(
      rows
        .map((rate) => rate.created_by)
        .filter((id): id is NonNullable<typeof id> => id != null),
    ),
  ];
  const { data: authors = [] } = useGetMany<Sale>("sales", {
    ids: authorIds,
  });
  const authorOf = (id: ExchangeRate["created_by"]) => {
    const sale = authors.find((row) => String(row.id) === String(id));
    return sale ? `${sale.first_name} ${sale.last_name}` : "—";
  };
  const providerOf = (rate: ExchangeRate) =>
    rate.provider_id == null
      ? translate("crm.fx.history.manual")
      : (providers.find((p) => String(p.id) === String(rate.provider_id))
          ?.name ?? String(rate.provider_id));

  const set = (key: keyof Filters, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={translate("crm.fx.tabs.history")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            id="fx-history-currency"
            label={translate("crm.fx.history.currency")}
            value={filters.currency}
            onChange={(value) => set("currency", value)}
            options={[
              { value: ALL, label: translate("crm.fx.history.all") },
              ...currencies
                .filter((currency) => !currency.is_base)
                .map((currency) => ({
                  value: currency.code,
                  label: `${currency.code} · ${currency.name}`,
                })),
            ]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="fx-history-from">
              {translate("crm.fx.history.from")}
            </Label>
            <Input
              id="fx-history-from"
              type="date"
              value={filters.from}
              onChange={(event) => set("from", event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fx-history-to">
              {translate("crm.fx.history.to")}
            </Label>
            <Input
              id="fx-history-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => set("to", event.target.value)}
            />
          </div>
          <FilterSelect
            id="fx-history-source"
            label={translate("crm.fx.history.provider")}
            value={filters.source}
            onChange={(value) => set("source", value)}
            options={[
              { value: ALL, label: translate("crm.fx.history.all") },
              ...providers.map((provider) => ({
                value: String(provider.id),
                label: provider.name,
              })),
              { value: MANUAL, label: translate("crm.fx.history.manual") },
            ]}
          />
          <FilterSelect
            id="fx-history-kind"
            label={translate("crm.fx.history.kind")}
            value={filters.kind}
            onChange={(value) => set("kind", value)}
            options={[
              { value: ALL, label: translate("crm.fx.history.all") },
              { value: "official", label: translate("crm.fx.kinds.official") },
              {
                value: "commercial",
                label: translate("crm.fx.kinds.commercial"),
              },
            ]}
          />
        </div>
      </SectionCard>

      {filters.currency !== ALL ? (
        <RateEvolutionChart
          currency={filters.currency}
          base={base?.code ?? ""}
          rates={rows}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate("crm.fx.history.chart_pick")}
        </p>
      )}

      <SectionCard
        title={translate("crm.fx.history.rate")}
        subtitle={
          total != null && total > MAX_ROWS
            ? `${MAX_ROWS} / ${total}`
            : undefined
        }
        contentClassName="p-0"
      >
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {translate("crm.fx.history.empty")}
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate("crm.fx.history.currency")}</TableHead>
                  <TableHead className="text-right">
                    {translate("crm.fx.history.rate")}
                  </TableHead>
                  <TableHead>{translate("crm.fx.history.effective")}</TableHead>
                  <TableHead>{translate("crm.fx.history.fetched")}</TableHead>
                  <TableHead>{translate("crm.fx.history.provider")}</TableHead>
                  <TableHead>{translate("crm.fx.history.kind")}</TableHead>
                  <TableHead>{translate("crm.fx.history.author")}</TableHead>
                  <TableHead>{translate("crm.fx.history.note")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {rate.currency_code} → {rate.base_currency_code}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(rate.rate, locale)}
                      {rate.derived_via ? (
                        <div className="text-xs text-muted-foreground">
                          {translate("crm.fx.history.derived", {
                            currency: rate.derived_via,
                          })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDay(rate.effective_date, locale)}
                      {rate.valid_until &&
                      rate.valid_until !== rate.effective_date ? (
                        <div className="text-xs text-muted-foreground">
                          {translate("crm.fx.rates.valid_until", {
                            date: formatDay(rate.valid_until, locale),
                          })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatInstant(rate.fetched_at, locale)}
                    </TableCell>
                    <TableCell>{providerOf(rate)}</TableCell>
                    <TableCell>
                      <ToneBadge tone="neutral">
                        {translate(`crm.fx.kinds.${rate.kind}`)}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {rate.created_by != null
                        ? authorOf(rate.created_by)
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {rate.note ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

const FilterSelect = ({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
