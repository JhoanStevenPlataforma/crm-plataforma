import type { DataProvider } from "ra-core";

import { stripQuoteVirtuals, updateDraftVersionFields } from "./quoteWrites";

const draft = {
  id: 10,
  quote_id: 1,
  version_number: 2,
  issued_at: null,
  valid_until: "2026-12-31",
  terms: "Net 30",
};

const issued = { ...draft, issued_at: "2026-09-01T10:00:00Z" };

/** A provider that records what it was asked to do and nothing else. */
const fakeProvider = (versions: Record<string, any>[]) => {
  const updates: { resource: string; id: unknown; data: unknown }[] = [];
  const provider = {
    getList: async () => ({ data: versions, total: versions.length }),
    update: async (resource: string, params: any) => {
      updates.push({ resource, id: params.id, data: params.data });
      return { data: { id: params.id } };
    },
  } as unknown as DataProvider;
  return { provider, updates };
};

describe("stripQuoteVirtuals", () => {
  it("drops what quotes_summary computes, so the write reaches a real column", () => {
    // PostgREST rejects the WHOLE statement on an unknown column, so a view
    // column posted back is a form that silently stops saving.
    const clean = stripQuoteVirtuals({
      title: "Renewal",
      company_name: "Acme",
      total: 642600,
      status_label: "Draft",
      nb_lines: 1,
    });

    expect(clean).toEqual({ title: "Renewal" });
  });

  it("drops valid_until and terms, which the version owns", () => {
    // Posting a CHANGED value to the header is refused outright
    // (`23514 quote_header_derived`): the header is a server-kept mirror.
    expect(
      stripQuoteVirtuals({ title: "Renewal", valid_until: "2027-01-31" }),
    ).toEqual({ title: "Renewal" });
  });

  it("keeps them on insert, where they seed version 1", () => {
    expect(
      stripQuoteVirtuals(
        { title: "Renewal", valid_until: "2027-01-31", company_name: "Acme" },
        { keepVersionFields: true },
      ),
    ).toEqual({ title: "Renewal", valid_until: "2027-01-31" });
  });
});

describe("updateDraftVersionFields", () => {
  it("writes only what changed, onto the draft version", async () => {
    const { provider, updates } = fakeProvider([draft]);

    await updateDraftVersionFields(
      provider,
      1,
      { valid_until: "2027-01-31", terms: "Net 30" },
      { valid_until: "2026-12-31", terms: "Net 30" },
    );

    expect(updates).toEqual([
      {
        resource: "quote_versions",
        id: 10,
        data: { valid_until: "2027-01-31" },
      },
    ]);
  });

  it("writes nothing when the form posts the record back unchanged", async () => {
    const { provider, updates } = fakeProvider([draft]);

    await updateDraftVersionFields(
      provider,
      1,
      { valid_until: "2026-12-31", terms: "Net 30", title: "Renewal" },
      { valid_until: "2026-12-31", terms: "Net 30", title: "Other" },
    );

    expect(updates).toEqual([]);
  });

  it("refuses to touch an issued version rather than failing the save", async () => {
    // An issued version is immutable forever (`quote_version_frozen`). Trying
    // would turn a header save into an error the user cannot act on.
    const { provider, updates } = fakeProvider([issued]);

    await updateDraftVersionFields(
      provider,
      1,
      { valid_until: "2027-01-31" },
      { valid_until: "2026-12-31" },
    );

    expect(updates).toEqual([]);
  });

  it("does nothing for a quote with no version at all", async () => {
    const { provider, updates } = fakeProvider([]);

    await updateDraftVersionFields(
      provider,
      1,
      { terms: "Net 60" },
      { terms: "Net 30" },
    );

    expect(updates).toEqual([]);
  });
});
