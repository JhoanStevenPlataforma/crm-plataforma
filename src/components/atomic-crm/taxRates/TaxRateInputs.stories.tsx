import type { Meta } from "@storybook/react-vite";
import { Form, RecordContextProvider, ResourceContextProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { TaxRate } from "../types";
import { TaxRateInputs } from "./TaxRateInputs";

const meta = {
  title: "Atomic CRM/Tax Rates/Tax Rate Inputs",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

const seeded: TaxRate = {
  id: 1,
  code: "iva_19",
  label: "IVA 19%",
  rate: 19,
  is_default: true,
  active: true,
  rank: 10,
  is_system: true,
};

const custom: TaxRate = {
  id: 9,
  code: "export_zero",
  label: "Export 0%",
  rate: 0,
  is_default: false,
  active: true,
  rank: 90,
  is_system: false,
};

const Inputs = ({ record }: { record: TaxRate }) => (
  <StoryWrapper data={{ tax_rates: [record] }}>
    <ResourceContextProvider value="tax_rates">
      <RecordContextProvider value={record}>
        <Form record={record}>
          <TaxRateInputs />
        </Form>
      </RecordContextProvider>
    </ResourceContextProvider>
  </StoryWrapper>
);

/** A rate the migration seeded: its code is fixed, the rest follows the law. */
export const SeededRate = () => <Inputs record={seeded} />;

export const CustomRate = () => <Inputs record={custom} />;
