import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
  process.env.SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Tables in FK-safe deletion order (children before parents).
//
// `tasks` is absent on purpose: a DELETE on it is converted to a soft delete by
// `tasks_soft_delete`, so the rows would survive the reset and then block the
// `sales` delete through `owner_sales_id`. Tasks go through
// `public.purge_tasks()` — the retention path, service-role only (§4.4).
const TABLES = [
  "contact_notes",
  "deal_notes",
  // Cascades from deals, but deleted explicitly like the notes above so the
  // reset does not depend on cascade behaviour.
  "deal_stage_changes",
  // Before contacts/companies/deals: leads point at all three.
  "leads",
  "deals",
  "contacts",
  "companies",
  "tags",
  "favicons_excluded_domains",
  "configuration",
  // Both cascade from sales, but deleting them explicitly keeps the reset
  // independent of cascade behaviour if those FKs ever change.
  "notification_preferences",
  "team_members",
  "teams",
  "sales",
];

async function resetDb() {
  // Tasks first, through the retention path: nothing else can remove them, and
  // every remaining table below is blocked by their foreign keys.
  // `p_purge_history` is what makes a reset possible at all: task events are
  // append-only and reference sales, so history that outlives every task also
  // pins every user who ever touched one. Only ever right for a throwaway DB.
  const { error: purgeError } = await adminSupabase.rpc("purge_tasks", {
    p_purge_history: true,
  });
  if (purgeError) {
    throw new Error(`Failed to purge tasks: ${purgeError.message}`);
  }

  // Quotes through their retention path too, for the same reason: issued
  // versions and the quote audit trail refuse a plain service-role DELETE, and
  // a quote blocks the companies and sales deleted below.
  const { error: purgeQuotesError } = await adminSupabase.rpc("purge_quotes", {
    p_purge_history: true,
  });
  if (purgeQuotesError) {
    throw new Error(`Failed to purge quotes: ${purgeQuotesError.message}`);
  }

  // And the catalogue, for a third time the same reason: `products` carries
  // append-only `product_events`, so a service-role DELETE hits the guard
  // through the cascade — and `products.sales_id` then pins every user who
  // ever created one, which is the `sales` delete at the bottom of this
  // function. `p_purge_lists` also clears the price lists; the SEEDED tax
  // rates survive on purpose (they are reference data like `quote_statuses`,
  // and a reset that took `iva_19` with it would leave every later spec
  // quoting at 0% in silence).
  const { error: purgeCatalogueError } = await adminSupabase.rpc(
    "purge_catalogue",
    { p_purge_lists: true },
  );
  if (purgeCatalogueError) {
    throw new Error(
      `Failed to purge catalogue: ${purgeCatalogueError.message}`,
    );
  }

  // The discount ceilings are reference data and stay, but `enforced_from` is
  // a SWITCH: until it carries a date the gate reports "no rule applies", and a
  // spec that turns it on (`enforceDiscountRules`) would otherwise govern every
  // quote every later spec issues.
  const { error: rulesError } = await adminSupabase
    .from("quote_discount_rules")
    .update({ enforced_from: null })
    .not("role", "is", null);
  if (rulesError) {
    throw new Error(
      `Failed to reset the discount rules: ${rulesError.message}`,
    );
  }

  for (const table of TABLES) {
    // Supabase client delete need a where clause to get executed, so we use one that will match on all rows (id is not null)
    await adminSupabase.from(table).delete().not("id", "is", null);
  }

  // Delete all auth users (cascades to sales via DB trigger)
  const { data } = await adminSupabase.auth.admin.listUsers();
  await Promise.all(
    data.users.map((user) => adminSupabase.auth.admin.deleteUser(user.id)),
  );
}

async function createUser({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return data.user;
}

export type CrmRole = "admin" | "manager" | "rep";

async function createSales({
  first_name,
  last_name,
  email,
  password,
  role = "rep",
}: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  /**
   * Access level. Defaults to `rep`, which only sees the records it owns —
   * the case worth asserting in most tests.
   */
  role?: CrmRole;
}) {
  // The name goes into the AUTH user's metadata, not only into `sales`.
  // `handle_update_user()` re-syncs `sales.first_name` / `last_name` from
  // `raw_user_meta_data` on every update to `auth.users` — and a sign-in is
  // one, because it stamps `last_sign_in_at`. Setting the names on `sales`
  // alone leaves them correct until the user first signs in, at which point
  // they silently become "Pending Pending": invisible to every spec that never
  // renders the name, and wrong for the one that does.
  const { data: userData, error: userError } =
    await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });

  if (userError) {
    throw new Error(`Failed to create sales: ${userError.message}`);
  }

  const { data, error } = await adminSupabase
    .from("sales")
    .update({ first_name, last_name, role })
    .eq("user_id", userData.user?.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create sales: ${error.message}`);
  }

  return data;
}

async function createNotes({
  contactId,
  salesId,
  notes,
}: {
  contactId: string | number;
  salesId: string | number;
  notes: {
    text: string;
    date?: string;
    status?: "cold" | "warm" | "hot";
  }[];
}) {
  if (notes.length === 0) return;

  const { error } = await adminSupabase.from("contact_notes").insert(
    notes.map(({ text, date, status = "cold" }) => ({
      contact_id: contactId,
      sales_id: salesId,
      text,
      date,
      status,
    })),
  );

  if (error) {
    throw new Error(`Failed to create notes: ${error.message}`);
  }
}

async function createCompany({
  name,
  salesId,
}: {
  name: string;
  salesId: string | number;
}) {
  const { data, error } = await adminSupabase
    .from("companies")
    .insert({ name, sales_id: salesId })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create company: ${error.message}`);
  }

  return data;
}

async function createContact({
  first_name,
  last_name,
  title = "",
  company_id = null,
  sales_id,
  notes = [],
}: {
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: string | number | null;
  sales_id: string | number;
  notes?: {
    text: string;
    date?: string;
    status?: "cold" | "warm" | "hot";
  }[];
}) {
  const { data, error } = await adminSupabase
    .from("contacts")
    .insert({
      first_name,
      last_name,
      title,
      company_id,
      sales_id,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      has_newsletter: false,
      tags: [],
      gender: "unknown",
      status: "cold",
      background: "",
      email_jsonb: [],
      phone_jsonb: [],
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create contact: ${error.message}`);
  }

  await createNotes({
    contactId: data.id,
    salesId: sales_id,
    notes,
  });

  return data;
}

async function createLead({
  first_name,
  last_name,
  company_name = "",
  status = "new",
  sales_id,
}: {
  first_name: string;
  last_name: string;
  company_name?: string;
  status?: string;
  sales_id: string | number;
}) {
  const { data, error } = await adminSupabase
    .from("leads")
    .insert({ first_name, last_name, company_name, status, sales_id })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return data;
}

/**
 * The commercial catalogue a quotation is priced from
 * (docs/proposals/quotes-cpq-module.md 2.2).
 *
 * Built through the service role rather than through the screens, because the
 * catalogue is the SETUP of a quote spec, not its subject -
 * `quoteCatalogue.spec.ts` is the one place it is driven by hand.
 *
 * The seeded tax rates survive `resetDb()`, so a spec that wants real tax asks
 * for one by code instead of creating its own.
 */
async function taxRateByCode(code: string) {
  const { data, error } = await adminSupabase
    .from("tax_rates")
    .select("id, rate")
    .eq("code", code)
    .single();

  if (error) {
    throw new Error(`Failed to read tax rate ${code}: ${error.message}`);
  }

  return data;
}

async function createProduct({
  sku,
  name,
  currency = "USD",
  list_price = 0,
  tax_rate_id = null,
  sales_id = null,
}: {
  sku: string;
  name: string;
  /** No default in the schema on purpose (F3): a catalogue states its currency. */
  currency?: string;
  list_price?: number;
  tax_rate_id?: number | null;
  sales_id?: string | number | null;
}) {
  const { data, error } = await adminSupabase
    .from("products")
    .insert({ sku, name, currency, list_price, tax_rate_id, sales_id })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`);
  }

  return data;
}

/**
 * A price list and the rows that price products in it, in one call.
 *
 * `price_book` - what the line editor reads - only carries a product once it
 * has a price row in the list, so a list created without its items is a list
 * nothing can be quoted from. Making them one call is what keeps that from
 * being discovered inside a spec.
 */
async function createPriceList({
  code,
  name,
  currency = "USD",
  is_default = true,
  items = [],
}: {
  code: string;
  name: string;
  currency?: string;
  is_default?: boolean;
  items?: {
    product_id: string | number;
    unit_price: number;
    tax_rate_id?: number | null;
  }[];
}) {
  const { data, error } = await adminSupabase
    .from("price_lists")
    .insert({ code, name, currency, is_default })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create price list: ${error.message}`);
  }

  if (items.length > 0) {
    const { error: itemsError } = await adminSupabase
      .from("price_list_items")
      .insert(
        items.map((item) => ({
          price_list_id: data.id,
          product_id: item.product_id,
          unit_price: item.unit_price,
          tax_rate_id: item.tax_rate_id ?? null,
        })),
      );

    if (itemsError) {
      throw new Error(`Failed to price the list: ${itemsError.message}`);
    }
  }

  return data;
}

/**
 * Switch the discount ceilings on (quotes 3.1).
 *
 * The seeded rules carry no `enforced_from`, so out of the box the gate answers
 * `max_allowed: null` - "no rule applies", which is deliberately NOT the same
 * as "the rule is satisfied". A quote is governed only when it was created
 * after that date, so the default is well in the past: a fixture that used
 * `now()` would race the quote it is meant to govern.
 */
async function enforceDiscountRules(from = "2000-01-01T00:00:00Z") {
  const { error } = await adminSupabase
    .from("quote_discount_rules")
    .update({ enforced_from: from })
    .not("role", "is", null);

  if (error) {
    throw new Error(`Failed to enforce the discount rules: ${error.message}`);
  }
}

async function createDeal({
  name,
  company_id,
  sales_id,
  stage = "opportunity",
  amount = 0,
  expected_closing_date = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10),
}: {
  name: string;
  company_id: string | number;
  sales_id: string | number;
  stage?: string;
  amount?: number;
  /**
   * Nullable in the schema, but the deal screen reads it: a deal with no
   * closing date renders an empty string into a date query, which PostgREST
   * refuses with "Invalid date format". Defaulted here so no spec has to know.
   */
  expected_closing_date?: string;
}) {
  const { data, error } = await adminSupabase
    .from("deals")
    .insert({
      name,
      company_id,
      sales_id,
      stage,
      amount,
      expected_closing_date,
      contact_ids: [],
      index: 0,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create deal: ${error.message}`);
  }

  return data;
}

/**
 * A quotation with its lines, as a draft.
 *
 * `quote_number` is left out: a trigger fills it from the sequence, and a spec
 * that invented one would be asserting against its own string. Version 1 is
 * seeded by the database on insert, which is where the lines go - the version
 * is looked up rather than passed in, because a caller that has to know about
 * `quote_versions` to add a line is a caller reimplementing the editor.
 *
 * Lines are posted SHORT, exactly as `QuoteLines` posts them: `sku`, `name`,
 * `unit` and `tax_rate_percent` are the server's to fill
 * (`quote_lines_snapshot_defaults`, 13.6 #10). A fixture that copied them
 * would be testing its own copy.
 */
async function createQuote({
  company_id,
  sales_id,
  currency = "USD",
  price_list_id = null,
  deal_id = null,
  contact_id = null,
  title = null,
  valid_until = null,
  terms = null,
  lines = [],
}: {
  company_id: string | number;
  sales_id: string | number;
  currency?: string;
  price_list_id?: string | number | null;
  deal_id?: string | number | null;
  contact_id?: string | number | null;
  title?: string | null;
  valid_until?: string | null;
  terms?: string | null;
  lines?: {
    product_id?: string | number | null;
    name?: string;
    quantity: number;
    unit_price: number;
    discount_percent?: number;
    tax_rate_id?: number | null;
  }[];
}) {
  const { data, error } = await adminSupabase
    .from("quotes")
    .insert({
      company_id,
      sales_id,
      currency,
      price_list_id,
      deal_id,
      contact_id,
      title,
      valid_until,
      terms,
    })
    .select("id, quote_number")
    .single();

  if (error) {
    throw new Error(`Failed to create quote: ${error.message}`);
  }

  if (lines.length === 0) return data;

  const { data: version, error: versionError } = await adminSupabase
    .from("quote_versions")
    .select("id")
    .eq("quote_id", data.id)
    .is("issued_at", null)
    .single();

  if (versionError) {
    throw new Error(
      `Failed to read the draft version: ${versionError.message}`,
    );
  }

  const { error: linesError } = await adminSupabase.from("quote_lines").insert(
    lines.map((line, position) => ({
      version_id: version.id,
      product_id: line.product_id ?? null,
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent ?? 0,
      tax_rate_id: line.tax_rate_id ?? null,
      position: position + 1,
    })),
  );

  if (linesError) {
    throw new Error(`Failed to add quote lines: ${linesError.message}`);
  }

  return data;
}

/**
 * Issue a quotation and hand back the customer link's raw token.
 *
 * Signed in AS the owner, not through the service role: `issue_quote_version()`
 * resolves the actor from `auth.uid()` and refuses a quote the caller does not
 * own - a service-role call has no session, so it is refused on every quote
 * that belongs to somebody. That makes this the one factory here that needs a
 * password.
 *
 * The token is returned by the RPC and stored only as its sha256 (6.2), so
 * this is the only moment it exists. `quotePortal.spec.ts` uses it to be a
 * customer; nothing can look it up afterwards.
 */
async function issueQuote({
  quote_id,
  email,
  password,
  token_days = 30,
}: {
  quote_id: string | number;
  email: string;
  password: string;
  token_days?: number;
}) {
  const asOwner = createClient(
    process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
    process.env.VITE_SB_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: signInError } = await asOwner.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error(`Failed to sign in as ${email}: ${signInError.message}`);
  }

  const { data, error } = await asOwner.rpc("issue_quote_version", {
    p_quote_id: quote_id,
    p_token_days: token_days,
  });

  if (error) {
    throw new Error(`Failed to issue quote: ${error.message}`);
  }

  return data as {
    token: string;
    quote_id: number;
    token_id: number;
    version_id: number;
    version_number: number;
    expires_at: string;
  };
}

const getMenuMethod = ({ page }: { page: Page; isMobile: boolean }) => ({
  goToDashboard: async () => {
    // First: the menu entry. A list page also links "Dashboard" in its
    // breadcrumb.
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await page.waitForLoadState("networkidle");
  },
  goToContacts: async () => {
    await page.getByRole("link", { name: "Contacts" }).click();
    await page.waitForLoadState("networkidle");
  },
  goToTasks: async () => {
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    await page.waitForLoadState("networkidle");
  },
});

const dismissToast = async (page: Page, content: string) => {
  await expect(page.getByText(content)).toBeVisible();
  // Scoped to this toast: its close button is labelled "Close" like every
  // dialog's, so an unscoped label would match those too.
  await page
    .getByRole("listitem")
    .filter({ hasText: content })
    .getByRole("button", { name: "Close" })
    .first()
    .click();
  // Since we are in optimistic UI, dismissing the toast trigger the request to the api linked to the toast message
  await page.waitForLoadState("networkidle");
};

export const test = base.extend<{
  resetDb: void;
  createUser: typeof createUser;
  createSales: typeof createSales;
  createCompany: typeof createCompany;
  createContact: typeof createContact;
  createLead: typeof createLead;
  createNotes: typeof createNotes;
  createProduct: typeof createProduct;
  createPriceList: typeof createPriceList;
  createDeal: typeof createDeal;
  createQuote: typeof createQuote;
  issueQuote: typeof issueQuote;
  enforceDiscountRules: typeof enforceDiscountRules;
  taxRateByCode: typeof taxRateByCode;
  menu: ReturnType<typeof getMenuMethod>;
  dismissToast: (content: string) => Promise<void>;
}>({
  resetDb: [
    // The first argument to a Playwright fixture function must use object destructuring ({}) — _ is not allowed.
    // Playwright uses this to statically analyze which fixtures are requested.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await resetDb();
      await use();
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern
  createUser: async ({}, cb) => {
    await cb(createUser);
  },
  // eslint-disable-next-line no-empty-pattern
  createSales: async ({}, cb) => {
    await cb(createSales);
  },
  // eslint-disable-next-line no-empty-pattern
  createCompany: async ({}, cb) => {
    await cb(createCompany);
  },
  // eslint-disable-next-line no-empty-pattern
  createContact: async ({}, cb) => {
    await cb(createContact);
  },
  // eslint-disable-next-line no-empty-pattern
  createLead: async ({}, cb) => {
    await cb(createLead);
  },
  // eslint-disable-next-line no-empty-pattern
  createNotes: async ({}, cb) => {
    await cb(createNotes);
  },
  // eslint-disable-next-line no-empty-pattern
  createProduct: async ({}, cb) => {
    await cb(createProduct);
  },
  // eslint-disable-next-line no-empty-pattern
  createPriceList: async ({}, cb) => {
    await cb(createPriceList);
  },
  // eslint-disable-next-line no-empty-pattern
  createDeal: async ({}, cb) => {
    await cb(createDeal);
  },
  // eslint-disable-next-line no-empty-pattern
  createQuote: async ({}, cb) => {
    await cb(createQuote);
  },
  // eslint-disable-next-line no-empty-pattern
  issueQuote: async ({}, cb) => {
    await cb(issueQuote);
  },
  // eslint-disable-next-line no-empty-pattern
  enforceDiscountRules: async ({}, cb) => {
    await cb(enforceDiscountRules);
  },
  // eslint-disable-next-line no-empty-pattern
  taxRateByCode: async ({}, cb) => {
    await cb(taxRateByCode);
  },
  menu: async ({ page, isMobile }, cb) => {
    await cb(getMenuMethod({ page, isMobile }));
  },
  dismissToast: async ({ page }, cb) => {
    await cb((content: string) => dismissToast(page, content));
  },
});

/** So a spec can build a helper around a factory without restating its shape. */
export type CreateQuote = typeof createQuote;
export type IssueQuote = typeof issueQuote;

export { expect };
