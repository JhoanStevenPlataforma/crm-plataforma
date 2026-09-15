import type { TaxRate } from "../types";
import { TaxRateCreate } from "./TaxRateCreate";
import { TaxRateEdit } from "./TaxRateEdit";
import { TaxRateList } from "./TaxRateList";

export default {
  list: TaxRateList,
  create: TaxRateCreate,
  edit: TaxRateEdit,
  recordRepresentation: (record: TaxRate) => record.label,
};
