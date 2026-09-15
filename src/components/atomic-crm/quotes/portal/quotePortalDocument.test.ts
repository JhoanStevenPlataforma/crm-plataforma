import { fromPortalPayload } from "../quoteDocumentData";
import { portalPayload } from "./quotePortalFixtures";

const BUILD_BRANDING = {
  title: "Plataforma Software",
  logo_url: "/assets/logo_light.svg",
};

describe("fromPortalPayload", () => {
  it("prints the customer as the snapshot took them, and the figures as they were frozen", () => {
    const data = fromPortalPayload(portalPayload, BUILD_BRANDING);

    expect(data.parties).toEqual({
      company: {
        name: "Acme Andina",
        address: "Calle 80 # 11-42",
        zipcode: null,
        city: "Bogotá",
        state: null,
        country: "Colombia",
        tax_identifier: "900.555.123-4",
        phone: null,
        website: null,
      },
      contact: {
        name: "Lucía Gómez",
        title: "Purchasing",
        email: "lucia@acme.example",
        phone: null,
      },
      owner_name: "Jane Doe",
    });
    expect(data.totals).toEqual(portalPayload.totals);
    expect(data.lines.map((line) => [line.name, line.line_total])).toEqual([
      ["Annual support", 1285200],
      ["Onboarding", 2142000],
    ]);
    expect(data.quote.issued_at).toBe(portalPayload.quote.issued_at);
  });

  // The portal page never loads the installation's configuration (F3), so a
  // missing letterhead must fall back to the build's, and a present one must
  // never be mixed with it.
  it("prints the installation's letterhead, and the build's only when the installation set none", () => {
    expect(fromPortalPayload(portalPayload, BUILD_BRANDING).branding).toEqual({
      title: "Acme CRM",
      logo_url: null,
    });
    expect(
      fromPortalPayload(
        { ...portalPayload, branding: { title: null, logo_url: null } },
        BUILD_BRANDING,
      ).branding,
    ).toEqual(BUILD_BRANDING);
    expect(
      fromPortalPayload(
        {
          ...portalPayload,
          branding: { title: null, logo_url: "data:image/png;base64,AAAA" },
        },
        BUILD_BRANDING,
      ).branding,
    ).toEqual({
      title: "Plataforma Software",
      logo_url: "data:image/png;base64,AAAA",
    });
  });
});
