import type {
  CoreAdminProps,
  AuthProvider,
  DashboardComponent,
  LayoutComponent,
} from "ra-core";
import type { ResourceProps } from "ra-core";
import { CustomRoutes, localStorageStore, Resource } from "ra-core";
import {
  createElement,
  isValidElement,
  useEffect,
  useMemo,
  type ComponentType,
  type ReactElement,
} from "react";
import { Route } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Admin } from "@/components/admin/admin";
import { ForgotPasswordPage } from "@/components/supabase/forgot-password-page";
import { SetPasswordPage } from "@/components/supabase/set-password-page";
import { OAuthConsentPage } from "@/components/supabase/oauth-consent-page";

import companies from "../companies";
import contacts from "../contacts";
import { AnalyticsLeads } from "../analytics/AnalyticsLeads";
import { AnalyticsOverview } from "../analytics/AnalyticsOverview";
import { AnalyticsPipeline } from "../analytics/AnalyticsPipeline";
import { AnalyticsProductivity } from "../analytics/AnalyticsProductivity";
import { ReportPage } from "../reports/ReportPage";
import { ReportPrintPage } from "../reports/ReportPrintPage";
import { ReportsLibrary } from "../reports/ReportsLibrary";
import { Dashboard } from "../dashboard/Dashboard";
import { MobileDashboard } from "../dashboard/MobileDashboard";
import deals from "../deals";
import leads from "../leads";
import { Layout } from "../layout/Layout";
import { MobileLayout } from "../layout/MobileLayout";
import { MobileDesktopPage } from "../layout/MobileContent";
import { SignupPage } from "../login/SignupPage";
import { ConfirmationRequired } from "../login/ConfirmationRequired";
import { ImportPage } from "../misc/ImportPage";
import {
  getAuthProvider as defaultAuthProviderBuilder,
  getDataProvider as defaultDataProviderBuilder,
} from "../providers/supabase";
import priceLists from "../priceLists";
import products from "../products";
import quotes from "../quotes";
import { QuotePortalPage } from "../quotes/portal/QuotePortalPage";
import { QuotePrintPage } from "../quotes/QuotePrintPage";
import { PortalSlidesPage } from "../portal/PortalSlidesPage";
import { StandardPresentationPreview } from "../portal/StandardPresentationPreview";
import sales from "../sales";
import taxRates from "../taxRates";
import teams from "../teams";
import { TeamMemberStatsPage } from "../teams/TeamMemberStatsPage";
import { TeamStatsPage } from "../teams/TeamStatsPage";
import { TeamsDashboard } from "../teams/TeamsDashboard";
import { ProfilePage } from "../settings/ProfilePage";
import { SettingsPage } from "../settings/SettingsPage";
import {
  CONFIGURATION_STORE_KEY,
  type ConfigurationContextValue,
} from "./ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import {
  defaultCompanySectors,
  defaultCurrency,
  defaultDarkModeLogo,
  defaultDealCategories,
  defaultDealPipelineStatuses,
  defaultDealStages,
  defaultLeadSources,
  defaultLeadStatuses,
  defaultLightModeLogo,
  defaultNoteStatuses,
  defaultProductCategories,
  defaultProductUnits,
  defaultTaskTypes,
  defaultTitle,
} from "./defaultConfiguration";
import { i18nProvider as defaulti18nProvider } from "../providers/commons/i18nProvider";
import { StartPage } from "../login/StartPage.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { TaskList } from "../tasks/TaskList.tsx";

const defaultStore = localStorageStore(undefined, "CRM");

export type CRMProps = {
  dataProvider?: CrmDataProvider;
  authProvider?: AuthProvider;
  i18nProvider?: CoreAdminProps["i18nProvider"];
  disableTelemetry?: boolean;
  store?: CoreAdminProps["store"];
  dashboard?: DashboardComponent;
  layout?: LayoutComponent;
} & Partial<ConfigurationContextValue>;

/**
 * CRM Component
 *
 * This component sets up and renders the main CRM application using `ra-core`. It provides
 * default configurations and themes but allows for customization through props. The component
 * seeds the store with any custom prop values for backwards compatibility.
 *
 * @param {LabeledValue[]} companySectors - The list of company sectors used in the application.
 * @param {string} currency - The ISO 4217 currency code used to format monetary values (e.g. "USD", "EUR", "GBP").
 * @param {RaThemeOptions} darkTheme - The theme to use when the application is in dark mode.
 * @param {LabeledValue[]} dealCategories - The categories of deals used in the application.
 * @param {string[]} dealPipelineStatuses - The statuses of deals in the pipeline used in the application.
 * @param {DealStage[]} dealStages - The stages of deals used in the application.
 * @param {RaThemeOptions} lightTheme - The theme to use when the application is in light mode.
 * @param {string} darkModeLogo - Logo shown in dark mode and on the auth pages. Must be an imported asset, an absolute URL, or a data URI — never a route-relative path like "./logos/x.svg", which breaks on nested routes such as /oauth/consent (issue #291).
 * @param {string} lightModeLogo - Logo shown in light mode. Same rule as darkModeLogo: imported asset, absolute URL, or data URI only.
 * @param {NoteStatus[]} noteStatuses - The statuses of notes used in the application.
 * @param {LabeledValue[]} taskTypes - The types of tasks used in the application.
 * @param {string} title - The title of the CRM application.
 *
 * @returns {JSX.Element} The rendered CRM application.
 *
 * @example
 * // Basic usage of the CRM component
 * import { CRM } from '@/components/atomic-crm/dashboard/CRM';
 *
 * const App = () => (
 *     <CRM
 *         darkModeLogo="https://example.com/logo-dark.svg"
 *         lightModeLogo="https://example.com/logo-light.svg"
 *         title="My Custom CRM"
 *         lightTheme={{
 *             ...defaultTheme,
 *             palette: {
 *                 primary: { main: '#0000ff' },
 *             },
 *         }}
 *     />
 * );
 *
 * export default App;
 */
export const CRM = ({
  companySectors = defaultCompanySectors,
  currency = defaultCurrency,
  dealCategories = defaultDealCategories,
  dealPipelineStatuses = defaultDealPipelineStatuses,
  dealStages = defaultDealStages,
  leadSources = defaultLeadSources,
  leadStatuses = defaultLeadStatuses,
  darkModeLogo = defaultDarkModeLogo,
  lightModeLogo = defaultLightModeLogo,
  noteStatuses = defaultNoteStatuses,
  productCategories = defaultProductCategories,
  productUnits = defaultProductUnits,
  taskTypes = defaultTaskTypes,
  title = defaultTitle,
  dataProvider = defaultDataProviderBuilder(),
  authProvider = defaultAuthProviderBuilder(),
  i18nProvider = defaulti18nProvider,
  store = defaultStore,
  disableTelemetry,
  ...rest
}: CRMProps) => {
  useEffect(() => {
    if (
      disableTelemetry ||
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      typeof window.location === "undefined" ||
      typeof Image === "undefined"
    ) {
      return;
    }
    const img = new Image();
    img.src = `https://atomic-crm-telemetry.marmelab.com/atomic-crm-telemetry?domain=${window.location.hostname}`;
  }, [disableTelemetry]);

  // Seed the store with CRM prop values if not already stored
  // (backwards compatibility for prop-based config)
  useEffect(() => {
    if (!store.getItem(CONFIGURATION_STORE_KEY)) {
      store.setItem(CONFIGURATION_STORE_KEY, {
        companySectors,
        currency,
        dealCategories,
        dealPipelineStatuses,
        dealStages,
        leadSources,
        leadStatuses,
        noteStatuses,
        productCategories,
        productUnits,
        taskTypes,
        title,
        darkModeLogo,
        lightModeLogo,
      } satisfies ConfigurationContextValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const isMobile = useIsMobile();

  // on login, pre-fetch the configuration to avoid a flickering
  // when accessing the app for the first time
  const wrappedAuthProvider = useMemo<AuthProvider>(
    () => ({
      ...authProvider,
      login: async (params: any) => {
        const result = await authProvider.login(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      handleCallback: async (params: any) => {
        if (!authProvider.handleCallback) {
          throw new Error(
            "handleCallback is not implemented in the authProvider",
          );
        }
        const result = await authProvider.handleCallback(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      logout: async (params: any) => {
        try {
          store.removeItem(CONFIGURATION_STORE_KEY);
        } catch {
          // Ignore
        }
        return authProvider.logout(params);
      },
    }),
    [authProvider, dataProvider, store],
  );

  const ResponsiveAdmin = isMobile ? MobileAdmin : DesktopAdmin;

  return (
    <ResponsiveAdmin
      dataProvider={dataProvider}
      authProvider={wrappedAuthProvider}
      i18nProvider={i18nProvider}
      store={store}
      loginPage={StartPage}
      requireAuth
      disableTelemetry
      {...rest}
    />
  );
};

const DesktopAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  return (
    <Admin
      layout={props.layout ?? Layout}
      dashboard={props.dashboard ?? Dashboard}
      {...props}
    >
      <CustomRoutes noLayout>
        <Route path={SignupPage.path} element={<SignupPage />} />
        <Route
          path={ConfirmationRequired.path}
          element={<ConfirmationRequired />}
        />
        <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
        <Route
          path={ForgotPasswordPage.path}
          element={<ForgotPasswordPage />}
        />
        <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
        {/* The customer portal (docs/proposals/quotes-cpq-module.md, Phase 7).
            Outside the layout on purpose, unlike the print route: a customer
            has no session, and the page takes its branding from the server's
            payload rather than from the configuration loader. */}
        <Route path={QuotePortalPage.path} element={<QuotePortalPage />} />
        {/* The default portal template, full screen, for the admin to preview. */}
        <Route
          path={StandardPresentationPreview.path}
          element={<StandardPresentationPreview />}
        />
      </CustomRoutes>

      <CustomRoutes>
        <Route path={SettingsPage.path} element={<SettingsPage />} />
        {sharedRoutes(asIs)}
      </CustomRoutes>
      <Resource name="contacts" {...contacts} />
      <Resource name="companies" {...companies} />
      <Resource name="tasks" list={TaskList} />
      {sharedResources(asIs)}
    </Admin>
  );
};

type Wrap = (element: ReactElement) => ReactElement;
const asIs: Wrap = (element) => element;
const inMobileFrame: Wrap = (element) => (
  <MobileDesktopPage>{element}</MobileDesktopPage>
);

type ResourceViews = Pick<ResourceProps, "list" | "show" | "edit" | "create">;

/**
 * Frames every view of a resource definition. A view may be a component or an
 * element; both are turned into an element, which `<Resource>` accepts.
 */
const wrapViews = <T extends ResourceViews>(definition: T, wrap: Wrap): T => {
  const frame = (view: ResourceViews["list"]) => {
    if (view == null) return undefined;
    const element = isValidElement(view)
      ? view
      : createElement(view as ComponentType);
    return wrap(element);
  };
  return {
    ...definition,
    list: frame(definition.list),
    show: frame(definition.show),
    edit: frame(definition.edit),
    create: frame(definition.create),
  };
};

/**
 * The routes both admins serve. The phone used to get a hand-picked subset,
 * and every other link answered "Not found": a rep could not open a deal or a
 * quotation from their phone. The desktop screens are responsive enough to be
 * useful there, so the phone now serves them too, framed for the bottom
 * navigation.
 */
const sharedRoutes = (wrap: Wrap) => [
  <Route
    key="profile"
    path={ProfilePage.path}
    element={wrap(<ProfilePage />)}
  />,
  // The customer portal's slides (quote-portal-presentation.md §7).
  <Route
    key="portal"
    path={PortalSlidesPage.path}
    element={wrap(<PortalSlidesPage />)}
  />,
  <Route key="import" path={ImportPage.path} element={wrap(<ImportPage />)} />,
  // The analytics module. Four sibling routes rather than a nested layout:
  // `CustomRoutes` renders its children inside one `Routes`, and each page
  // composes `AnalyticsLayout` itself, so there is no `Outlet` to get wrong.
  <Route
    key="analytics"
    path={AnalyticsOverview.path}
    element={wrap(<AnalyticsOverview />)}
  />,
  <Route
    key="analytics-pipeline"
    path={AnalyticsPipeline.path}
    element={wrap(<AnalyticsPipeline />)}
  />,
  <Route
    key="analytics-leads"
    path={AnalyticsLeads.path}
    element={wrap(<AnalyticsLeads />)}
  />,
  <Route
    key="analytics-productivity"
    path={AnalyticsProductivity.path}
    element={wrap(<AnalyticsProductivity />)}
  />,
  // The reports module. `/reports/new` is declared BEFORE `/reports/:reportId`
  // — react-router ranks static segments above dynamic ones, so the order is
  // not what makes this work, but keeping them adjacent is what makes the pair
  // readable. Both mount the same page: a new report is a saved one with no id.
  <Route
    key="reports"
    path={ReportsLibrary.path}
    element={wrap(<ReportsLibrary />)}
  />,
  <Route
    key="reports-new"
    path={ReportPage.newPath}
    element={wrap(<ReportPage />)}
  />,
  <Route
    key="reports-print"
    path={ReportPrintPage.path}
    element={wrap(<ReportPrintPage />)}
  />,
  <Route
    key="reports-detail"
    path={ReportPage.detailPath}
    element={wrap(<ReportPage />)}
  />,
  <Route
    key="teams-dashboard"
    path={TeamsDashboard.path}
    element={wrap(<TeamsDashboard />)}
  />,
  <Route
    key="team-stats"
    path={TeamStatsPage.path}
    element={wrap(<TeamStatsPage />)}
  />,
  <Route
    key="team-member-stats"
    path={TeamMemberStatsPage.path}
    element={wrap(<TeamMemberStatsPage />)}
  />,
];

const sharedResources = (wrap: Wrap) => [
  <Resource key="leads" name="leads" {...wrapViews(leads, wrap)} />,
  <Resource key="deals" name="deals" {...wrapViews(deals, wrap)} />,
  <Resource key="contact_notes" name="contact_notes" />,
  <Resource key="deal_notes" name="deal_notes" />,
  <Resource key="sales" name="sales" {...wrapViews(sales, wrap)} />,
  <Resource key="teams" name="teams" {...wrapViews(teams, wrap)} />,
  <Resource key="team_members" name="team_members" />,
  <Resource key="team_budgets" name="team_budgets" />,
  <Resource key="team_member_budgets" name="team_member_budgets" />,
  // Read-only aggregate behind the dashboard drill-downs.
  <Resource key="team_deal_stats" name="team_deal_stats" />,
  <Resource key="tags" name="tags" />,
  // The quotes catalogue (docs/proposals/quotes-cpq-module.md, Phase 3). A
  // list's prices are edited inside the list, so `price_list_items` has no
  // screen of its own.
  <Resource key="products" name="products" {...wrapViews(products, wrap)} />,
  <Resource
    key="price_lists"
    name="price_lists"
    {...wrapViews(priceLists, wrap)}
  />,
  <Resource key="price_list_items" name="price_list_items" />,
  <Resource key="tax_rates" name="tax_rates" {...wrapViews(taxRates, wrap)} />,
  // Quotations (docs/proposals/quotes-cpq-module.md, Phase 4). The versions,
  // the lines and the status catalogue have no screen of their own: a version
  // is edited through its quote, and `quote_statuses` is read by the list
  // filter. `price_book` is the line picker's view. The print route (Phase 6)
  // is a child of the resource: `:id/print` outranks the editor's `:id/*`,
  // because a static segment beats a splat. It stays INSIDE the layout on
  // purpose — only the layouts run the configuration loader, so a `noLayout`
  // route would print the default letterhead instead of this installation's.
  <Resource key="quotes" name="quotes" {...wrapViews(quotes, wrap)}>
    <Route path=":id/print" element={wrap(<QuotePrintPage />)} />
  </Resource>,
  <Resource key="quote_versions" name="quote_versions" />,
  <Resource key="quote_lines" name="quote_lines" />,
  // The negotiation thread (Phase 8), rendered on the quote's page.
  <Resource key="quote_comments" name="quote_comments" />,
  <Resource
    key="quote_statuses"
    name="quote_statuses"
    recordRepresentation="label"
  />,
  // The status machine as data (Phase 5): the quote toolbar reads the legal
  // edges from it instead of hardcoding which button a status offers.
  // `quote_access_tokens_summary` is the readable projection of a table nobody
  // may select — it omits the hash.
  <Resource key="quote_transitions" name="quote_transitions" />,
  <Resource
    key="quote_access_tokens_summary"
    name="quote_access_tokens_summary"
  />,
  <Resource key="price_book" name="price_book" />,
  <Resource key="portal_templates" name="portal_templates" />,
  <Resource key="portal_slides" name="portal_slides" />,
];

const MobileAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        networkMode: "offlineFirst",
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });
  const asyncStoragePersister = createAsyncStoragePersister({
    storage: localStorage,
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <Admin
        queryClient={queryClient}
        layout={props.layout ?? MobileLayout}
        dashboard={props.dashboard ?? MobileDashboard}
        {...props}
      >
        <CustomRoutes noLayout>
          <Route path={SignupPage.path} element={<SignupPage />} />
          <Route
            path={ConfirmationRequired.path}
            element={<ConfirmationRequired />}
          />
          <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
          <Route
            path={ForgotPasswordPage.path}
            element={<ForgotPasswordPage />}
          />
          <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
          {/* A customer opens a quotation link on a phone as often as on a
              desk: the portal is registered on both admins. */}
          <Route path={QuotePortalPage.path} element={<QuotePortalPage />} />
        </CustomRoutes>
        <CustomRoutes>
          <Route
            path={SettingsPage.path}
            element={inMobileFrame(<SettingsPage />)}
          />
          {sharedRoutes(inMobileFrame)}
        </CustomRoutes>
        {/* The phone serves the same screens as the desk, framed for the
            bottom navigation: a reduced mobile copy of a screen is one that
            silently falls behind the real one. */}
        <Resource name="contacts" {...wrapViews(contacts, inMobileFrame)} />
        <Resource name="companies" {...wrapViews(companies, inMobileFrame)} />
        <Resource name="tasks" list={inMobileFrame(<TaskList />)} />
        {sharedResources(inMobileFrame)}
      </Admin>
    </PersistQueryClientProvider>
  );
};
