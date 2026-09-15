import {
  BarChart3,
  Building2,
  Contact,
  FileBarChart,
  FileSignature,
  FileText,
  Import,
  LayoutDashboard,
  ListTodo,
  Package,
  Percent,
  PieChart,
  Settings,
  Tags,
  Target,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ANALYTICS_PATH } from "../analytics/analyticsPath";
import { REPORTS_PATH } from "../reports/reportsPath";
import { TEAMS_DASHBOARD_PATH } from "../teams/teamsDashboardPath";

/**
 * Written out rather than imported from the page modules that declare them
 * (`SettingsPage.path` and friends). Importing a page here to read one string
 * pulls that whole page into the layout chunk, so the settings forms and the
 * changelog would load before the first screen paints. The pages keep declaring
 * the route they mount on; these are the menu's links to them.
 */
const SETTINGS_PATH = "/settings";
const IMPORT_PATH = "/import";
const CHANGELOG_PATH = "/changelog";

/**
 * The sidebar menu, as data.
 *
 * Written by hand rather than derived from `useResourceDefinitions()`, which is
 * what `admin/app-sidebar.tsx` does. That hook can only produce a flat list of
 * resources, and half of this menu is not a resource: analytics, the team
 * dashboard, settings, import and the changelog are all `CustomRoutes`. Deriving
 * the menu would silently drop them, which is how they ended up buried in the
 * avatar dropdown in the first place.
 *
 * Adding a module later is one entry in this file. Nothing else in the layout
 * knows the shape of the menu.
 */

export type NavItem = {
  /** Stable identity for React keys and for tests to hold on to. */
  key: string;
  /** i18n key; resolved at render time so the menu follows the locale. */
  labelKey: string;
  /** Polyglot interpolation, e.g. `{ smart_count: 2 }` for a plural resource. */
  labelOptions?: Record<string, unknown>;
  to: string;
  /**
   * Route pattern that lights this item up. Separate from `to` because the item
   * must stay active on `/deals/12/show`, not only on `/deals` -- and because
   * the dashboard has to match `/` EXACTLY or it would be active everywhere.
   */
  match: string;
  /** True when `match` should only light up on an exact path equality. */
  matchEnd?: boolean;
  icon: LucideIcon;
  /**
   * `canAccess` gate. A hidden menu entry is not an access control -- every one
   * of these routes gates itself as well -- but showing a rep a link that
   * answers 403 is its own bug.
   */
  access?: { resource: string; action: string };
};

export type NavSection = {
  key: string;
  /** Section heading; the six groups the CRM is organised into. */
  labelKey: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "home",
    labelKey: "crm.navigation.groups.home",
    items: [
      {
        key: "dashboard",
        labelKey: "ra.page.dashboard",
        to: "/",
        match: "/",
        matchEnd: true,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    key: "sales",
    labelKey: "crm.navigation.groups.sales",
    items: [
      // Leads sit before deals: they are the top of the funnel and convert into
      // a contact, a company and an opportunity.
      {
        key: "leads",
        labelKey: "resources.leads.name",
        labelOptions: { smart_count: 2 },
        to: "/leads",
        match: "/leads/*",
        icon: UserPlus,
        access: { resource: "leads", action: "list" },
      },
      {
        key: "deals",
        labelKey: "resources.deals.name",
        labelOptions: { smart_count: 2 },
        to: "/deals",
        match: "/deals/*",
        icon: Target,
        access: { resource: "deals", action: "list" },
      },
      // Quotations sit with the deals they are raised against, before the
      // catalogue they are priced from.
      {
        key: "quotes",
        labelKey: "resources.quotes.name",
        labelOptions: { smart_count: 2 },
        to: "/quotes",
        match: "/quotes/*",
        icon: FileSignature,
        access: { resource: "quotes", action: "list" },
      },
      // The catalogue quotes are priced from. Gated on `list`, not on `edit`
      // like teams: reps read it, because they quote from it (quotes §7).
      {
        key: "products",
        labelKey: "resources.products.name",
        labelOptions: { smart_count: 2 },
        to: "/products",
        match: "/products/*",
        icon: Package,
        access: { resource: "products", action: "list" },
      },
      {
        key: "price_lists",
        labelKey: "resources.price_lists.name",
        labelOptions: { smart_count: 2 },
        to: "/price_lists",
        match: "/price_lists/*",
        icon: Tags,
        access: { resource: "price_lists", action: "list" },
      },
    ],
  },
  {
    key: "customers",
    labelKey: "crm.navigation.groups.customers",
    items: [
      {
        key: "contacts",
        labelKey: "resources.contacts.name",
        labelOptions: { smart_count: 2 },
        to: "/contacts",
        match: "/contacts/*",
        icon: Contact,
        access: { resource: "contacts", action: "list" },
      },
      {
        key: "companies",
        labelKey: "resources.companies.name",
        labelOptions: { smart_count: 2 },
        to: "/companies",
        match: "/companies/*",
        icon: Building2,
        access: { resource: "companies", action: "list" },
      },
    ],
  },
  {
    key: "activities",
    labelKey: "crm.navigation.groups.activities",
    items: [
      // The task page already carries its own list / kanban / calendar tabs, so
      // the section holds one entry rather than repeating those three here.
      {
        key: "tasks",
        labelKey: "resources.tasks.name",
        labelOptions: { smart_count: 2 },
        to: "/tasks",
        match: "/tasks/*",
        icon: ListTodo,
        access: { resource: "tasks", action: "list" },
      },
    ],
  },
  {
    key: "analytics",
    labelKey: "crm.navigation.groups.analytics",
    items: [
      // Ungated on purpose: every aggregate behind this page is SECURITY
      // INVOKER, so a rep sees their own figures and a manager sees the
      // company's. Hiding it would teach reps the CRM has reporting they may
      // not open, which is false.
      {
        key: "analytics",
        labelKey: "crm.analytics.title",
        to: ANALYTICS_PATH,
        match: "/analytics/*",
        icon: BarChart3,
      },
      // Reports sit next to analytics because they answer the follow-up
      // question, not a different one: the summary is where a problem is
      // noticed, this is where it is taken apart. Ungated for the same reason
      // analytics is -- `run_report` is SECURITY INVOKER, so a rep builds
      // reports over their own rows and a manager over the company's. Hiding it
      // would teach reps the CRM has reporting they may not open, which is
      // false.
      {
        key: "reports",
        labelKey: "crm.reports.title",
        to: REPORTS_PATH,
        match: "/reports/*",
        icon: FileBarChart,
      },
      // The team dashboard answers budget-against-reality and is scoped to a
      // budget period; the module above is company-wide over a chosen range.
      // They will disagree, legitimately, so they stay two entries.
      {
        key: "teams-dashboard",
        labelKey: "crm.teams_dashboard.title",
        to: TEAMS_DASHBOARD_PATH,
        match: "/teams-dashboard/*",
        icon: PieChart,
        access: { resource: "teams", action: "edit" },
      },
    ],
  },
  {
    key: "settings",
    labelKey: "crm.navigation.groups.settings",
    items: [
      {
        key: "sales",
        labelKey: "resources.sales.name",
        labelOptions: { smart_count: 2 },
        to: "/sales",
        match: "/sales/*",
        icon: Users,
        access: { resource: "sales", action: "list" },
      },
      {
        key: "teams",
        labelKey: "resources.teams.name",
        labelOptions: { smart_count: 2 },
        to: "/teams",
        match: "/teams/*",
        icon: UsersRound,
        access: { resource: "teams", action: "edit" },
      },
      // Maintained here by managers. A rep never needs the page: the rate a
      // product carries is shown on the product itself.
      {
        key: "tax_rates",
        labelKey: "resources.tax_rates.name",
        labelOptions: { smart_count: 2 },
        to: "/tax_rates",
        match: "/tax_rates/*",
        icon: Percent,
        access: { resource: "tax_rates", action: "edit" },
      },
      {
        key: "preferences",
        labelKey: "crm.settings.title",
        to: SETTINGS_PATH,
        match: "/settings/*",
        icon: Settings,
        access: { resource: "configuration", action: "edit" },
      },
      {
        key: "import",
        labelKey: "crm.header.import_data",
        to: IMPORT_PATH,
        match: "/import/*",
        icon: Import,
      },
      {
        key: "changelog",
        labelKey: "crm.changelog.title",
        to: CHANGELOG_PATH,
        match: "/changelog/*",
        icon: FileText,
      },
    ],
  },
];
