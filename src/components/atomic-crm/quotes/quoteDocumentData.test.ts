import { commands } from "vitest/browser";

import type { Company, Contact, QuoteLine, QuoteVersion } from "../types";
import { formatDocumentDate, toQuoteDocument } from "./quoteDocumentData";
import { companies, quoteLines, quoteVersions, quotes } from "./quoteFixtures";

/** The customer on the day the offer was issued. */
const SNAPSHOT = {
  company: {
    name: "Acme Andina",
    address: "Calle 1 # 2-3",
    city: "Bogotá",
    tax_identifier: "900.123.456-7",
  },
  contact: {
    first_name: "Lucía",
    last_name: "Gómez",
    title: "Purchasing",
    email: "lucia@acme.example",
    phone: null,
  },
  owner: { name: "Jane Doe" },
};

/** The same customer today: renamed, moved, and buying through someone else. */
const liveCompany = {
  ...companies[0],
  name: "Acme Andina SAS",
  address: "Carrera 99 # 10-20",
  city: "Medellín",
} as Company;

const liveContact = {
  first_name: "Pedro",
  last_name: "Ruiz",
  title: "CFO",
  email_jsonb: [{ email: "pedro@acme.example", type: "Work" }],
  phone_jsonb: [{ number: "3001234567", type: "Work" }],
} as unknown as Contact;

const issued: QuoteVersion = {
  ...quoteVersions[0],
  issued_at: "2026-09-10T10:00:00.000Z",
  party_snapshot: SNAPSHOT,
};

const draft: QuoteVersion = {
  ...quoteVersions[0],
  issued_at: null,
  party_snapshot: null,
};

const sourceFor = (version: QuoteVersion, lines: QuoteLine[] = quoteLines) => ({
  quote: { ...quotes[0], owner_name: "Current Owner" },
  version,
  lines,
  live: { company: liveCompany, contact: liveContact },
  branding: { title: "Plataforma", logo_url: null },
});

describe("toQuoteDocument", () => {
  it("prints an issued version's parties from its snapshot, never from today's records", () => {
    const { parties } = toQuoteDocument(sourceFor(issued));

    expect(parties.company).toMatchObject({
      name: "Acme Andina",
      address: "Calle 1 # 2-3",
      city: "Bogotá",
      tax_identifier: "900.123.456-7",
    });
    expect(parties.contact).toMatchObject({
      name: "Lucía Gómez",
      title: "Purchasing",
      email: "lucia@acme.example",
    });
    expect(parties.owner_name).toBe("Jane Doe");
  });

  it("leaves the customer blank rather than print today's address on an issued version with no snapshot", () => {
    // `snapshot ?? live` reads as a harmless fallback, and prints a document
    // sent last year with this year's address on it.
    const { parties } = toQuoteDocument(
      sourceFor({ ...issued, party_snapshot: null }),
    );

    expect(parties.company).toBeNull();
    expect(parties.contact).toBeNull();
  });

  it("previews a draft with the live company, contact and owner, since nothing is frozen yet", () => {
    const { parties, quote } = toQuoteDocument(sourceFor(draft));

    expect(quote.issued_at).toBeNull();
    expect(parties.company).toMatchObject({
      name: "Acme Andina SAS",
      address: "Carrera 99 # 10-20",
    });
    expect(parties.contact).toMatchObject({
      name: "Pedro Ruiz",
      email: "pedro@acme.example",
      phone: "3001234567",
    });
    expect(parties.owner_name).toBe("Current Owner");
  });

  it("keeps the totals an issued version was frozen with, even where today's arithmetic disagrees", () => {
    // Issued under a rounding or a tax rate that has since changed: the
    // customer holds these figures, and a reprint has to match them.
    const frozen = {
      ...issued,
      subtotal: 600000,
      discount_total: 60000,
      tax_total: 102599,
      total: 642599,
    };
    const storedLine = [{ ...quoteLines[0], line_total: 642599 }];

    const document = toQuoteDocument(sourceFor(frozen, storedLine));

    expect(document.totals).toEqual({
      subtotal: 600000,
      discount_total: 60000,
      tax_total: 102599,
      total: 642599,
    });
    expect(document.lines[0].line_total).toBe(642599);
  });

  it("computes a draft's totals from its own lines, so the preview never contradicts them", () => {
    // The version row is a second read, and here it lags behind a line that
    // was just saved.
    const stale = {
      ...draft,
      subtotal: 0,
      discount_total: 0,
      tax_total: 0,
      total: 0,
    };

    const document = toQuoteDocument(sourceFor(stale));

    // 3 × 200,000 at 10% off and 19% IVA, as the database stores it.
    expect(document.totals).toEqual({
      subtotal: 600000,
      discount_total: 60000,
      tax_total: 102600,
      total: 642600,
    });
    expect(document.lines[0].line_total).toBe(642600);
  });

  it("orders the lines by position whatever order they were read in", () => {
    const second = { ...quoteLines[0], id: 102, name: "Second", position: 2 };
    const first = { ...quoteLines[0], id: 101, name: "First", position: 1 };

    const { lines } = toQuoteDocument(sourceFor(draft, [second, first]));

    expect(lines.map((line) => line.name)).toEqual(["First", "Second"]);
  });
});

describe("formatDocumentDate", () => {
  let originalTimezone: string;

  beforeEach(() => {
    originalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  afterEach(async () => {
    await commands.setTimezone(originalTimezone);
  });

  it("prints a bare validity date on its own day on both sides of Greenwich", async () => {
    // `new Date("2026-12-31")` is UTC midnight, which in Bogotá is the 30th: an
    // offer expiring a day early, in writing.
    await commands.setTimezone("America/Bogota");
    expect(formatDocumentDate("2026-12-31", "en-US")).toBe("December 31, 2026");

    await commands.setTimezone("Pacific/Auckland");
    expect(formatDocumentDate("2026-12-31", "en-US")).toBe("December 31, 2026");
  });

  it("prints nothing for a missing or unreadable date instead of Invalid Date", () => {
    expect(formatDocumentDate(null)).toBe("");
    expect(formatDocumentDate("not a date")).toBe("");
  });
});
