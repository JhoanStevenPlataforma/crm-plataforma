import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SectionCard } from "../misc/SectionCard";
import type { ExchangeRateSettings, FxRateKind } from "../types";
import { useFxSettings } from "./useFx";

type Draft = Omit<ExchangeRateSettings, "id" | "updated_at">;

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

/** `exchange_rate_settings` (admins). Every change is audited by the server. */
export const FxSettingsForm = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { settings, refetch } = useFxSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setDraft({
        quote_rate_kind_default: settings.quote_rate_kind_default,
        stale_after_days: Number(settings.stale_after_days),
        rep_custom_rate_tolerance_percent: Number(
          settings.rep_custom_rate_tolerance_percent,
        ),
        failure_alert_threshold: Number(settings.failure_alert_threshold),
      });
    }
  }, [settings]);

  if (!settings || !draft) return null;

  const isValid =
    inRange(draft.stale_after_days, 0, 30) &&
    inRange(draft.rep_custom_rate_tolerance_percent, 0, 100) &&
    inRange(draft.failure_alert_threshold, 1, 50);

  const save = async () => {
    setIsSaving(true);
    try {
      await dataProvider.update("exchange_rate_settings", {
        id: settings.id,
        data: draft,
        previousData: settings,
      });
      notify("crm.fx.settings.saved");
      refetch();
    } catch {
      notify("crm.fx.errors.generic", { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const number = (key: keyof Draft, value: string) =>
    setDraft((previous) =>
      previous ? { ...previous, [key]: Number(value) } : previous,
    );

  return (
    <SectionCard title={translate("crm.fx.tabs.settings")}>
      <div className="grid max-w-2xl gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="fx-default-kind">
            {translate("crm.fx.settings.default_kind")}
          </Label>
          <Select
            value={draft.quote_rate_kind_default}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                quote_rate_kind_default: value as FxRateKind,
              })
            }
          >
            <SelectTrigger id="fx-default-kind" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="commercial">
                {translate("crm.fx.kinds.commercial")}
              </SelectItem>
              <SelectItem value="official">
                {translate("crm.fx.kinds.official")}
              </SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {translate("crm.fx.settings.default_kind_help")}
          </span>
        </div>

        <NumberField
          id="fx-stale-after"
          label={translate("crm.fx.settings.stale_after")}
          help={translate("crm.fx.settings.stale_after_help")}
          value={draft.stale_after_days}
          min={0}
          max={30}
          onChange={(value) => number("stale_after_days", value)}
        />
        <NumberField
          id="fx-tolerance"
          label={translate("crm.fx.settings.tolerance")}
          help={translate("crm.fx.settings.tolerance_help")}
          value={draft.rep_custom_rate_tolerance_percent}
          min={0}
          max={100}
          step={0.5}
          onChange={(value) =>
            number("rep_custom_rate_tolerance_percent", value)
          }
        />
        <NumberField
          id="fx-alert-after"
          label={translate("crm.fx.settings.alert_after")}
          value={draft.failure_alert_threshold}
          min={1}
          max={50}
          onChange={(value) => number("failure_alert_threshold", value)}
        />

        <div>
          <Button disabled={!isValid || isSaving} onClick={save}>
            {translate("ra.action.save")}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
};

const NumberField = ({
  id,
  label,
  help,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: string) => void;
}) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type="number"
      className="w-40"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
    {help ? (
      <span className="text-xs text-muted-foreground">{help}</span>
    ) : null}
  </div>
);
