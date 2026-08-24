import {
  BarChart3,
  FileText,
  Import,
  Settings,
  User,
  Users,
  UsersRound,
} from "lucide-react";
import { CanAccess, useTranslate, useUserMenu } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import { NotificationsBell } from "../notifications/NotificationsBell";
import { TeamsDashboard } from "../teams/TeamsDashboard";

const Header = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const location = useLocation();
  const translate = useTranslate();

  let currentPath: string | boolean = "/";
  if (matchPath("/", location.pathname)) {
    currentPath = "/";
  } else if (matchPath("/leads/*", location.pathname)) {
    currentPath = "/leads";
  } else if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else if (matchPath("/tasks/*", location.pathname)) {
    currentPath = "/tasks";
  } else {
    currentPath = false;
  }

  return (
    <>
      <nav className="grow">
        <header className="bg-secondary">
          <div className="px-4">
            <div className="flex justify-between items-center flex-1">
              <Link
                to="/"
                className="flex items-center gap-2 text-secondary-foreground no-underline"
              >
                <img
                  className="[.light_&]:hidden h-6"
                  src={darkModeLogo}
                  alt={title}
                />
                <img
                  className="[.dark_&]:hidden h-6"
                  src={lightModeLogo}
                  alt={title}
                />
                <h1 className="text-xl font-semibold">{title}</h1>
              </Link>
              <div>
                <nav className="flex">
                  <NavigationTab
                    label={translate("ra.page.dashboard")}
                    to="/"
                    isActive={currentPath === "/"}
                  />
                  {/* Leads sit before contacts: they are the top of the
                      funnel, and convert into a contact. */}
                  <NavigationTab
                    label={translate("resources.leads.name", {
                      smart_count: 2,
                    })}
                    to="/leads"
                    isActive={currentPath === "/leads"}
                  />
                  <NavigationTab
                    label={translate("resources.contacts.name", {
                      smart_count: 2,
                    })}
                    to="/contacts"
                    isActive={currentPath === "/contacts"}
                  />
                  <NavigationTab
                    label={translate("resources.companies.name", {
                      smart_count: 2,
                    })}
                    to="/companies"
                    isActive={currentPath === "/companies"}
                  />
                  <NavigationTab
                    label={translate("resources.deals.name", {
                      smart_count: 2,
                    })}
                    to="/deals"
                    isActive={currentPath === "/deals"}
                  />
                  {/* Tasks close the loop: every other tab is a record, this
                      one is the work owed on them (§15.1). */}
                  <NavigationTab
                    label={translate("resources.tasks.name", {
                      smart_count: 2,
                    })}
                    to="/tasks"
                    isActive={currentPath === "/tasks"}
                  />
                </nav>
              </div>
              <div className="flex items-center">
                <NotificationsBell />
                <ThemeModeToggle />
                <RefreshButton />
                <UserMenu>
                  <ProfileMenu />
                  <CanAccess resource="sales" action="list">
                    <UsersMenu />
                  </CanAccess>
                  <CanAccess resource="teams" action="edit">
                    <TeamsMenu />
                    <TeamsDashboardMenu />
                  </CanAccess>
                  <CanAccess resource="configuration" action="edit">
                    <SettingsMenu />
                  </CanAccess>
                  <ImportFromJsonMenuItem />
                  <ChangelogMenuItem />
                </UserMenu>
              </div>
            </div>
          </div>
        </header>
      </nav>
    </>
  );
};

const NavigationTab = ({
  label,
  to,
  isActive,
}: {
  label: string;
  to: string;
  isActive: boolean;
}) => (
  <Link
    to={to}
    className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
      isActive
        ? "text-secondary-foreground border-secondary-foreground"
        : "text-secondary-foreground/70 border-transparent hover:text-secondary-foreground/80"
    }`}
  >
    {label}
  </Link>
);

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/sales" className="flex items-center gap-2">
        <Users />
        {translate("resources.sales.name", { smart_count: 2 })}
      </Link>
    </DropdownMenuItem>
  );
};

const TeamsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<TeamsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/teams" className="flex items-center gap-2">
        <UsersRound />
        {translate("resources.teams.name", { smart_count: 2 })}
      </Link>
    </DropdownMenuItem>
  );
};

/**
 * Sits behind the same `teams`/`edit` gate as the teams entry above, which
 * resolves to manager + admin. The page repeats the check — a menu that is not
 * rendered is not an access control.
 */
const TeamsDashboardMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<TeamsDashboardMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={TeamsDashboard.path} className="flex items-center gap-2">
        <BarChart3 />
        {translate("crm.teams_dashboard.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
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

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings />
        {translate("crm.settings.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import />
        {translate("crm.header.import_data")}
      </Link>
    </DropdownMenuItem>
  );
};

const ChangelogMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ChangelogMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ChangelogPage.path} className="flex items-center gap-2">
        <FileText />
        {translate("crm.changelog.title")}
      </Link>
    </DropdownMenuItem>
  );
};
export default Header;
