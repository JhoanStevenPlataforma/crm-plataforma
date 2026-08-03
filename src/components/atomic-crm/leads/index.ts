import type { Lead } from "../types";
import { LeadCreate } from "./LeadCreate";
import { LeadEdit } from "./LeadEdit";
import { LeadList } from "./LeadList";
import { LeadShow } from "./LeadShow";

export default {
  list: LeadList,
  show: LeadShow,
  edit: LeadEdit,
  create: LeadCreate,
  recordRepresentation: (record: Lead) =>
    `${record?.first_name ?? ""} ${record?.last_name ?? ""}`.trim() ||
    (record?.company_name ?? ""),
};
