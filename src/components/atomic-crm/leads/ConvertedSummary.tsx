import { useTranslate } from "ra-core";
import { Link } from "react-router";

import type { Lead } from "../types";

/**
 * Once converted, the lead becomes an audit trail: it shows what it produced
 * rather than offering the conversion again.
 */
export const ConvertedSummary = ({ record }: { record: Lead }) => {
  const translate = useTranslate();
  return (
    <div className="border-t pt-4 flex flex-col gap-1 text-sm">
      <h3 className="text-sm font-medium text-muted-foreground">
        {translate("resources.leads.convert.converted_title")}
      </h3>
      {record.converted_contact_id ? (
        <Link
          className="underline"
          to={`/contacts/${record.converted_contact_id}/show`}
        >
          {translate("resources.leads.convert.see_contact")}
        </Link>
      ) : null}
      {record.converted_company_id ? (
        <Link
          className="underline"
          to={`/companies/${record.converted_company_id}/show`}
        >
          {translate("resources.leads.convert.see_company")}
        </Link>
      ) : null}
      {record.converted_deal_id ? (
        <Link className="underline" to={`/deals/${record.converted_deal_id}`}>
          {translate("resources.leads.convert.see_deal")}
        </Link>
      ) : null}
    </div>
  );
};
