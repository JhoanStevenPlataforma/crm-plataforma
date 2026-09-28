import { useTranslate, type TranslateFunction } from "ra-core";
import { useEffect } from "react";
import { useLocation } from "react-router";

import { isNavItemActive, NAV_SECTIONS } from "./navigation";

/**
 * The product name the tab shows today (`<title>` in index.html), read once so
 * a branded build keeps its own.
 */
const BASE_TITLE = typeof document === "undefined" ? "" : document.title;

/**
 * "Deals · Hermes CRM" for `/deals/12/show`.
 *
 * Read from the navigation data, like the sidebar, so a screen added there
 * gets a tab title for free. The most specific match wins (`/teams-dashboard`
 * over `/`); a route outside the menu keeps the product name alone.
 */
export const documentTitleFor = (
  pathname: string,
  translate: TranslateFunction,
  base: string = BASE_TITLE,
): string => {
  const item = NAV_SECTIONS.flatMap((section) => section.items)
    .filter((candidate) => isNavItemActive(candidate, pathname))
    .sort((a, b) => b.match.length - a.match.length)[0];
  if (!item) return base;
  const label = translate(item.labelKey, item.labelOptions);
  return base ? `${label} · ${base}` : label;
};

/**
 * Keeps `document.title` on the current screen: every tab used to read the
 * same name, which is useless in a tab strip and in a screen reader's window
 * list.
 */
export const useDocumentTitle = () => {
  const { pathname } = useLocation();
  const translate = useTranslate();
  useEffect(() => {
    document.title = documentTitleFor(pathname, translate);
  }, [pathname, translate]);
};
