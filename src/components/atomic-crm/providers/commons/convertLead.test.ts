import { describe, expect, test } from "vitest";

import { createDataProvider } from "../fakerest";
import { createCrmDb, buildLead } from "@/test/StoryWrapper";
import type { Company, Contact, Deal, Lead } from "../../types";
import { convertLead } from "./convertLead";

const buildProvider = (leads: Lead[], companies: Company[] = []) =>
  createDataProvider({
    db: createCrmDb({ leads, companies }),
    latency: 0,
    silent: true,
  });

describe("convertLead", () => {
  test("creates a contact carrying the lead's identity, email and phone", async () => {
    // Arrange
    const dataProvider = buildProvider([buildLead({ id: 1 })]);

    // Act
    const contactId = await convertLead(1, {}, dataProvider);

    // Assert
    const { data: contact } = await dataProvider.getOne<Contact>("contacts", {
      id: contactId,
    });
    expect(contact.first_name).toBe("Lucia");
    expect(contact.last_name).toBe("Prospect");
    expect(contact.title).toBe("CTO");
    expect(contact.email_jsonb).toEqual([
      { email: "lucia@prospect.example", type: "Work" },
    ]);
    expect(contact.phone_jsonb).toEqual([
      { number: "+34600111222", type: "Work" },
    ]);
  });

  test("creates the company named by the lead", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1 })]);

    const contactId = await convertLead(1, {}, dataProvider);

    const { data: contact } = await dataProvider.getOne<Contact>("contacts", {
      id: contactId,
    });
    const { data: company } = await dataProvider.getOne<Company>("companies", {
      id: contact.company_id!,
    });
    expect(company.name).toBe("Prospect Industries");
  });

  test("reuses an existing company instead of creating a duplicate", async () => {
    // Arrange: the company already exists, spelled differently
    const dataProvider = buildProvider(
      [buildLead({ id: 1, company_name: "prospect industries" })],
      [{ id: 7, name: "Prospect Industries" } as Company],
    );

    // Act
    const contactId = await convertLead(1, {}, dataProvider);

    // Assert
    const { data: contact } = await dataProvider.getOne<Contact>("contacts", {
      id: contactId,
    });
    expect(contact.company_id).toBe(7);

    const { total } = await dataProvider.getList<Company>("companies", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
      filter: {},
    });
    expect(total).toBe(1);
  });

  test("uses the linked company instead of the typed name", async () => {
    // Arrange: the lead names one company but is linked to another
    const dataProvider = buildProvider(
      [
        buildLead({
          id: 1,
          company_id: 7,
          company_name: "Typed By A Web Form",
        }),
      ],
      [{ id: 7, name: "The Linked One" } as Company],
    );

    // Act
    const contactId = await convertLead(1, {}, dataProvider);

    // Assert: the link wins, and no company is created from the free text
    const { data: contact } = await dataProvider.getOne<Contact>("contacts", {
      id: contactId,
    });
    expect(contact.company_id).toBe(7);

    const { total } = await dataProvider.getList<Company>("companies", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
      filter: {},
    });
    expect(total).toBe(1);
  });

  test("creates no deal unless asked to", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1 })]);

    await convertLead(1, {}, dataProvider);

    const { total } = await dataProvider.getList<Deal>("deals", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    });
    expect(total).toBe(0);
  });

  test("creates the requested deal linked to the new contact", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1 })]);

    const contactId = await convertLead(
      1,
      { createDeal: true, dealName: "Primer pedido", dealAmount: 15000 },
      dataProvider,
    );

    const { data: deals } = await dataProvider.getList<Deal>("deals", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    });
    expect(deals).toHaveLength(1);
    expect(deals[0].name).toBe("Primer pedido");
    expect(deals[0].amount).toBe(15000);
    expect(deals[0].contact_ids).toEqual([contactId]);
  });

  test("names the deal after the lead when no name is given", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1 })]);

    await convertLead(1, { createDeal: true }, dataProvider);

    const { data: deals } = await dataProvider.getList<Deal>("deals", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    });
    expect(deals[0].name).toBe("Lucia Prospect");
  });

  test("records on the lead what the conversion produced", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1 })]);

    const contactId = await convertLead(1, { createDeal: true }, dataProvider);

    const { data: lead } = await dataProvider.getOne<Lead>("leads", { id: 1 });
    expect(lead.status).toBe("converted");
    expect(lead.converted_at).toEqual(expect.any(String));
    expect(lead.converted_contact_id).toBe(contactId);
    expect(lead.converted_company_id).toEqual(expect.anything());
    expect(lead.converted_deal_id).toEqual(expect.anything());
  });

  test("refuses to convert the same lead twice", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1 })]);
    await convertLead(1, {}, dataProvider);

    await expect(convertLead(1, {}, dataProvider)).rejects.toThrow(
      /already been converted/,
    );
  });

  test("keeps the lead owner as the owner of everything it produces", async () => {
    const dataProvider = buildProvider([buildLead({ id: 1, sales_id: 0 })]);

    const contactId = await convertLead(1, { createDeal: true }, dataProvider);

    const { data: contact } = await dataProvider.getOne<Contact>("contacts", {
      id: contactId,
    });
    expect(contact.sales_id).toBe(0);
  });
});
