import { ChevronRight } from "lucide-react";
import { CanAccess, useTranslate } from "ra-core";
import { useState } from "react";
import { Link, useMatch } from "react-router";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Imported rather than read from the configuration: see `BrandMark`.
import iconDark from "../root/logos/logo_plataforma_icon_dark.svg";
import iconLight from "../root/logos/logo_plataforma_icon_light.svg";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { NAV_SECTIONS, type NavItem, type NavSection } from "./navigation";

/**
 * The CRM's primary navigation.
 *
 * Six sections, each collapsible, reading their contents from `navigation.ts`.
 * The sections are what turn a flat row of tabs into an information
 * architecture: the same twelve destinations, but grouped the way the work
 * actually flows -- lead, then customer, then opportunity, then the activity
 * owed on it, then what it all measured.
 *
 * Collapsed to the icon rail the section labels disappear (the sidebar
 * primitive handles that) and each button keeps a tooltip, so the rail stays
 * navigable rather than becoming a column of unlabelled glyphs.
 */
export const AppSidebar = () => {
  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-14 justify-center border-b px-3">
        <BrandMark />
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {NAV_SECTIONS.map((section) => (
          <NavSectionGroup key={section.key} section={section} />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-2" />
    </Sidebar>
  );
};

/**
 * The product mark.
 *
 * The logo is a wordmark, so it already carries the product name and no title
 * text is rendered beside it — two names side by side read as two products.
 *
 * Collapsed to the icon rail the wordmark is useless: it is roughly 4:1, so at
 * the rail's width it would be about six pixels tall. The rail gets the
 * icon-only crop instead.
 *
 * The lockups come from the configuration, so a rebranding installation
 * replaces them in Settings. The rail icon does NOT — it is imported here, and
 * an installation that changes its logo keeps this one in the collapsed rail.
 * Promoting the icon to a configured slot means two more fields in
 * `ConfigurationContext` and in the settings form; worth doing the first time
 * somebody actually rebrands.
 */
const BrandMark = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Link to="/" className="flex items-center overflow-hidden no-underline">
      {collapsed ? (
        <>
          <img
            className="[.light_&]:hidden size-6 shrink-0 object-contain"
            src={iconDark}
            alt={title}
          />
          <img
            className="[.dark_&]:hidden size-6 shrink-0 object-contain"
            src={iconLight}
            alt={title}
          />
        </>
      ) : (
        <>
          <img
            className="[.light_&]:hidden h-7 max-w-full object-contain object-left"
            src={darkModeLogo}
            alt={title}
          />
          <img
            className="[.dark_&]:hidden h-7 max-w-full object-contain object-left"
            src={lightModeLogo}
            alt={title}
          />
        </>
      )}
    </Link>
  );
};

/**
 * One section, and the state of its own disclosure.
 *
 * Open by default: a menu that hides its contents on first load makes the user
 * hunt for what used to be one click away. Collapsing is for the person who has
 * decided they never use a section, not a default we impose.
 */
const NavSectionGroup = ({ section }: { section: NavSection }) => {
  const translate = useTranslate();
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel
          asChild
          className="group/label px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
        >
          <CollapsibleTrigger className="w-full">
            {translate(section.labelKey)}
            <ChevronRight
              className={cn(
                "ml-auto size-3.5 transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) =>
                item.access ? (
                  <CanAccess
                    key={item.key}
                    resource={item.access.resource}
                    action={item.access.action}
                  >
                    <NavMenuItem item={item} />
                  </CanAccess>
                ) : (
                  <NavMenuItem key={item.key} item={item} />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
};

const NavMenuItem = ({ item }: { item: NavItem }) => {
  const translate = useTranslate();
  const { isMobile, setOpenMobile } = useSidebar();
  // `match` is the route pattern, not the link: `/deals/12/show` has to keep
  // the Opportunities entry lit, while the dashboard's `/` must not light up
  // on every route -- hence `matchEnd`.
  const match = useMatch({ path: item.match, end: item.matchEnd ?? false });
  const label = translate(item.labelKey, { ...item.labelOptions });
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={!!match}
        tooltip={label}
        className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
      >
        <Link
          to={item.to}
          state={{ _scrollToTop: true }}
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <Icon className={cn(!!match && "text-sidebar-primary")} />
          <span className="truncate">{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
