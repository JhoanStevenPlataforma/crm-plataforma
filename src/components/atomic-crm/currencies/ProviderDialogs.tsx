import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { CrmDataProvider } from "../providers/types";
import type { Currency, ExchangeRateProvider } from "../types";

/** The tunables of a provider (admins). Its status columns are the server's. */
export const ProviderDialog = ({
  provider,
  currencies,
  onClose,
  onSaved,
}: {
  provider: ExchangeRateProvider | null;
  currencies: Currency[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState(100);
  const [minutes, setMinutes] = useState(360);
  const [codes, setCodes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (provider) {
      setEnabled(provider.is_enabled);
      setPriority(provider.priority);
      setMinutes(provider.refresh_interval_minutes);
      setCodes(provider.currencies ?? []);
    }
  }, [provider]);

  const isValid =
    Number.isInteger(priority) &&
    Number.isInteger(minutes) &&
    minutes >= 15 &&
    minutes <= 10080;

  const save = async () => {
    if (!provider) return;
    setIsSaving(true);
    try {
      await dataProvider.update("exchange_rate_providers", {
        id: provider.id,
        data: {
          is_enabled: enabled,
          priority,
          refresh_interval_minutes: minutes,
          currencies: codes,
        },
        previousData: provider,
      });
      notify("crm.fx.providers.saved");
      onSaved();
    } catch (error) {
      notify(fxErrorMessage(error), { type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const foreign = currencies.filter((currency) => !currency.is_base);

  return (
    <Dialog
      open={provider != null}
      onOpenChange={(next) => {
        if (!next && !isSaving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider?.name}</DialogTitle>
          <DialogDescription>{provider?.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            {translate("crm.fx.providers.enabled")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fx-provider-priority">
                {translate("crm.fx.providers.priority")}
              </Label>
              <Input
                id="fx-provider-priority"
                type="number"
                step={1}
                value={priority}
                onChange={(event) =>
                  setPriority(Number.parseInt(event.target.value, 10) || 0)
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fx-provider-minutes">
                {translate("crm.fx.providers.frequency")}
              </Label>
              <Input
                id="fx-provider-minutes"
                type="number"
                min={15}
                max={10080}
                step={15}
                value={minutes}
                onChange={(event) =>
                  setMinutes(Number.parseInt(event.target.value, 10) || 0)
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate("crm.fx.providers.priority_help")}
          </p>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">
              {translate("crm.fx.providers.currencies")}
            </legend>
            <div className="flex flex-wrap gap-3">
              {foreign.map((currency) => (
                <label
                  key={currency.code}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={codes.includes(currency.code)}
                    onCheckedChange={(checked) =>
                      setCodes((previous) =>
                        checked
                          ? [...previous, currency.code]
                          : previous.filter((code) => code !== currency.code),
                      )
                    }
                  />
                  {currency.code}
                </label>
              ))}
            </div>
          </fieldset>
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

/**
 * Credentials go straight to the server's vault through
 * `set_fx_provider_secret()`. Write-only: nothing ever reads them back into a
 * browser, so the field always starts empty.
 */
export const CredentialsDialog = ({
  provider,
  onClose,
  onSaved,
}: {
  provider: ExchangeRateProvider | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [secret, setSecret] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSecret("");
  }, [provider]);

  const save = async () => {
    if (!provider) return;
    setIsSaving(true);
    try {
      await dataProvider.setFxProviderSecret(provider.key, secret);
      notify("crm.fx.providers.credentials_saved");
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error && error.message.startsWith("crm.")
          ? error.message
          : fxErrorMessage(error),
        { type: "error" },
      );
    } finally {
      setSecret("");
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={provider != null}
      onOpenChange={(next) => {
        if (!next && !isSaving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate("crm.fx.providers.credentials_title", {
              provider: provider?.name ?? "",
            })}
          </DialogTitle>
          <DialogDescription>
            {translate("crm.fx.providers.credentials_help")}
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoComplete="off"
          aria-label={translate("crm.fx.providers.credentials")}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" disabled={isSaving} onClick={onClose}>
            {translate("ra.action.cancel")}
          </Button>
          <Button disabled={isSaving} onClick={save}>
            {translate("ra.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
