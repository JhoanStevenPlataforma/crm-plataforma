import { UserRoundCheck } from "lucide-react";
import {
  useCanAccess,
  useGetList,
  useListContext,
  useNotify,
  useRefresh,
  useResourceContext,
  useTranslate,
  useUpdateMany,
} from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ASSIGN_ACTION } from "../providers/commons/canAccess";
import type { Sale } from "../types";

/**
 * Hands the selected records over to another sales rep in one go.
 *
 * Only rendered for users who may reassign (admins and sales managers); row
 * level security enforces the same rule server side.
 */
export function BulkAssignOwnerButton() {
  const resource = useResourceContext();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const { selectedIds = [], onUnselectItems } = useListContext();
  const [open, setOpen] = useState(false);

  const { canAccess } = useCanAccess({
    action: ASSIGN_ACTION,
    resource: resource ?? "",
  });

  // One PATCH for the whole selection rather than one request per record.
  const [updateMany, { isPending: isAssigning }] = useUpdateMany();

  const { data: sales = [], isPending: isPendingSales } = useGetList<Sale>(
    "sales",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "last_name", order: "ASC" },
      filter: { "disabled@neq": true },
    },
    { enabled: open },
  );

  const assignTo = (sale: Sale) => {
    updateMany(
      resource,
      { ids: selectedIds, data: { sales_id: sale.id } },
      {
        onSuccess: () => {
          notify("crm.assign.success", {
            type: "success",
            messageArgs: {
              smart_count: selectedIds.length,
              name: `${sale.first_name} ${sale.last_name}`,
            },
          });
          setOpen(false);
          onUnselectItems();
          refresh();
        },
        onError: () => {
          notify("crm.assign.error", { type: "error" });
        },
      },
    );
  };

  if (canAccess !== true || !selectedIds.length) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        <UserRoundCheck />
        {translate("crm.assign.action")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{translate("crm.assign.title")}</DialogTitle>
            <DialogDescription>
              {translate("crm.assign.description", {
                smart_count: selectedIds.length,
              })}
            </DialogDescription>
          </DialogHeader>

          <Command>
            <CommandInput placeholder={translate("crm.assign.search")} />
            <CommandList>
              <CommandEmpty>
                {isPendingSales
                  ? translate("crm.common.loading")
                  : translate("crm.assign.empty")}
              </CommandEmpty>
              <CommandGroup>
                {sales.map((sale) => (
                  <CommandItem
                    key={sale.id}
                    value={`${sale.first_name} ${sale.last_name} ${sale.email}`}
                    disabled={isAssigning}
                    onSelect={() => assignTo(sale)}
                  >
                    {sale.first_name} {sale.last_name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
