import { useEffect } from "react";

import { fx } from "./quotePortalFx";

/** FX-28: the display face's stylesheet, from its publisher's CDN. */
const DISPLAY_FONT_HREF =
  "https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap";

/**
 * FX-28: loads the display typeface while the portal is open, and only then —
 * the CRM's own screens never request it. If the CDN is unreachable (or a
 * content policy refuses it) the headings fall back to Inter, which is what
 * `.qp-display` names second.
 */
export const useQuotePortalDisplayFont = () => {
  useEffect(() => {
    if (!fx(28)) return;
    const existing = document.querySelector(
      `link[href="${DISPLAY_FONT_HREF}"]`,
    );
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = DISPLAY_FONT_HREF;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
};
