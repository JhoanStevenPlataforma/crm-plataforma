import { NAV_SECTIONS } from "./navigation";

/** Already one tap away in the bottom bar, so not repeated in the sheet. */
const IN_BOTTOM_BAR = new Set(["dashboard", "contacts", "tasks"]);

/**
 * Every other module, from the same `NAV_SECTIONS` the desktop sidebar reads,
 * so the phone can never again lose a module the desktop has. Items keep their
 * `canAccess` gate exactly as in the sidebar.
 */
export const MOBILE_MORE_SECTIONS = NAV_SECTIONS.map((section) => ({
  ...section,
  items: section.items.filter((item) => !IN_BOTTOM_BAR.has(item.key)),
})).filter((section) => section.items.length > 0);
