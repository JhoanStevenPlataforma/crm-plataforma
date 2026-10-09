import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";

import { canAccess } from "../providers/commons/canAccess";
import type { CrmRole, HelpCategory, HelpTutorial } from "../types";
import { HelpCenterPage } from "./HelpCenterPage";

const meta = {
  title: "Atomic CRM/Help/Help Center",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const help_categories: HelpCategory[] = [
  {
    id: 1,
    slug: "quotes",
    title: "Quotations",
    description: "From the catalogue to the customer's answer.",
    icon: "file-signature",
    rank: 10,
  },
  {
    id: 2,
    slug: "customers",
    title: "Customers",
    description: "Companies and contacts.",
    icon: "users",
    rank: 20,
  },
  // Holds nothing: a heading with no tutorial under it is not shown.
  { id: 3, slug: "empty", title: "Coming later", icon: "rocket", rank: 30 },
];

const tutorial = (
  overrides: Partial<HelpTutorial> & Pick<HelpTutorial, "id" | "slug">,
): HelpTutorial => ({
  category_id: 1,
  title: "Untitled",
  steps: [],
  rank: 0,
  is_published: true,
  video_path: "video/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4",
  ...overrides,
});

const published: HelpTutorial[] = [
  tutorial({
    id: 1,
    slug: "create-a-product",
    title: "Create a product",
    description: "Add a product with its list price and its tax.",
    steps: ["Open Products.", "Press New product.", "Save."],
    duration_seconds: 95,
    rank: 10,
    updated_at: "2026-10-01T10:00:00.000Z",
  }),
  tutorial({
    id: 2,
    slug: "create-a-quote",
    title: "Create a quotation",
    description: "Customer, price list, lines and terms.",
    duration_seconds: 150,
    rank: 20,
  }),
  tutorial({
    id: 3,
    category_id: 2,
    slug: "add-a-company",
    title: "Añadir una compañía",
    description: "Register a customer.",
    rank: 10,
  }),
];

const draft = tutorial({
  id: 4,
  slug: "send-a-quote",
  title: "Send a quotation",
  is_published: false,
  video_path: null,
  rank: 30,
});

/** The application's own access rules, evaluated for one role. */
const asRole = (role: CrmRole) => ({
  canAccess: async (params: { action: string; resource: string }) =>
    canAccess(role, params),
});

/** What RLS leaves a rep: the published tutorials. */
export const AsSalesRep = () => (
  <StoryWrapper
    data={{ help_categories, help_tutorials: published }}
    authProvider={asRole("rep")}
  >
    <HelpCenterPage />
  </StoryWrapper>
);

/** An admin also receives the drafts, and the way to the admin screens. */
export const AsAdmin = () => (
  <StoryWrapper
    data={{ help_categories, help_tutorials: [...published, draft] }}
    authProvider={asRole("admin")}
  >
    <HelpCenterPage />
  </StoryWrapper>
);

export const Empty = () => (
  <StoryWrapper authProvider={asRole("rep")}>
    <HelpCenterPage />
  </StoryWrapper>
);
