import type { Identifier } from "ra-core";

import { buildLead, createCrmDb } from "@/test/StoryWrapper";

import type { Contact, Lead, Product, Sale, Task } from "../../types";
import { createDataProvider } from "./index";
import type { Db } from "./dataGenerator/types";

/**
 * Where the demo used to accept what the real backend refuses (QA audit,
 * phase 4). Each case is a rule the server enforces in SQL or in Supabase
 * Auth, reproduced by the demo provider so the demo does not teach otherwise.
 */
const setup = (overrides: Partial<Db> = {}, identityId: Identifier = 1) =>
  createDataProvider({
    db: createCrmDb(overrides),
    latency: 0,
    authProvider: { getIdentity: async () => ({ id: identityId }) },
  });

const listAll = async <T>(
  dataProvider: ReturnType<typeof setup>,
  resource: string,
) =>
  (
    await dataProvider.getList<T & { id: Identifier }>(resource, {
      filter: {},
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "ASC" },
    })
  ).data;

const product = (overrides: Partial<Product>): Product =>
  ({
    id: 1,
    sku: "ABC-1",
    name: "Widget",
    is_active: true,
    ...overrides,
  }) as Product;

const sale = (overrides: Partial<Sale>): Sale =>
  ({
    id: 2,
    first_name: "Rita",
    last_name: "Rep",
    email: "rita@example.com",
    role: "rep",
    disabled: false,
    ...overrides,
  }) as Sale;

describe("demo lead conversion", () => {
  it("converts once when the button is clicked twice", async () => {
    // Arrange
    const dataProvider = setup({ leads: [buildLead({ id: 1 })] });

    // Act: two calls in flight at once, as a double click sends them
    const [first, second] = await Promise.allSettled([
      dataProvider.convertLead(1),
      dataProvider.convertLead(1),
    ]);

    // Assert: one contact, and the second call told why it did nothing
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({
      status: "rejected",
      reason: { message: expect.stringMatching(/already been converted/) },
    });
    const contacts = await listAll<Contact>(dataProvider, "contacts");
    expect(contacts).toHaveLength(1);
    const [lead] = await listAll<Lead>(dataProvider, "leads");
    expect(lead.converted_contact_id).toBe(contacts[0].id);
  });
});

describe("demo task owner", () => {
  it("gives a task filed for somebody to that person", async () => {
    const dataProvider = setup({}, 1);

    const { data } = await dataProvider.create<Task>("tasks", {
      data: { title: "Call back", sales_id: 2 } as Partial<Task>,
    });

    expect(data.owner_sales_id).toBe(2);
    expect(data.created_by).toBe(2);
  });

  it("gives a task filed for nobody to whoever filed it", async () => {
    const dataProvider = setup({}, 1);

    const { data } = await dataProvider.create<Task>("tasks", {
      data: { title: "Call back" } as Partial<Task>,
    });

    expect(data.owner_sales_id).toBe(1);
  });

  it("keeps an owner that was named", async () => {
    const dataProvider = setup({}, 1);

    const { data } = await dataProvider.create<Task>("tasks", {
      data: {
        title: "Call back",
        sales_id: 1,
        owner_sales_id: 3,
      } as Partial<Task>,
    });

    expect(data.owner_sales_id).toBe(3);
  });
});

describe("demo product SKU", () => {
  it("refuses a second product with the same SKU, whatever its case", async () => {
    const dataProvider = setup({ products: [product({ id: 1 })] });

    const attempt = dataProvider.create("products", {
      data: { sku: " abc-1 ", name: "Copy" },
    });

    // 23505 is what the product form recognises to name the SKU conflict.
    await expect(attempt).rejects.toMatchObject({ code: "23505" });
    expect(await listAll<Product>(dataProvider, "products")).toHaveLength(1);
  });

  it("refuses renaming a product onto another product's SKU", async () => {
    const dataProvider = setup({
      products: [product({ id: 1 }), product({ id: 2, sku: "XYZ-9" })],
    });

    const attempt = dataProvider.update("products", {
      id: 2,
      data: { sku: "ABC-1" },
      previousData: product({ id: 2, sku: "XYZ-9" }),
    });

    await expect(attempt).rejects.toMatchObject({ code: "23505" });
  });

  it("lets a product be saved with its own SKU", async () => {
    const dataProvider = setup({ products: [product({ id: 1 })] });

    const { data } = await dataProvider.update<Product>("products", {
      id: 1,
      data: { sku: "ABC-1", name: "Widget v2" },
      previousData: product({ id: 1 }),
    });

    expect(data.name).toBe("Widget v2");
  });
});

describe("demo user email", () => {
  it("refuses inviting a second user with a taken email", async () => {
    const dataProvider = setup({ sales: [sale({ id: 2 })] });

    const attempt = dataProvider.salesCreate({
      email: "RITA@example.com",
      first_name: "Other",
      last_name: "Rita",
      role: "rep",
      disabled: false,
    } as Parameters<typeof dataProvider.salesCreate>[0]);

    await expect(attempt).rejects.toThrow(
      "A sales for this email already exists",
    );
    expect(await listAll<Sale>(dataProvider, "sales")).toHaveLength(1);
  });

  it("refuses moving a user onto another user's email", async () => {
    const dataProvider = setup({
      sales: [sale({ id: 2 }), sale({ id: 3, email: "tom@example.com" })],
    });

    await expect(
      dataProvider.salesUpdate(3, { email: "rita@example.com" }),
    ).rejects.toThrow("Failed to update account manager");
  });

  it("lets a user be saved with their own email", async () => {
    const dataProvider = setup({ sales: [sale({ id: 2 })] });

    const updated = await dataProvider.salesUpdate(2, {
      email: "rita@example.com",
      first_name: "Rita B.",
    });

    expect(updated.first_name).toBe("Rita B.");
  });
});

describe("demo request log", () => {
  it("does not write every request to the console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const dataProvider = createDataProvider({
        db: createCrmDb(),
        latency: 0,
      });

      await dataProvider.getList("contacts", {
        filter: {},
        pagination: { page: 1, perPage: 10 },
        sort: { field: "id", order: "ASC" },
      });

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
