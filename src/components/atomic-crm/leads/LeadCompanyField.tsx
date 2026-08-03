import { useRecordContext } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";

import type { Lead } from "../types";

/**
 * A lead's company, shown from whichever of the two fields is set.
 *
 * `company_id` is a real link into the CRM and renders as a clickable
 * reference; `company_name` is the raw text a web form produced and renders as
 * plain text, because there is nothing to link to yet.
 */
export const LeadCompanyField = () => {
  const record = useRecordContext<Lead>();

  if (!record) return null;

  if (record.company_id != null) {
    return <ReferenceField source="company_id" reference="companies" />;
  }

  return record.company_name ? <span>{record.company_name}</span> : null;
};
