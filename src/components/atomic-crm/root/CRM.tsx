import type {
  CoreAdminProps,
  AuthProvider,
  DashboardComponent,
  LayoutComponent,
} from "ra-core";
import { CustomRoutes, localStorageStore, Resource } from "ra-core";
import { useEffect, useMemo } from "react";
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
import { SignupPage } from "../login/SignupPage";
import { ConfirmationRequired } from "../login/ConfirmationRequired";
import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import {
  getAuthProvider as defaultAuthProviderBuilder,
  getDataProvider as defaultDataProviderBuilder,
} from "../providers/supabase";
import priceLists from "../priceLists";
import products from "../products";
import quotes from "../quotes";
import { QuotePortalPage } from "../quotes/portal/QuotePortalPage";
import { QuotePrintPage } from "../quotes/QuotePrintPage";
import sales from "../sales";
import taxRates from "../taxRates";
import teams from "../teams";
import { TeamMemberStatsPage } from "../teams/TeamMemberStatsPage";
import { TeamStatsPage } from "../teams/TeamStatsPage";
import { TeamsDashboard } from "../teams/TeamsDashboard";
import { SettingsPageMobile } from "../settings/SettingsPageMobile";
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
import { MobileTasksList } from "../tasks/MobileTasksList.tsx";
import { TaskList } from "../tasks/TaskList.tsx";
import { ContactListMobile } from "../contacts/ContactList.tsx";
import { ContactShow } from "../contacts/ContactShow.tsx";
import { CompanyShow } from "../companies/CompanyShow.tsx";
import { NoteShowPage } from "../notes/NoteShowPage.tsx";

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
      </CustomRoutes>

      <CustomRoutes>
        <Route path={ProfilePage.path} element={<ProfilePage />} />
        <Route path={SettingsPage.path} element={<SettingsPage />} />
        <Route path={ImportPage.path} element={<ImportPage />} />
        <Route path={ChangelogPage.path} element={<ChangelogPage />} />
        {/* The analytics module. Four sibling routes rather than a nested
            layout: `CustomRoutes` renders its children inside one `Routes`,
            and each page composes `AnalyticsLayout` itself, so there is no
            `Outlet` to get wrong. Not registered on the mobile admin: these
            are wide charts, and `MobileAdmin` has its own reduced route set. */}
        <Route path={AnalyticsOverview.path} element={<AnalyticsOverview />} />
        <Route path={AnalyticsPipeline.path} element={<AnalyticsPipeline />} />
        <Route path={AnalyticsLeads.path} element={<AnalyticsLeads />} />
        <Route
          path={AnalyticsProductivity.path}
          element={<AnalyticsProductivity />}
        />
        {/* The reports module. `/reports/new` is declared BEFORE
            `/reports/:reportId` — react-router ranks static segments above
            dynamic ones, so the order is not what makes this work, but keeping
            them adjacent is what makes the pair readable. Both mount the same
            page: a new report is a saved one with no id. */}
        <Route path={ReportsLibrary.path} element={<ReportsLibrary />} />
        <Route path={ReportPage.newPath} element={<ReportPage />} />
        <Route path={ReportPrintPage.path} element={<ReportPrintPage />} />
        <Route path={ReportPage.detailPath} element={<ReportPage />} />
        <Route path={TeamsDashboard.path} element={<TeamsDashboard />} />
        <Route path={TeamStatsPage.path} element={<TeamStatsPage />} />
        <Route
          path={TeamMemberStatsPage.path}
          element={<TeamMemberStatsPage />}
        />
      </CustomRoutes>
      <Resource name="leads" {...leads} />
      <Resource name="deals" {...deals} />
      <Resource name="contacts" {...contacts} />
      <Resource name="companies" {...companies} />
      <Resource name="contact_notes" />
      <Resource name="deal_notes" />
      <Resource name="tasks" list={TaskList} />
      <Resource name="sales" {...sales} />
      <Resource name="teams" {...teams} />
      <Resource name="team_members" />
      <Resource name="team_budgets" />
      <Resource name="team_member_budgets" />
      {/* Read-only aggregate behind the dashboard drill-downs. */}
      <Resource name="team_deal_stats" />
      <Resource name="tags" />
      {/* The quotes catalogue (docs/proposals/quotes-cpq-module.md, Phase 3).
          A list's prices are edited inside the list, so `price_list_items`
          has no screen of its own. */}
      <Resource name="products" {...products} />
      <Resource name="price_lists" {...priceLists} />
      <Resource name="price_list_items" />
      <Resource name="tax_rates" {...taxRates} />
      {/* Quotations (docs/proposals/quotes-cpq-module.md, Phase 4). The
          versions, the lines and the status catalogue have no screen of their
          own: a version is edited through its quote, and `quote_statuses` is
          read by the list filter. `price_book` is the line picker's view.
          The print route (Phase 6) is a child of the resource: `:id/print`
          outranks the editor's `:id/*`, because a static segment beats a splat.
          It stays INSIDE the layout on purpose — only `Layout` runs the
          configuration loader, so a `noLayout` route would print the default
          letterhead instead of this installation's. */}
      <Resource name="quotes" {...quotes}>
        <Route path=":id/print" element={<QuotePrintPage />} />
      </Resource>
      <Resource name="quote_versions" />
      <Resource name="quote_lines" />
      <Resource name="quote_statuses" recordRepresentation="label" />
      {/* The status machine as data (Phase 5): the quote toolbar reads the
          legal edges from it instead of hardcoding which button a status
          offers. `quote_access_tokens_summary` is the readable projection of a
          table nobody may select — it omits the hash. */}
      <Resource name="quote_transitions" />
      <Resource name="quote_access_tokens_summary" />
      <Resource name="price_book" />
    </Admin>
  );
};

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
            path={SettingsPageMobile.path}
            element={<SettingsPageMobile />}
          />
          <Route path={ChangelogPage.path} element={<ChangelogPage />} />
        </CustomRoutes>
        <Resource
          name="contacts"
          list={ContactListMobile}
          show={ContactShow}
          recordRepresentation={contacts.recordRepresentation}
        >
          <Route path=":id/notes/:noteId" element={<NoteShowPage />} />
        </Resource>
        <Resource name="companies" show={CompanyShow} />
        <Resource name="tasks" list={MobileTasksList} />
      </Admin>
    </PersistQueryClientProvider>
  );
};
