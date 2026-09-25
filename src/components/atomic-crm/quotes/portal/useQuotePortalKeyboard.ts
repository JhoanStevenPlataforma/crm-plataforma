import { useEffect } from "react";

import { scrollToSection } from "./useQuotePortalScroll";

/**
 * Where a key sends the reader, or null to leave the key to the browser.
 *
 * The presentation is one screen per section, so ↓ / PageDown / Space mean
 * "the next slide", not "a little further". The quotation is different: it is
 * a document taller than the screen, and inside it the keys scroll as they
 * always do — only ↑ / PageUp at its top, Home and End are taken over.
 */
export const sectionForKey = ({
  key,
  sectionIds,
  activeId,
  quotationId,
  isAtQuotationTop,
}: {
  key: string;
  sectionIds: readonly string[];
  activeId: string | null;
  quotationId: string;
  isAtQuotationTop: boolean;
}): string | null => {
  const index = activeId ? sectionIds.indexOf(activeId) : -1;
  if (key === "Home") return sectionIds[0] ?? null;
  if (key === "End") return quotationId;
  if (index < 0) return null;

  const isInQuotation = activeId === quotationId;
  if (key === "ArrowDown" || key === "PageDown" || key === " ") {
    return isInQuotation ? null : (sectionIds[index + 1] ?? null);
  }
  if (key === "ArrowUp" || key === "PageUp") {
    if (isInQuotation && !isAtQuotationTop) return null;
    return sectionIds[index - 1] ?? null;
  }
  return null;
};

/**
 * Anything the reader types into, plays or answers keeps its keys; a focused
 * button or link keeps Space, which presses it.
 */
const ownsKey = (target: EventTarget | null, key: string) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT", "VIDEO", "IFRAME"].includes(
      target.tagName,
    ) ||
    target.closest("[role=dialog]") != null ||
    (key === " " && ["BUTTON", "A"].includes(target.tagName)));

/**
 * Keyboard navigation between the portal's sections, for a reader without a
 * mouse. Off while a dialog is open or a field has focus.
 */
export const useQuotePortalKeyboard = ({
  sectionIds,
  activeId,
  quotationId,
  isReady,
}: {
  sectionIds: readonly string[];
  activeId: string | null;
  quotationId: string;
  isReady: boolean;
}) => {
  const idsKey = sectionIds.join("|");

  useEffect(() => {
    if (!isReady) return;
    const ids = idsKey.split("|");
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        ownsKey(event.target, event.key)
      ) {
        return;
      }
      const quotation = document.getElementById(quotationId);
      const target = sectionForKey({
        key: event.key,
        sectionIds: ids,
        activeId,
        quotationId,
        isAtQuotationTop:
          quotation != null && quotation.getBoundingClientRect().top >= -8,
      });
      if (!target) return;
      event.preventDefault();
      scrollToSection(target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [idsKey, activeId, quotationId, isReady]);
};
