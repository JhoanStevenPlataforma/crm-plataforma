import { ChevronDown } from "lucide-react";
import { useGetList, useLocaleState, useTranslate } from "ra-core";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import type { ExchangeRateProvider, ExchangeRateSyncRun } from "../types";
import { RunStatusBadge } from "./FxBadges";
import { formatInstant } from "./fxFormat";

const duration = (run: ExchangeRateSyncRun) => {
  if (!run.finished_at) return "—";
  const seconds =
    (Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000;
  return seconds < 60
    ? `${seconds.toFixed(1)} s`
    : `${Math.round(seconds / 60)} min`;
};

/** The last twenty runs, collapsed by default: the cards above summarise them. */
export const FxSyncRuns = ({
  providers,
}: {
  providers: Pick<ExchangeRateProvider, "id" | "name">[];
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const [open, setOpen] = useState(false);
  const { data: runs = [] } = useGetList<ExchangeRateSyncRun>(
    "exchange_rate_sync_runs",
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "started_at", order: "DESC" },
    },
    { enabled: open },
  );
  const nameOf = (id: ExchangeRateSyncRun["provider_id"]) =>
    providers.find((provider) => String(provider.id) === String(id))?.name ??
    String(id);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SectionCard
        title={translate("crm.fx.health.runs")}
        contentClassName="p-0"
        action={
          <CollapsibleTrigger
            aria-label={translate("crm.fx.health.runs")}
            className="rounded p-1 hover:bg-muted"
          >
            <ChevronDown
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          {runs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {translate("crm.fx.health.no_runs")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {translate("crm.fx.health.run_started")}
                    </TableHead>
                    <TableHead>
                      {translate("crm.fx.health.run_provider")}
                    </TableHead>
                    <TableHead>
                      {translate("crm.fx.health.run_trigger")}
                    </TableHead>
                    <TableHead>{translate("crm.fx.rates.state")}</TableHead>
                    <TableHead className="text-right">
                      {translate("crm.fx.health.run_duration")}
                    </TableHead>
                    <TableHead className="text-right">
                      {translate("crm.fx.health.run_attempts")}
                    </TableHead>
                    <TableHead className="text-right">
                      {translate("crm.fx.health.run_rates")}
                    </TableHead>
                    <TableHead>
                      {translate("crm.fx.health.run_error")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatInstant(run.started_at, locale)}
                      </TableCell>
                      <TableCell>{nameOf(run.provider_id)}</TableCell>
                      <TableCell>
                        {translate(
                          `crm.fx.health.triggers.${run.triggered_by}`,
                        )}
                      </TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {duration(run)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.attempts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {run.rates_inserted}/{run.rates_received}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {run.error ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </SectionCard>
    </Collapsible>
  );
};
