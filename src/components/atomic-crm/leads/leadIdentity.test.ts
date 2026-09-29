import {
  LEAD_IDENTITY_REQUIRED,
  leadCanBecomeContact,
  validateLeadIdentity,
} from "./leadIdentity";

/**
 * M4 (QA audit): a completely empty lead could be saved. The form now asks
 * for something to follow up on, with the same rule as `leads_has_identity`.
 */
describe("validateLeadIdentity", () => {
  it("refuses a lead with nothing to follow up on", () => {
    expect(
      validateLeadIdentity("", {
        first_name: "  ",
        last_name: "",
        email: null,
        company_name: "",
      }),
    ).toBe(LEAD_IDENTITY_REQUIRED);
  });

  it.each([
    [{ first_name: "Ana" }],
    [{ email: "ana@example.com" }],
    [{ phone: "+34 600 000 000" }],
    [{ company_name: "Acme" }],
    [{ company_id: 7 }],
  ])("accepts a lead known by %j", (values) => {
    expect(validateLeadIdentity(undefined, values)).toBeUndefined();
  });
});

describe("leadCanBecomeContact", () => {
  it("is false for a lead known only by its company", () => {
    expect(leadCanBecomeContact({ company_name: "Acme" })).toBe(false);
  });

  it("is true once the lead has a name, an email or a phone", () => {
    expect(leadCanBecomeContact({ last_name: "Pérez" })).toBe(true);
  });
});
