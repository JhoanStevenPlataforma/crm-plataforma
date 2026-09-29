import type {
  DataProvider,
  Identifier,
  RaRecord,
  ResourceCallbacks,
} from "ra-core";

/**
 * Demo-mode counterparts of two unique constraints FakeRest has no way to
 * declare. Without them the demo accepts a second product with the same SKU
 * or a second user with the same email, and teaches exactly what the real
 * backend refuses.
 */

const ALL = { page: 1, perPage: 100_000 };
const BY_ID = { field: "id", order: "ASC" as const };

/** Both columns are `citext` on the server: `ABC-1` and `abc-1` collide. */
const sameText = (a: unknown, b: unknown) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.trim().toLowerCase() === b.trim().toLowerCase();

const isTakenBy = async (
  dataProvider: DataProvider,
  resource: string,
  field: string,
  value: unknown,
  exceptId?: Identifier,
): Promise<boolean> => {
  if (typeof value !== "string" || value.trim() === "") return false;
  const { data } = await dataProvider.getList<RaRecord>(resource, {
    filter: {},
    sort: BY_ID,
    pagination: ALL,
  });
  return data.some(
    (row) => String(row.id) !== String(exceptId) && sameText(row[field], value),
  );
};

/**
 * The shape PostgREST gives a unique violation, which is what
 * `useConflictNotifier` recognises: the product form then names the SKU
 * conflict instead of reporting a generic failure.
 */
const uniqueViolation = (constraint: string) =>
  Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    { code: "23505" },
  );

/** `products.sku` is `citext not null unique`. */
export const productSkuCallbacks = (): ResourceCallbacks => ({
  resource: "products",
  beforeCreate: async (params, dataProvider) => {
    if (await isTakenBy(dataProvider, "products", "sku", params.data.sku)) {
      throw uniqueViolation("products_sku_key");
    }
    return params;
  },
  beforeUpdate: async (params, dataProvider) => {
    const sku = params.data.sku;
    if (
      sku !== undefined &&
      (await isTakenBy(dataProvider, "products", "sku", sku, params.id))
    ) {
      throw uniqueViolation("products_sku_key");
    }
    return params;
  },
});

/**
 * One account per email, which Supabase Auth enforces. The `users` edge
 * function refuses an invitation with the first message; renaming a user onto
 * a taken address fails inside Auth, and the Supabase provider reports the
 * second. The users screen shows either as it is.
 */
export const DUPLICATE_SALE_EMAIL = "A sales for this email already exists";
export const SALE_UPDATE_FAILED = "Failed to update account manager";

export const assertSaleEmailFree = async (
  dataProvider: DataProvider,
  email: unknown,
  {
    exceptId,
    message = DUPLICATE_SALE_EMAIL,
  }: {
    exceptId?: Identifier;
    message?: string;
  } = {},
): Promise<void> => {
  if (await isTakenBy(dataProvider, "sales", "email", email, exceptId)) {
    throw new Error(message);
  }
};
