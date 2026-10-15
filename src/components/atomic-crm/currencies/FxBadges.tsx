import { useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { FxProviderStatus } from "../types";

/**
 * Status colours are semantic, never the brand accent (ui-redesign.md):
 * success, warning, destructive, and a neutral outline for "off".
 */
const TONE = {
  good: "border-transparent bg-success-tint text-success",
  warn: "border-transparent bg-warning-tint text-warning",
  bad: "border-transparent bg-destructive/10 text-destructive",
  neutral: "text-muted-foreground",
} as const;

type Tone = keyof typeof TONE;

export const ToneBadge = ({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) => (
  <Badge variant="outline" className={cn(TONE[tone], className)}>
    {children}
  </Badge>
);

const PROVIDER_TONE: Record<FxProviderStatus, Tone> = {
  operational: "good",
  degraded: "warn",
  down: "bad",
  disabled: "neutral",
};

export const ProviderStatusBadge = ({
  status,
}: {
  status: FxProviderStatus;
}) => {
  const translate = useTranslate();
  return (
    <ToneBadge tone={PROVIDER_TONE[status]}>
      {translate(`crm.fx.status.${status}`)}
    </ToneBadge>
  );
};

/** A rate's freshness: never a bare figure without its state. */
export const RateStateBadge = ({
  hasRate,
  isStale,
}: {
  hasRate: boolean;
  isStale: boolean | null | undefined;
}) => {
  const translate = useTranslate();
  if (!hasRate) {
    return (
      <ToneBadge tone="bad">{translate("crm.fx.status.no_rate")}</ToneBadge>
    );
  }
  return isStale ? (
    <ToneBadge tone="warn">{translate("crm.fx.status.stale")}</ToneBadge>
  ) : (
    <ToneBadge tone="good">{translate("crm.fx.status.current")}</ToneBadge>
  );
};

export const RunStatusBadge = ({
  status,
}: {
  status: "running" | "succeeded" | "failed";
}) => {
  const translate = useTranslate();
  const tone: Tone =
    status === "succeeded" ? "good" : status === "failed" ? "bad" : "neutral";
  return (
    <ToneBadge tone={tone}>{translate(`crm.fx.status.${status}`)}</ToneBadge>
  );
};
