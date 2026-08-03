import { company, internet, name, random } from "faker/locale/en_US";

import type { Lead } from "../../../types";
import { defaultLeadSources } from "../../../root/defaultConfiguration";
import type { Db } from "./types";
import { randomDate } from "./utils";

const STATUSES = ["new", "contacted", "qualified", "unqualified"];

export const generateLeads = (db: Db): Lead[] =>
  Array.from(Array(40).keys()).map((index) => {
    const first_name = name.firstName();
    const last_name = name.lastName();
    const created_at = randomDate().toISOString();

    return {
      id: index,
      first_name,
      last_name,
      email: internet.email(first_name, last_name),
      phone: `+3460${random.number({ min: 1000000, max: 9999999 })}`,
      // Two thirds arrive as raw text from a form; the rest have already been
      // matched to a company record.
      company_name: index % 3 === 0 ? "" : company.companyName(),
      company_id: index % 3 === 0 ? random.arrayElement(db.companies).id : null,
      title: name.jobTitle(),
      source: random.arrayElement(defaultLeadSources).value,
      status: random.arrayElement(STATUSES),
      score: random.number({ min: 0, max: 100 }),
      notes: "",
      tags: [],
      sales_id: random.arrayElement(db.sales).id,
      created_at,
      updated_at: created_at,
      converted_at: null,
      converted_contact_id: null,
      converted_company_id: null,
      converted_deal_id: null,
    } satisfies Lead;
  });
