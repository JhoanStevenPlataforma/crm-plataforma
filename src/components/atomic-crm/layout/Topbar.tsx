import { User } from "lucide-react";
import { useTranslate, useUserMenu } from "ra-core";
import { Link } from "react-router";

import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { NotificationsBell } from "../notifications/NotificationsBell";

/**
 * The bar above the content.
 *
 * Deliberately thin. Everything that used to live in the old header's avatar
 * dropdown -- users, teams, the team dashboard, settings, import
 * -- is now a visible entry in the sidebar, so what is left here is the
 * per-session chrome: where am I, what changed, how does this look, who am I.
 *
 * The empty `#breadcrumb` div is not a placeholder: `admin/breadcrumb.tsx`
 * portals into that exact id, and every CRUD page renders a breadcrumb by
 * default. The previous layout had no such element, so those breadcrumbs were
 * being rendered into nothing.
 */
export const Topbar = () => {
  const translate = useTranslate();

  return (
    // Frosted rather than opaque: a scrolled list slides under it and stays
    // faintly visible, so the bar reads as a layer above the page instead of
    // a band cut out of it.
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/70 px-4 backdrop-blur-xl backdrop-saturate-150 lg:px-6">
      {/* Mobile only: there the sidebar is a sheet and this opens it. On
          desktop the collapse control lives inside the sidebar itself. */}
      <SidebarTrigger
        className="-ml-1 md:hidden"
        aria-label={translate("crm.navigation.toggle")}
      />
      <Separator orientation="vertical" className="mr-3 !h-4 md:hidden" />

      <div className="flex min-w-0 flex-1 items-center" id="breadcrumb" />

      <div className="flex items-center gap-0.5">
        <NotificationsBell />
        <ThemeModeToggle />
        <RefreshButton />
        <UserMenu>
          <ProfileMenuItem />
        </UserMenu>
      </div>
    </header>
  );
};

const ProfileMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User />
        {translate("crm.profile.title")}
      </Link>
    </DropdownMenuItem>
  );
};
