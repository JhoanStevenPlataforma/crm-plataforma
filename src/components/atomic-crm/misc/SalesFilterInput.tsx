import { Check, ChevronsUpDown, X } from "lucide-react";
import {
  useCanAccess,
  useGetList,
  useListFilterContext,
  useResourceContext,
  useTranslate,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { ASSIGN_ACTION } from "../providers/commons/canAccess";
import type { Sale } from "../types";

export interface SalesFilterInputProps {
  /** Accepted for parity with the other filter inputs; the source is fixed. */
  source?: string;
  alwaysOn?: boolean;
}

/**
 * "Owner" list filter, rendered only for users who see the whole team.
 *
 * A searchable combobox rather than a list of toggles: a large sales
 * organisation has far too many reps for a checkbox per person. A sales rep
 * never sees it — row level security already narrows their list to their own
 * records, so the control would be a no-op.
 */
export const SalesFilterInput = (_props: SalesFilterInputProps) => {
  const resource = useResourceContext();
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const { filterValues, displayedFilters, setFilters } = useListFilterContext();

  const { canAccess } = useCanAccess({
    action: ASSIGN_ACTION,
    resource: resource ?? "",
  });

  const currentValue = filterValues?.sales_id;
  const { data: sales = [] } = useGetList<Sale>(
    "sales",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "last_name", order: "ASC" },
      filter: { "disabled@neq": true },
    },
    { enabled: open || currentValue != null },
  );

  const selected = sales.find(
    (sale) => String(sale.id) === String(currentValue),
  );

  const applyFilter = (salesId?: Sale["id"]) => {
    const nextFilters = { ...filterValues };
    if (salesId == null) {
      delete nextFilters.sales_id;
    } else {
      nextFilters.sales_id = salesId;
    }
    setFilters(nextFilters, displayedFilters);
    setOpen(false);
  };

  if (canAccess !== true) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="h-9 justify-between font-normal"
          >
            {selected
              ? `${selected.first_name} ${selected.last_name}`
              : translate("crm.assign.filter_placeholder")}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="start">
          <Command>
            <CommandInput placeholder={translate("crm.assign.search")} />
            <CommandList>
              <CommandEmpty>{translate("crm.assign.empty")}</CommandEmpty>
              <CommandGroup>
                {sales.map((sale) => (
                  <CommandItem
                    key={sale.id}
                    value={`${sale.first_name} ${sale.last_name} ${sale.email}`}
                    onSelect={() => applyFilter(sale.id)}
                  >
                    <Check
                      className={cn(
                        String(sale.id) === String(currentValue)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {sale.first_name} {sale.last_name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {currentValue != null && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          aria-label={translate("crm.assign.clear_filter")}
          onClick={() => applyFilter(undefined)}
        >
          <X />
        </Button>
      )}
    </div>
  );
};
