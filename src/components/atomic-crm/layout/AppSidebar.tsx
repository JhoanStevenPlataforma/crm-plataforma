import { ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { CanAccess, useGetIdentity, useTranslate } from "ra-core";
import { useCallback, useState } from "react";
import { Link, useMatch } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Imported rather than read from the configuration: see `BrandMark`.
import iconDark from "../root/logos/logo_plataforma_icon_dark.svg";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { NAV_SECTIONS, type NavItem, type NavSection } from "./navigation";
import { NavRailSection } from "./NavRailSection";

/**
 * The CRM's primary navigation.
 *
 * Six sections, each collapsible, reading their contents from `navigation.ts`.
 * The sections are what turn a flat row of tabs into an information
 * architecture: the same destinations, grouped the way the work actually
 * flows -- lead, then customer, then opportunity, then the activity owed on
 * it, then what it all measured.
 *
 * Collapsed to the icon rail, each SECTION becomes one button (see
 * `NavRailSection`): six glyphs with flyouts rather than a column of every
 * item's icon.
 */
export const AppSidebar = () => {
  const { state, isMobile } = useSidebar();
  // The mobile sheet always shows the full menu, whatever the desktop state.
  const isRail = state === "collapsed" && !isMobile;

  return (
    // Ink in both themes (see `--sidebar` in index.css). Anything placed in
    // here must use the `sidebar-*` tokens, never `foreground`/`muted-*`,
    // which in light mode are dark text on this dark ground.
    <Sidebar collapsible="icon" className="border-r-sidebar-border">
      {/* Expanded: the mark on the left, the collapse arrow on the right.
          Collapsed: the rail is too narrow for both on one line, so the
          arrow sits under the mark -- still in the header, same control. */}
      <SidebarHeader className="relative min-h-14 flex-row items-center justify-between gap-2 overflow-hidden border-b border-sidebar-border px-4 py-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:px-0">
        {/* The amber pool behind the mark: the portal cover's glow, small. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 -left-6 size-32 rounded-full bg-sidebar-primary/20 blur-3xl"
        />
        <BrandMark />
        <CollapseToggle />
      </SidebarHeader>

      {isRail ? (
        // Scrolls (without a visible bar) instead of clipping, so no screen
        // height can hide the last section.
        <SidebarContent className="animate-in fade-in-0 items-center gap-0 overflow-y-auto! py-3 duration-300 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SidebarMenu className="items-center gap-1.5">
            {NAV_SECTIONS.map((section) => (
              <NavRailSection key={section.key} section={section} />
            ))}
          </SidebarMenu>
        </SidebarContent>
      ) : (
        // Fades in once the width has mostly settled, so the labels are
        // never seen squeezed mid-animation.
        <SidebarContent className="animate-in fade-in-0 gap-0 py-3 delay-75 duration-300 fill-mode-both">
          {NAV_SECTIONS.map((section) => (
            <NavSectionGroup key={section.key} section={section} />
          ))}
        </SidebarContent>
      )}

      <SidebarFooter className="gap-1 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:items-center">
        <IdentityCard />
      </SidebarFooter>
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
  const { darkModeLogo, title } = useConfigurationContext();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Link
      to="/"
      className="flex items-center overflow-hidden no-underline group-data-[collapsible=icon]:justify-center"
    >
      {/* Always the lockup drawn for a dark ground: the sidebar is ink in
          both themes, so the light-mode logo would be dark-on-dark. */}
      {collapsed ? (
        <img
          className="relative size-7 shrink-0 object-contain"
          src={iconDark}
          alt={title}
        />
      ) : (
        <img
          className="relative h-7 max-w-full object-contain object-left"
          src={darkModeLogo}
          alt={title}
        />
      )}
    </Link>
  );
};

/**
 * One section of the EXPANDED sidebar, and the state of its disclosure.
 *
 * Open by default: a menu that hides its contents on first load makes the user
 * hunt for what used to be one click away. Collapsing is for the person who has
 * decided they never use a section, and that choice is remembered.
 */
const NavSectionGroup = ({ section }: { section: NavSection }) => {
  const translate = useTranslate();
  const [open, setOpen] = useSectionOpen(section.key);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="px-3 py-1.5">
        <SidebarGroupLabel
          asChild
          className="group/label h-7 px-2 text-[0.625rem] font-semibold tracking-[0.14em] text-sidebar-muted uppercase hover:text-sidebar-accent-foreground"
        >
          <CollapsibleTrigger className="w-full">
            {translate(section.labelKey)}
            <ChevronRight
              className={cn(
                "ml-auto size-3 transition-[transform,opacity] duration-150",
                // Open, the chevron only appears on hover: six permanent
                // arrows are noise. Closed, it stays -- it is the only sign
                // that something is hidden underneath.
                open
                  ? "rotate-90 opacity-0 group-hover/label:opacity-100 group-focus-visible/label:opacity-100"
                  : "opacity-100",
              )}
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
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
        className={cn(
          "relative h-9 gap-2.5 overflow-visible rounded-lg px-2.5 text-[0.8125rem] transition-colors duration-150",
          "[&>svg]:size-[17px] [&>svg]:opacity-75 hover:[&>svg]:opacity-100 data-[active=true]:[&>svg]:opacity-100",
          // Active: a lit row. The amber bar on the sidebar's edge is the
          // portal's progress line turned on its side, and its glow is the
          // only place the expanded sidebar uses a shadow.
          "data-[active=true]:bg-[linear-gradient(90deg,color-mix(in_oklch,var(--sidebar-primary)_16%,transparent),color-mix(in_oklch,var(--sidebar-primary)_4%,transparent))] data-[active=true]:text-sidebar-accent-foreground",
          "before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary before:opacity-0 before:shadow-[0_0_10px_1px] before:shadow-sidebar-primary/60 before:transition-opacity data-[active=true]:before:opacity-100",
        )}
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

/**
 * Collapse / expand, inside the sidebar's own header. The arrow points the
 * way the sidebar will move: left (inwards) while it is open, right
 * (outwards) on the rail. ctrl+B still toggles it; on mobile the sidebar is
 * a sheet opened from the topbar, so this control is not rendered there.
 */
const CollapseToggle = () => {
  const translate = useTranslate();
  const { state, toggleSidebar, isMobile } = useSidebar();
  if (isMobile) return null;
  const collapsed = state === "collapsed";
  const label = translate(
    collapsed ? "crm.navigation.expand" : "crm.navigation.collapse",
  );
  const Arrow = collapsed ? ChevronsRight : ChevronsLeft;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={label}
          aria-expanded={!collapsed}
          className="relative grid size-7 shrink-0 place-items-center rounded-md text-sidebar-muted transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-primary focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Arrow className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
};

/**
 * Who is signed in, and as what, pinned to the foot of the navigation.
 *
 * The role is shown because it changes what the screens above offer: a rep
 * who wonders why there is no "Reassign" button finds the answer here. It
 * links to the profile, the one place a user edits themselves.
 */
const IdentityCard = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  if (!identity) return null;
  const name = identity.fullName ?? "";

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          size="lg"
          tooltip={name}
          className="h-12 gap-2.5 rounded-lg px-2 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
        >
          <Link to="/profile">
            <Avatar className="size-8 shrink-0 rounded-lg ring-1 ring-sidebar-border">
              <AvatarImage src={identity.avatar} role="presentation" />
              <AvatarFallback className="rounded-lg bg-sidebar-accent text-xs font-semibold text-sidebar-primary">
                {name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
                {name}
              </span>
              {identity.role ? (
                <span className="truncate text-[0.6875rem] text-sidebar-muted">
                  {translate(`resources.sales.roles.${identity.role}`)}
                </span>
              ) : null}
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const SECTIONS_STORAGE_KEY = "crm.sidebar.closedSections";

const readClosedSections = (): string[] => {
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
};

/**
 * A section's disclosure, remembered per browser: somebody who closes
 * "Settings" because they never use it should not reopen it on every visit.
 * Storage failures (private mode) degrade to "open", the default.
 */
const useSectionOpen = (key: string): [boolean, (open: boolean) => void] => {
  const [open, setOpenState] = useState(
    () => !readClosedSections().includes(key),
  );
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      try {
        const others = readClosedSections().filter((k) => k !== key);
        localStorage.setItem(
          SECTIONS_STORAGE_KEY,
          JSON.stringify(next ? others : [...others, key]),
        );
      } catch {
        // Not persisted; the in-memory state still applies for this visit.
      }
    },
    [key],
  );
  return [open, setOpen];
};
