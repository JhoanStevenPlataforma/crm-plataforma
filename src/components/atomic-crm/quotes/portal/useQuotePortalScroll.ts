import { useEffect, useRef, useState } from "react";

/** How far down the page the "back to top" button starts to earn its place. */
const TO_TOP_THRESHOLD_PX = 700;

/**
 * Brings a section of the portal into view.
 *
 * A BUTTON, NEVER AN `<a href="#…">`: the portal lives at `/quote#<token>`, and
 * the fragment IS the credential. An in-page anchor would replace the token in
 * the address bar, and the next reload would open a page with no quotation.
 */
export const scrollToSection = (id: string) => {
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
};

/**
 * The reading aids the portal draws around the proposal: which section is in
 * the middle of the screen (the dot navigation) and whether the reader has
 * scrolled far enough for "back to top" to be useful.
 *
 * The progress bar is not here on purpose: it moves on every scroll event, and
 * a state change per event would re-render the document with it. It writes its
 * own width through a ref (`useScrollProgressRef`).
 */
export const useQuotePortalScroll = (
  sectionIds: readonly string[],
  /** False while the sections are not on the page yet (loading, failure). */
  isReady: boolean,
) => {
  const [activeId, setActiveId] = useState<string | null>(
    sectionIds[0] ?? null,
  );
  const [isPastFold, setIsPastFold] = useState(false);
  const idsKey = sectionIds.join("|");

  useEffect(() => {
    const onScroll = () => setIsPastFold(window.scrollY > TO_TOP_THRESHOLD_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isReady || typeof IntersectionObserver === "undefined") return;
    const elements = idsKey
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element != null);
    // A band across the middle of the viewport: the section crossing it is the
    // one being read, whatever its height.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [idsKey, isReady]);

  return { activeId, isPastFold };
};

/** The reading-progress bar's width, written straight to the element. */
export const useScrollProgressRef = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      ref.current.style.transform = `scaleX(${Math.min(Math.max(ratio, 0), 1)})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return ref;
};
