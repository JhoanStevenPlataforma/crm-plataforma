import { CanAccess, useTranslate } from "ra-core";
import { Link, useLocation } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { isNavItemActive, type NavItem, type NavSection } from "./navigation";
import { RAIL_BUTTON_CLASS } from "./railButton";

/**
 * One section of the COLLAPSED sidebar.
 *
 * Collapsed, the sidebar used to become a column of every item's icon —
 * twenty-odd glyphs with no grouping, the last ones cut off on a laptop. Now
 * a section is one button: a single-item section links straight to its item,
 * a larger one opens a flyout naming the section and listing its items. The
 * rail is six buttons, and the section holding the current screen is lit, so
 * "where am I" survives the collapse.
 */
export const NavRailSection = ({ section }: { section: NavSection }) => {
  const translate = useTranslate();
  const { pathname } = useLocation();
  const sectionLabel = translate(section.labelKey);
  const isActive = section.items.some((item) =>
    isNavItemActive(item, pathname),
  );

  if (section.items.length === 1) {
    const [item] = section.items;
    const label = translate(item.labelKey, { ...item.labelOptions });
    const link = (
      <SidebarMenuItem className="flex justify-center">
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={label}
          className={RAIL_BUTTON_CLASS}
        >
          <Link to={item.to} state={{ _scrollToTop: true }} aria-label={label}>
            <item.icon />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
    return item.access ? (
      <CanAccess resource={item.access.resource} action={item.access.action}>
        {link}
      </CanAccess>
    ) : (
      link
    );
  }

  return (
    <SidebarMenuItem className="flex justify-center">
      <DropdownMenu modal={false}>
        {/* The tooltip wraps the trigger (not the other way round): the
            menu button's tooltip is a wrapper component, and a trigger's
            `asChild` has to land on the real button element. */}
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={sectionLabel}
          className={RAIL_BUTTON_CLASS}
        >
          <DropdownMenuTrigger aria-label={sectionLabel}>
            <section.icon />
          </DropdownMenuTrigger>
        </SidebarMenuButton>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={12}
          className="min-w-56 p-1.5"
        >
          <DropdownMenuLabel className="px-2 pt-1.5 pb-2 text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {sectionLabel}
          </DropdownMenuLabel>
          {section.items.map((item) =>
            item.access ? (
              <CanAccess
                key={item.key}
                resource={item.access.resource}
                action={item.access.action}
              >
                <FlyoutItem item={item} pathname={pathname} />
              </CanAccess>
            ) : (
              <FlyoutItem key={item.key} item={item} pathname={pathname} />
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

const FlyoutItem = ({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) => {
  const translate = useTranslate();
  const isActive = isNavItemActive(item, pathname);
  return (
    <DropdownMenuItem
      asChild
      className={cn(
        "h-9 gap-2.5 rounded-lg px-2",
        isActive &&
          "bg-brand-tint font-medium text-brand-strong focus:bg-brand-tint focus:text-brand-strong",
      )}
    >
      <Link to={item.to} state={{ _scrollToTop: true }}>
        <item.icon className={cn("size-4", isActive && "text-brand")} />
        {translate(item.labelKey, { ...item.labelOptions })}
      </Link>
    </DropdownMenuItem>
  );
};
