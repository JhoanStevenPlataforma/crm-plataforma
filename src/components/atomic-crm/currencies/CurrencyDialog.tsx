import { useDataProvider, useNotify, useTranslate } from "ra-core";
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
import { Switch } from "@/components/ui/switch";

import { fxErrorMessage } from "../providers/commons/fxRpc";
import type { Currency } from "../types";

const ISO_CODE = /^[A-Z]{3}$/;

type Draft = Pick<
  Currency,
  "code" | "name" | "symbol" | "decimals" | "is_active" | "is_quote_default"
>;

const EMPTY: Draft = {
  code: "",
  name: "",
  symbol: "",
  decimals: 2,
  is_active: true,
  is_quote_default: false,
};

/**
 * Create or edit a currency (admins). The code is fixed once created -- every
 * price list, quotation and rate references it -- and the base is switched by
 * its own action, never by this form.
 */
export const CurrencyDialog = ({
  open,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null to create. */
  currency: Currency | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(currency ? { ...currency } : EMPTY);
  }, [open, currency]);

  const isNew = currency == null;
  const code = draft.code.trim().toUpperCase();
  const isValid =
    ISO_CODE.test(code) &&
    draft.name.trim() !== "" &&
    Number.isInteger(draft.decimals) &&
    draft.decimals >= 0 &&
    draft.decimals <= 4;

  const save = async () => {
    setIsSaving(true);
    const data = {
      name: draft.name.trim(),
      symbol: draft.symbol.trim(),
      decimals: draft.decimals,
      // The base is always active and a default must be active.
      is_active: currency?.is_base ? true : draft.is_active,
      is_quote_default: draft.is_active ? draft.is_quote_default : false,
    };
    try {
      if (isNew) {
        await dataProvider.create("currencies", {
          data: { ...data, code },
        });
      } else {
        await dataProvider.update("currencies", {
          id: currency.id,
          data,
          previousData: currency,
        });
      }
      notify("crm.fx.currencies.saved");
      onSaved();
    } catch (error) {
      notify(fxErrorMessage(error), { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

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
            {translate(
              isNew ? "crm.fx.currencies.new" : "crm.fx.currencies.edit",
            )}
          </DialogTitle>
          <DialogDescription>
            {translate("crm.fx.currencies.decimals_help")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="fx-currency-code">
              {translate("crm.fx.currencies.code")}
            </Label>
            <Input
              id="fx-currency-code"
              value={draft.code}
              maxLength={3}
              disabled={!isNew}
              onChange={(event) =>
                set("code", event.target.value.toUpperCase())
              }
            />
            {isNew ? (
              <span className="text-xs text-muted-foreground">
                {translate("crm.fx.currencies.code_help")}
              </span>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fx-currency-name">
              {translate("crm.fx.currencies.name")}
            </Label>
            <Input
              id="fx-currency-name"
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fx-currency-symbol">
              {translate("crm.fx.currencies.symbol")}
            </Label>
            <Input
              id="fx-currency-symbol"
              value={draft.symbol}
              maxLength={8}
              onChange={(event) => set("symbol", event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fx-currency-decimals">
              {translate("crm.fx.currencies.decimals")}
            </Label>
            <Input
              id="fx-currency-decimals"
              type="number"
              min={0}
              max={4}
              step={1}
              value={draft.decimals}
              onChange={(event) =>
                set("decimals", Number.parseInt(event.target.value, 10) || 0)
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={currency?.is_base ? true : draft.is_active}
              disabled={currency?.is_base}
              onCheckedChange={(checked) => set("is_active", checked)}
            />
            {translate("crm.fx.currencies.is_active")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.is_quote_default}
              disabled={!draft.is_active}
              onCheckedChange={(checked) => set("is_quote_default", checked)}
            />
            {translate("crm.fx.currencies.is_quote_default")}
          </label>
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
