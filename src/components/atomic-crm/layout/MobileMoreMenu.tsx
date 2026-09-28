import { CanAccess, useTranslate } from "ra-core";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { MOBILE_MORE_SECTIONS } from "./mobileMoreSections";
import { isNavItemActive, type NavItem } from "./navigation";

export const MobileMoreMenu = () => {
  const translate = useTranslate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const isActive = MOBILE_MORE_SECTIONS.some((section) =>
    section.items.some((item) => isNavItemActive(item, pathname)),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "flex-col gap-1 h-auto py-2 px-1 rounded-md w-16",
            isActive ? null : "text-muted-foreground",
          )}
        >
          <Menu className="size-6" />
          <span className="text-[0.6rem] font-medium">
            {translate("crm.navigation.more")}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{translate("crm.navigation.more")}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-4 px-4 pb-6">
          {MOBILE_MORE_SECTIONS.map((section) => (
            <div key={section.key} className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {translate(section.labelKey)}
              </p>
              {section.items.map((item) =>
                item.access ? (
                  <CanAccess
                    key={item.key}
                    resource={item.access.resource}
                    action={item.access.action}
                  >
                    <MoreItem
                      item={item}
                      active={isNavItemActive(item, pathname)}
                      onNavigate={() => setOpen(false)}
                    />
                  </CanAccess>
                ) : (
                  <MoreItem
                    key={item.key}
                    item={item}
                    active={isNavItemActive(item, pathname)}
                    onNavigate={() => setOpen(false)}
                  />
                ),
              )}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
};

const MoreItem = ({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) => {
  const translate = useTranslate();
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-2 text-sm",
        active ? "bg-accent font-medium" : "hover:bg-accent",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {translate(item.labelKey, item.labelOptions)}
    </Link>
  );
};
