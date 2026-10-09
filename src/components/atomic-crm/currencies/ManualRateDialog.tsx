import {
  useDataProvider,
  useLocaleState,
  useNotify,
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

import { RequiredReasonField } from "../misc/RequiredReasonField";
import type { CurrentExchangeRate, FxRateKind } from "../types";
import { deviationPercent } from "./fxMath";
import { formatDay, formatRate, serverToday } from "./fxFormat";

const DECIMAL = /^\d+([.,]\d{1,10})?$/;

/**
 * A rate typed by a person: the company's commercial rate, or an official one
 * when the provider cannot be reached. Never an edit -- every save is a new
 * row in `exchange_rates`, signed by the session and written to the audit
 * log; the provider's rates are left exactly as they were.
 */
export const ManualRateDialog = ({
  open,
  kind,
  rate,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: FxRateKind;
  rate: CurrentExchangeRate | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [locale] = useLocaleState();
  const dataProvider = useDataProvider();
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(serverToday());
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setFrom(serverToday());
      setUntil("");
      setNote("");
    }
  }, [open]);

  if (!rate) return null;

  const parsed = Number(value.replace(",", "."));
  const isRateValid = DECIMAL.test(value.trim()) && parsed > 0;
  const isDatesValid = from !== "" && (until === "" || until >= from);
  const isValid = isRateValid && isDatesValid && note.trim() !== "";
  const deviation =
    isRateValid && rate.official_rate
      ? deviationPercent(parsed, Number(rate.official_rate))
      : null;

  const save = async () => {
    setIsSaving(true);
    try {
      await dataProvider.create("exchange_rates", {
        data: {
          currency_code: rate.currency_code,
          base_currency_code: rate.base_currency_code,
          rate: value.trim().replace(",", "."),
          kind,
          effective_date: from,
          valid_until: until || null,
          note: note.trim(),
        },
      });
      notify("crm.fx.manual.saved");
      onSaved();
    } catch {
      notify("crm.fx.manual.error", { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const params = {
    currency: rate.currency_code,
    base: rate.base_currency_code,
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSaving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(`crm.fx.manual.title_${kind}`, params)}
          </DialogTitle>
          <DialogDescription>
            {translate(`crm.fx.manual.help_${kind}`)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="fx-manual-rate">
              {translate("crm.fx.manual.rate", params)}
            </Label>
            <Input
              id="fx-manual-rate"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {rate.official_rate ? (
              <span className="text-xs text-muted-foreground">
                {translate("crm.fx.manual.reference", {
                  rate: formatRate(rate.official_rate, locale),
                  date: formatDay(rate.official_effective_date, locale),
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
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fx-manual-from">
                {translate("crm.fx.manual.effective_date")}
              </Label>
              <Input
                id="fx-manual-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fx-manual-until">
                {translate("crm.fx.manual.valid_until")}
              </Label>
              <Input
                id="fx-manual-until"
                type="date"
                min={from}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </div>
          </div>
          <RequiredReasonField
            id="fx-manual-note"
            label={translate("crm.fx.manual.note")}
            value={note}
            rows={3}
            placeholder={translate("crm.fx.manual.note_placeholder")}
            onChange={setNote}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isSaving} onClick={onClose}>
            {translate("ra.action.cancel")}
          </Button>
          <Button disabled={!isValid || isSaving} onClick={save}>
            {translate("ra.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
