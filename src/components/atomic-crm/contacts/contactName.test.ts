import { contactDisplayName, contactFullName } from "./contactName";
import { MISSING_CONTACT_NAME, validateContactRow } from "./useContactImport";
import type { ContactImportSchema } from "./useContactImport";

describe("contactDisplayName", () => {
  it("joins first and last name", () => {
    expect(
      contactDisplayName({ first_name: "Ada", last_name: "Lovelace" }),
    ).toBe("Ada Lovelace");
  });

  it("never renders the word undefined for a half-named contact", () => {
    expect(contactDisplayName({ first_name: "Ada", last_name: null })).toBe(
      "Ada",
    );
    expect(
      contactDisplayName({ first_name: undefined, last_name: "Byron" }),
    ).toBe("Byron");
  });

  it("falls back to the first email, then to the id, for a nameless contact", () => {
    expect(
      contactDisplayName({
        id: 7,
        first_name: null,
        last_name: "  ",
        email_jsonb: [{ email: "" }, { email: "ada@example.com" }],
      }),
    ).toBe("ada@example.com");
    expect(
      contactDisplayName({ id: 7, first_name: null, last_name: null }),
    ).toBe("#7");
  });
});

describe("validateContactRow", () => {
  const row = (overrides: Partial<ContactImportSchema>) =>
    ({ first_name: "", last_name: "", ...overrides }) as ContactImportSchema;

  it("accepts a row with a first or a last name", () => {
    expect(validateContactRow(row({ first_name: "Ada" }))).toBeNull();
    expect(validateContactRow(row({ last_name: "Lovelace" }))).toBeNull();
  });

  it("rejects a row with no name at all, the shape an unrelated CSV produces", () => {
    expect(validateContactRow(row({}))).toBe(MISSING_CONTACT_NAME);
    expect(
      validateContactRow(row({ first_name: "   ", last_name: undefined })),
    ).toBe(MISSING_CONTACT_NAME);
  });

  it("accepts a numeric name, which Papa's dynamic typing can produce", () => {
    expect(
      validateContactRow(row({ first_name: 42 as unknown as string })),
    ).toBeNull();
    expect(contactFullName({ first_name: 42 })).toBe("42");
  });
});
