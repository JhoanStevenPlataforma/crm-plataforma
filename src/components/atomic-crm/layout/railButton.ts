import { cn } from "@/lib/utils";

/**
 * The rail button of an active section: amber light on ink, with a soft glow.
 * Shared by the direct-link and the flyout forms so the two never drift.
 */
export const RAIL_BUTTON_CLASS = cn(
  "size-10! justify-center rounded-xl p-0! text-sidebar-foreground transition-[background-color,color,box-shadow] duration-150",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "data-[active=true]:bg-sidebar-primary/14 data-[active=true]:text-sidebar-primary data-[active=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-primary)_32%,transparent),0_0_18px_-4px_color-mix(in_oklch,var(--sidebar-primary)_55%,transparent)]",
  "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
  "[&>svg]:size-[18px]!",
);
