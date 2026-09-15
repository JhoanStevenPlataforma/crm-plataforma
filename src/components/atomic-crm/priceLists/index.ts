import type { PriceList } from "../types";
import { PriceListCreate } from "./PriceListCreate";
import { PriceListEdit } from "./PriceListEdit";
import { PriceListList } from "./PriceListList";

export default {
  list: PriceListList,
  create: PriceListCreate,
  edit: PriceListEdit,
  recordRepresentation: (record: PriceList) =>
    `${record.name} (${record.currency})`,
};
