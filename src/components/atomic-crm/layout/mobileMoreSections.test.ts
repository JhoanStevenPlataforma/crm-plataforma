import { MOBILE_MORE_SECTIONS } from "./mobileMoreSections";
import { NAV_SECTIONS } from "./navigation";

const keysOf = (sections: typeof NAV_SECTIONS) =>
  sections.flatMap((section) => section.items.map((item) => item.key));

describe("MOBILE_MORE_SECTIONS", () => {
  it("offers every desktop module the bottom bar does not already have", () => {
    const desktop = keysOf(NAV_SECTIONS).filter(
      (key) => !["dashboard", "contacts", "tasks"].includes(key),
    );
    expect(keysOf(MOBILE_MORE_SECTIONS)).toEqual(desktop);
    // The modules that answered "Not found" on a phone before this menu.
    for (const key of ["leads", "deals", "quotes", "companies", "analytics"]) {
      expect(keysOf(MOBILE_MORE_SECTIONS)).toContain(key);
    }
  });

  it("keeps each module's access gate, settings included", () => {
    const items = MOBILE_MORE_SECTIONS.flatMap((section) => section.items);
    expect(items.find((item) => item.key === "deals")?.access).toEqual({
      resource: "deals",
      action: "list",
    });
    // `/settings` is the admin configuration on the phone too; the personal
    // settings (profile, theme, sign-out) live in the sheet's account block.
    expect(items.find((item) => item.key === "preferences")?.access).toEqual({
      resource: "configuration",
      action: "edit",
    });
  });
});
