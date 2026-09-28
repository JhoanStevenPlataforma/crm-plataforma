import { NAV_SECTIONS, type NavItem } from "./navigation";

/** Already one tap away in the bottom bar, so not repeated in the sheet. */
const IN_BOTTOM_BAR = new Set(["dashboard", "contacts", "tasks"]);

/**
 * Every other module, from the same `NAV_SECTIONS` the desktop sidebar reads,
 * so the phone can never again lose a module the desktop has. Items keep their
 * `canAccess` gate exactly as in the sidebar.
 */
export const MOBILE_MORE_SECTIONS = NAV_SECTIONS.map((section) => ({
  ...section,
  items: section.items
    .filter((item) => !IN_BOTTOM_BAR.has(item.key))
    .map(ungateMobileSettings),
})).filter((section) => section.items.length > 0);

/**
 * On the phone `/settings` is `SettingsPageMobile` — the user's own profile,
 * theme and sign-out — not the admin configuration it is on the desktop. Every
 * user had it in the bottom bar before this menu existed, so it keeps no gate.
 */
function ungateMobileSettings(item: NavItem): NavItem {
  return item.key === "preferences" ? { ...item, access: undefined } : item;
}
