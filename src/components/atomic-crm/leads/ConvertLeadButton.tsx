import { useMutation } from "@tanstack/react-query";
import { UserRoundPlus } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useTranslate,
} from "ra-core";
import { useState } from "react";
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

import type { CrmDataProvider } from "../providers/types";
import type { Lead } from "../types";

/**
 * Turns a qualified lead into a company + contact, and optionally a deal.
 *
 * The whole conversion runs in a single `convert_lead()` call so a failure
 * cannot leave a half-built contact behind, and so two people clicking at the
 * same time cannot produce duplicates.
 */
export const ConvertLeadButton = () => {
  const record = useRecordContext<Lead>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const translate = useTranslate();
  const notify = useNotify();
  const redirect = useRedirect();
  const refresh = useRefresh();

  const [open, setOpen] = useState(false);
  const [createDeal, setCreateDeal] = useState(false);
  const [dealName, setDealName] = useState("");
  const [dealAmount, setDealAmount] = useState("0");

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error("No lead in context");
      return dataProvider.convertLead(record.id, {
        createDeal,
        dealName: dealName.trim() || undefined,
        dealAmount: Number(dealAmount) || 0,
      });
    },
    onSuccess: (contactId) => {
      notify("resources.leads.convert.success", { type: "success" });
      setOpen(false);
      refresh();
      redirect(`/contacts/${contactId}/show`);
    },
    onError: (error: Error) => {
      notify(error.message || "resources.leads.convert.error", {
        type: "error",
      });
    },
  });

  // Already converted leads keep a link to what they produced instead.
  if (!record || record.converted_at) {
    return null;
  }

  return (
    <>
      <Button type="button" variant="default" onClick={() => setOpen(true)}>
        <UserRoundPlus />
        {translate("resources.leads.convert.action")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {translate("resources.leads.convert.title")}
            </DialogTitle>
            <DialogDescription>
              {translate("resources.leads.convert.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="convert-create-deal"
                checked={createDeal}
                onCheckedChange={(checked) => setCreateDeal(checked === true)}
              />
              <Label htmlFor="convert-create-deal">
                {translate("resources.leads.convert.create_deal")}
              </Label>
            </div>

            {createDeal && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="convert-deal-name">
                    {translate("resources.deals.fields.name")}
                  </Label>
                  <Input
                    id="convert-deal-name"
                    value={dealName}
                    onChange={(event) => setDealName(event.target.value)}
                    placeholder={`${record.first_name ?? ""} ${record.last_name ?? ""}`.trim()}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="convert-deal-amount">
                    {translate("resources.deals.fields.amount")}
                  </Label>
                  <Input
                    id="convert-deal-amount"
                    type="number"
                    min={0}
                    value={dealAmount}
                    onChange={(event) => setDealAmount(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {translate("ra.action.cancel")}
            </Button>
            <Button type="button" disabled={isPending} onClick={() => mutate()}>
              {translate("resources.leads.convert.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
