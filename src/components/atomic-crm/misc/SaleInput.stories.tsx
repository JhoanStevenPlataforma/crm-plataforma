import type { Meta } from "@storybook/react-vite";
import { CreateBase, Form, ResourceContextProvider } from "ra-core";

import { SaleInput } from "./SaleInput";
import { StoryWrapper } from "@/test/StoryWrapper";

const meta = {
  title: "Atomic CRM/Misc/Sale Input",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const sales = [
  {
    id: 0,
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    role: "manager",
    disabled: false,
    user_id: "0",
  },
  {
    id: 1,
    first_name: "Raul",
    last_name: "Rep",
    email: "raul@example.com",
    role: "rep",
    disabled: false,
    user_id: "1",
  },
] as never;

const CreateFormWithOwner = () => (
  <ResourceContextProvider value="contacts">
    <CreateBase>
      {/* A truthy owner id on purpose: the reset button is only rendered when
          there is a value, and id 0 would silently skip that branch. */}
      <Form defaultValues={{ sales_id: 1 }}>
        <SaleInput />
      </Form>
    </CreateBase>
  </ResourceContextProvider>
);

/** A user who may reassign records can pick the owner. */
export const AsManager = () => (
  <StoryWrapper data={{ sales }}>
    <CreateFormWithOwner />
  </StoryWrapper>
);

/**
 * A sales rep must not be able to create a record owned by somebody else:
 * row level security rejects it, so the input has to be inert rather than
 * offering a choice that will fail on save.
 */
export const AsSalesRep = () => (
  <StoryWrapper
    data={{ sales }}
    authProvider={{ canAccess: async ({ action }) => action !== "assign" }}
  >
    <CreateFormWithOwner />
  </StoryWrapper>
);
