import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";
import { DEFAULT_USER } from "@/components/atomic-crm/providers/fakerest/authProvider";

import { DEMO_EMAIL_TEMPLATES } from "../providers/fakerest/dataGenerator/emailTemplates";
import type { Db } from "../providers/fakerest/dataGenerator/types";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";

const meta = {
  title: "Atomic CRM/Emails/Templates",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

/** The seeded quotation templates, as an administrator manages them. */
export const Templates = () => (
  <StoryWrapper
    data={
      {
        email_templates: DEMO_EMAIL_TEMPLATES,
        sales: [
          {
            ...DEFAULT_USER,
            role: "admin",
            avatar: DEFAULT_USER.avatar,
            disabled: false,
          },
        ],
      } as unknown as Partial<Db>
    }
  >
    <div className="p-4">
      <EmailTemplatesPanel />
    </div>
  </StoryWrapper>
);
