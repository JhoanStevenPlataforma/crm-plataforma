import { company, datatype, internet, name, random } from "faker/locale/en_US";

import type { Lead } from "../../../types";
import { defaultLeadSources } from "../../../root/defaultConfiguration";
import type { Db } from "./types";
import { randomDate } from "./utils";

const STATUSES = ["new", "contacted", "qualified", "unqualified"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every generated lead used to carry `converted_at: null`, so demo mode could
 * not show a single conversion — and the analytics module reports conversion
 * rate, time to conversion and revenue by source, all of which rendered as
 * zero. That is the same trap the task generator documents: a demo that
 * undersells the feature and, worse, hides any bug in it.
 *
 * One in three converts, which is generous for a real funnel and readable on a
 * bar chart of forty leads.
 */
const isConverted = (index: number): boolean => index % 3 === 1;

export const generateLeads = (db: Db): Lead[] =>
  Array.from(Array(40).keys()).map((index) => {
    const first_name = name.firstName();
    const last_name = name.lastName();
    const created_at = randomDate().toISOString();

    // The conversion points at a real deal, because that link is the only path
    // in the schema from an origin to revenue: `leads.source` reaches
    // `deals.amount` through `converted_deal_id` and nowhere else.
    const deal = isConverted(index) ? random.arrayElement(db.deals) : undefined;
    const convertedAt = deal
      ? new Date(
          new Date(created_at).getTime() +
            datatype.number({ min: 1, max: 45 }) * DAY_MS,
        ).toISOString()
      : null;

    return {
      id: index,
      first_name,
      last_name,
      email: internet.email(first_name, last_name),
      phone: `+3460${datatype.number({ min: 1000000, max: 9999999 })}`,
      // Two thirds arrive as raw text from a form; the rest have already been
      // matched to a company record.
      company_name: index % 3 === 0 ? "" : company.companyName(),
      company_id: index % 3 === 0 ? random.arrayElement(db.companies).id : null,
      title: name.jobTitle(),
      source: random.arrayElement(defaultLeadSources).value,
      // `converted` is written by `convert_lead()` and is deliberately absent
      // from the configured status list, so it is set here rather than drawn.
      status: deal ? "converted" : random.arrayElement(STATUSES),
      score: datatype.number({ min: 0, max: 100 }),
      notes: "",
      tags: [],
      sales_id: random.arrayElement(db.sales).id,
      created_at,
      updated_at: convertedAt ?? created_at,
      converted_at: convertedAt,
      converted_contact_id: deal?.contact_ids?.[0] ?? null,
      converted_company_id: deal?.company_id ?? null,
      converted_deal_id: deal?.id ?? null,
    } satisfies Lead;
  });
