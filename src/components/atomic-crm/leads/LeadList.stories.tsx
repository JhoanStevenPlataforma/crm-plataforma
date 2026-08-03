import type { Meta } from "@storybook/react-vite";
import { ResourceContextProvider } from "ra-core";

import { LeadList } from "./LeadList";

import { StoryWrapper, buildLead } from "@/test/StoryWrapper";

const meta = {
  title: "Atomic CRM/Leads/Lead List",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const companies = [{ id: 42, name: "Empresa Vinculada" }] as never;

const leads = [
  buildLead({
    company_name: "Prospect Industries",
    first_name: "Lucia",
    id: 1,
    last_name: "Prospect",
    status: "qualified",
  }),
  // Linked to a real company record rather than naming one in free text.
  buildLead({
    company_id: 42,
    company_name: "",
    first_name: "Nuria",
    id: 4,
    last_name: "Vinculada",
    status: "contacted",
  }),
  buildLead({
    company_name: "Ajena SL",
    email: "marco@ajena.example",
    first_name: "Marco",
    id: 2,
    last_name: "Lejano",
    source: "referral",
    status: "new",
  }),
  buildLead({
    company_name: "Convertida SA",
    converted_at: "2025-02-01T09:00:00.000Z",
    converted_contact_id: 99,
    first_name: "Ya",
    id: 3,
    last_name: "Convertida",
    status: "converted",
  }),
];

export const Success = () => (
  <StoryWrapper data={{ leads, companies }}>
    <ResourceContextProvider value="leads">
      <LeadList />
    </ResourceContextProvider>
  </StoryWrapper>
);

/**
 * A sales rep cannot reassign records, so the bulk "Assign to" button must not
 * appear for them even with a selection.
 */
export const AsSalesRep = () => (
  <StoryWrapper
    data={{ leads, companies }}
    authProvider={{ canAccess: async ({ action }) => action !== "assign" }}
  >
    <ResourceContextProvider value="leads">
      <LeadList />
    </ResourceContextProvider>
  </StoryWrapper>
);
