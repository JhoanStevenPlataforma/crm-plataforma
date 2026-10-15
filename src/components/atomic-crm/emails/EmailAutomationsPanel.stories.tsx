import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";

import {
  DEMO_EMAIL_AUTOMATIONS,
  DEMO_EMAIL_TEMPLATES,
} from "../providers/fakerest/dataGenerator/emailTemplates";
import type { Db } from "../providers/fakerest/dataGenerator/types";
import { EmailAutomationsPanel } from "./EmailAutomationsPanel";

const meta = {
  title: "Atomic CRM/Emails/Automations",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const Panel = ({ canEdit }: { canEdit: boolean }) => (
  <StoryWrapper
    data={
      {
        email_automations: DEMO_EMAIL_AUTOMATIONS,
        email_templates: DEMO_EMAIL_TEMPLATES,
        sales: [
          {
            ...DEFAULT_USER,
            role: canEdit ? "admin" : "manager",
            avatar: DEFAULT_USER.avatar,
            disabled: false,
          },
        ],
      } as unknown as Partial<Db>
    }
  >
    <div className="p-4">
      <EmailAutomationsPanel canEdit={canEdit} />
    </div>
  </StoryWrapper>
);

/** The two seeded rules, switched off, as an administrator sets them. */
export const Automations = () => <Panel canEdit />;

/** The same rules as a manager reads them: nothing to switch. */
export const ReadOnly = () => <Panel canEdit={false} />;
