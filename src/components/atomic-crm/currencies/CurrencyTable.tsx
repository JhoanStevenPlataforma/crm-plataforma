import { Plus } from "lucide-react";
import {
  useCanAccess,
  useDataProvider,
  useNotify,
  useTranslate,
} from "ra-core";
import { useState } from "react";

import { Confirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { fxErrorMessage } from "../providers/commons/fxRpc";
import type { CrmDataProvider } from "../providers/types";
import { SectionCard } from "../misc/SectionCard";
import type { Currency } from "../types";
import { CurrencyDialog } from "./CurrencyDialog";
import { ToneBadge } from "./FxBadges";
import { useCurrencies } from "./useFx";

/**
 * The currency catalogue: active and inactive, with what each is for. Admins
 * create, edit and choose the base; everybody else reads.
 */
export const CurrencyTable = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { currencies, refetch } = useCurrencies();
  const { canAccess: canEdit } = useCanAccess({
    resource: "currencies",
    action: "edit",
  });
  const [editing, setEditing] = useState<Currency | null | undefined>();
  const [makingBase, setMakingBase] = useState<Currency | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const switchBase = async () => {
    if (!makingBase) return;
    setIsSwitching(true);
    try {
      await dataProvider.setBaseCurrency(makingBase.code);
      notify("crm.fx.currencies.saved");
      refetch();
    } catch (error) {
      notify(
        error instanceof Error && error.message.startsWith("crm.")
          ? error.message
          : fxErrorMessage(error),
        { type: "error" },
      );
    } finally {
      setIsSwitching(false);
      setMakingBase(null);
    }
  };

  return (
    <SectionCard
      title={translate("crm.fx.tabs.currencies")}
      contentClassName="p-0"
      action={
        canEdit ? (
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus />
            {translate("crm.fx.currencies.new")}
          </Button>
        ) : undefined
      }
    >
      {currencies.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {translate("crm.fx.currencies.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate("crm.fx.currencies.code")}</TableHead>
                <TableHead>{translate("crm.fx.currencies.name")}</TableHead>
                <TableHead>{translate("crm.fx.currencies.symbol")}</TableHead>
                <TableHead className="text-right">
                  {translate("crm.fx.currencies.decimals")}
                </TableHead>
                <TableHead>{translate("crm.fx.rates.state")}</TableHead>
                {canEdit ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies.map((currency) => (
                <TableRow key={currency.code}>
                  <TableCell className="font-medium">{currency.code}</TableCell>
                  <TableCell>{currency.name}</TableCell>
                  <TableCell>{currency.symbol}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currency.decimals}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <ToneBadge tone={currency.is_active ? "good" : "neutral"}>
                        {translate(
                          currency.is_active
                            ? "crm.fx.status.active"
                            : "crm.fx.status.inactive",
                        )}
                      </ToneBadge>
                      {currency.is_base ? (
                        <ToneBadge tone="neutral">
                          {translate("crm.fx.currencies.is_base")}
                        </ToneBadge>
                      ) : null}
                      {currency.is_quote_default ? (
                        <ToneBadge tone="neutral">
                          {translate("crm.fx.currencies.is_quote_default")}
                        </ToneBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right whitespace-nowrap">
                      {!currency.is_base && currency.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMakingBase(currency)}
                        >
                          {translate("crm.fx.currencies.make_base")}
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(currency)}
                      >
                        {translate("ra.action.edit")}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CurrencyDialog
        open={editing !== undefined}
        currency={editing ?? null}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          refetch();
        }}
      />
      <Confirm
        isOpen={makingBase != null}
        loading={isSwitching}
        title="crm.fx.currencies.make_base"
        content="crm.fx.currencies.make_base_confirm"
        translateOptions={{ code: makingBase?.code ?? "" }}
        onClose={() => setMakingBase(null)}
        onConfirm={switchBase}
      />
    </SectionCard>
  );
};
