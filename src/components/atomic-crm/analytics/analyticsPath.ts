/**
 * Routes of the analytics module.
 *
 * Deliberately NOT at `/`: that path is react-admin's `dashboard` slot and is
 * already an operational home whose first job is onboarding — `Dashboard.tsx`
 * gates on the contact and note totals to render `DashboardStepper` steps 1 and
 * 2 on a fresh install. Replacing it would break first-run onboarding and the
 * separate `MobileDashboard`.
 *
 * `/analytics` rather than `/analytics-dashboard` because, unlike
 * `TEAMS_DASHBOARD_PATH`, there is no `analytics` resource for `/analytics/:id`
 * to collide with.
 *
 * Its own module so the header nav can link here without importing a page
 * component, which would pull four tabs' worth of charts into the layout chunk.
 */
export const ANALYTICS_PATH = "/analytics";
export const ANALYTICS_PIPELINE_PATH = "/analytics/pipeline";
export const ANALYTICS_LEADS_PATH = "/analytics/leads";
export const ANALYTICS_PRODUCTIVITY_PATH = "/analytics/productivity";

export type AnalyticsTab = "overview" | "pipeline" | "leads" | "productivity";

export const ANALYTICS_TABS: { tab: AnalyticsTab; path: string }[] = [
  { tab: "overview", path: ANALYTICS_PATH },
  { tab: "pipeline", path: ANALYTICS_PIPELINE_PATH },
  { tab: "leads", path: ANALYTICS_LEADS_PATH },
  { tab: "productivity", path: ANALYTICS_PRODUCTIVITY_PATH },
];
