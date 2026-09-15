import type { ConfigurationContextValue } from "./ConfigurationContext";
// Import the logos as module assets so Vite resolves their URL relative to the
// JS chunk (import.meta.url), not the current route. A plain "./logos/..." path
// breaks on nested routes like /oauth/consent and under a deployment sub-path.
// `_light` / `_dark` names the MODE the asset is for, not the colour of its
// ink: the dark-mode file is the one with white lettering. Both are cropped
// out of the brand-supplied artwork by scripts/compose-plataforma-logo.py,
// whose source files are named the other way round; do not swap these two on
// the strength of the source filenames.
import darkModeLogo from "./logos/logo_plataforma_dark.svg";
import lightModeLogo from "./logos/logo_plataforma_light.svg";

export const defaultDarkModeLogo = darkModeLogo;
export const defaultLightModeLogo = lightModeLogo;

export const defaultCurrency = "USD";

// The logo is a wordmark: it already carries the product name, so the title
// is no longer rendered beside it. It survives as the image `alt`, the
// browser tab and the name a rebranding installation overrides in Settings.
export const defaultTitle = "Plataforma Software";

export const defaultCompanySectors = [
  { value: "communication-services", label: "Communication Services" },
  { value: "consumer-discretionary", label: "Consumer Discretionary" },
  { value: "consumer-staples", label: "Consumer Staples" },
  { value: "energy", label: "Energy" },
  { value: "financials", label: "Financials" },
  { value: "health-care", label: "Health Care" },
  { value: "industrials", label: "Industrials" },
  { value: "information-technology", label: "Information Technology" },
  { value: "materials", label: "Materials" },
  { value: "real-estate", label: "Real Estate" },
  { value: "utilities", label: "Utilities" },
];

/**
 * `probability` is the weighting a stage contributes to a forecast, 0..1.
 *
 * These four values are exactly the ones `DealsChart.tsx` carried as a private
 * constant; moving them here is what makes the weighted pipeline tunable
 * without a deploy, and what stops the dashboard and the analytics module from
 * forecasting differently. `won` and `lost` are deliberately absent: a decided
 * deal is not a forecast, and every consumer of this list filters them out
 * before weighting anything.
 */
export const defaultDealStages = [
  { value: "opportunity", label: "Opportunity", probability: 0.2 },
  { value: "proposal-sent", label: "Proposal Sent", probability: 0.5 },
  { value: "in-negociation", label: "In Negotiation", probability: 0.8 },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "delayed", label: "Delayed", probability: 0.3 },
];

export const defaultDealPipelineStatuses = ["won"];

export const defaultDealCategories = [
  { value: "other", label: "Other" },
  { value: "copywriting", label: "Copywriting" },
  { value: "print-project", label: "Print project" },
  { value: "ui-design", label: "UI Design" },
  { value: "website-design", label: "Website design" },
];

export const defaultLeadSources = [
  { value: "web", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "event", label: "Event" },
  { value: "outbound", label: "Outbound" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];

// `converted` is set by convert_lead() and is not offered in the form.
export const defaultLeadStatuses = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
];

export const defaultNoteStatuses = [
  { value: "cold", label: "Cold", color: "#7dbde8" },
  { value: "warm", label: "Warm", color: "#e8cb7d" },
  { value: "hot", label: "Hot", color: "#e88b7d" },
  { value: "in-contract", label: "In Contract", color: "#a4e87d" },
];

export const defaultTaskTypes = [
  { value: "none", label: "None" },
  { value: "email", label: "Email" },
  { value: "demo", label: "Demo" },
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "follow-up", label: "Follow-up" },
  { value: "thank-you", label: "Thank you" },
  { value: "ship", label: "Ship" },
  { value: "call", label: "Call" },
];

/**
 * Units and categories are labels in the configuration rather than tables
 * (quotes §2.1): nothing references them by foreign key, and a quote line
 * freezes its unit as text. `unit` has to stay in the list, because it is the
 * column default on `public.products`.
 */
export const defaultProductUnits = [
  { value: "unit", label: "Unit" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "license", label: "License" },
  { value: "kg", label: "Kilogram" },
  { value: "m", label: "Meter" },
];

export const defaultProductCategories = [
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "services", label: "Professional services" },
  { value: "support", label: "Support" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
];

export const defaultConfiguration: ConfigurationContextValue = {
  companySectors: defaultCompanySectors,
  currency: defaultCurrency,
  dealCategories: defaultDealCategories,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealStages: defaultDealStages,
  leadSources: defaultLeadSources,
  leadStatuses: defaultLeadStatuses,
  noteStatuses: defaultNoteStatuses,
  productCategories: defaultProductCategories,
  productUnits: defaultProductUnits,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};
