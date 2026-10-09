import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";

import { DEMO_EMAIL_TEMPLATES } from "../providers/fakerest/dataGenerator/emailTemplates";
import type { Db } from "../providers/fakerest/dataGenerator/types";
import {
  companies,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "../quotes/quoteFixtures";
import { EntityEmailsPanel } from "./EntityEmailsPanel";

const meta = {
  title: "Atomic CRM/Emails/Send email",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Role = "rep" | "manager" | "admin";

const contact = {
  id: 1,
  first_name: "Ana",
  last_name: "Compras",
  company_id: 1,
  sales_id: DEFAULT_USER.id,
  email_jsonb: [{ email: "ana.compras@acme-andina.test", type: "Work" }],
  phone_jsonb: [],
  tags: [],
};

const dbFor = (
  role: Role,
  version: Record<string, unknown>,
  status: string,
): Partial<Db> =>
  ({
    companies,
    contacts: [contact],
    quote_statuses: quoteStatuses,
    quotes: [{ ...quotes[0], contact_id: 1, status_key: status }],
    quote_versions: [
      {
        ...quoteVersions[0],
        party_snapshot: {
          company: { name: "Acme Andina" },
          contact: { first_name: "Ana", last_name: "Compras" },
        },
        ...version,
      },
    ],
    quote_lines: quoteLines,
    email_templates: DEMO_EMAIL_TEMPLATES,
    email_messages: [],
    sales: [
      { ...DEFAULT_USER, role, avatar: DEFAULT_USER.avatar, disabled: false },
    ],
  }) as unknown as Partial<Db>;

const Panel = ({
  role = "rep",
  version = { issued_at: "2026-10-01T15:00:00.000Z" },
  status = "sent",
}: {
  role?: Role;
  version?: Record<string, unknown>;
  status?: string;
}) => (
  <StoryWrapper
    data={dbFor(role, version, status)}
    authProvider={{
      getIdentity: async () => ({
        id: DEFAULT_USER.id,
        fullName: `${DEFAULT_USER.first_name} ${DEFAULT_USER.last_name}`,
        role,
      }),
    }}
  >
    <div className="max-w-sm p-4">
      <EntityEmailsPanel
        entityType="quote"
        entityId={quotes[0].id}
        sendLabel="crm.email.action.send_quote"
      />
    </div>
  </StoryWrapper>
);

/** An issued quotation, as the rep who owns it. */
export const IssuedQuote = () => <Panel />;

/** The same, as a manager: a free address may be typed. */
export const IssuedQuoteAsManager = () => <Panel role="manager" />;

/** Never issued: there is nothing to share, and the dialog says so. */
export const DraftQuote = () => (
  <Panel version={{ issued_at: null }} status="draft" />
);
