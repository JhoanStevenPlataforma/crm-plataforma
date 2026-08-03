import type { DataProvider, Identifier } from "ra-core";

import type { Company, Contact, Deal, Lead } from "../../types";

export interface ConvertLeadOptions {
  createDeal?: boolean;
  dealName?: string;
  dealAmount?: number;
}

/**
 * FakeRest counterpart of the `convert_lead()` database function.
 *
 * Kept in step with `supabase/schemas/02_functions.sql`: same company reuse by
 * name, same fields copied onto the contact, same bookkeeping written back to
 * the lead. Unlike the SQL version this cannot be atomic — FakeRest has no
 * transactions — which is exactly why the real backend does it in one call.
 */
export const convertLead = async (
  leadId: Identifier,
  options: ConvertLeadOptions,
  dataProvider: DataProvider,
): Promise<Identifier> => {
  const { data: lead } = await dataProvider.getOne<Lead>("leads", {
    id: leadId,
  });

  if (lead.converted_at) {
    throw new Error(`Lead ${leadId} has already been converted`);
  }

  const companyName = lead.company_name?.trim();
  // An explicit link wins: somebody already decided which company this is.
  let companyId: Identifier | undefined = lead.company_id ?? undefined;

  if (companyId == null && companyName) {
    const { data: existing } = await dataProvider.getList<Company>(
      "companies",
      {
        pagination: { page: 1, perPage: 500 },
        sort: { field: "name", order: "ASC" },
        filter: {},
      },
    );
    companyId = existing.find(
      (candidate) =>
        candidate.name?.toLowerCase() === companyName.toLowerCase(),
    )?.id;

    if (companyId == null) {
      const { data: company } = await dataProvider.create<Company>(
        "companies",
        { data: { name: companyName, sales_id: lead.sales_id } as any },
      );
      companyId = company.id;
    }
  }

  const { data: contact } = await dataProvider.create<Contact>("contacts", {
    data: {
      first_name: lead.first_name,
      last_name: lead.last_name,
      title: lead.title,
      company_id: companyId,
      sales_id: lead.sales_id,
      status: "warm",
      tags: lead.tags ?? [],
      background: lead.notes,
      email_jsonb: lead.email ? [{ email: lead.email, type: "Work" }] : [],
      phone_jsonb: lead.phone ? [{ number: lead.phone, type: "Work" }] : [],
      first_seen: lead.created_at,
      last_seen: new Date().toISOString(),
    } as any,
  });

  let dealId: Identifier | undefined;
  if (options.createDeal) {
    const fallbackName =
      `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
    const { data: deal } = await dataProvider.create<Deal>("deals", {
      data: {
        name: options.dealName?.trim() || fallbackName,
        company_id: companyId,
        contact_ids: [contact.id],
        stage: "opportunity",
        amount: options.dealAmount ?? 0,
        sales_id: lead.sales_id,
        index: 0,
      } as any,
    });
    dealId = deal.id;
  }

  await dataProvider.update<Lead>("leads", {
    id: leadId,
    data: {
      status: "converted",
      converted_at: new Date().toISOString(),
      converted_contact_id: contact.id,
      converted_company_id: companyId ?? null,
      converted_deal_id: dealId ?? null,
    } as any,
    previousData: lead,
  });

  return contact.id;
};
