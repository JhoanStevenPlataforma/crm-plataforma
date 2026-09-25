import { useLayoutEffect, useState } from "react";

/**
 * The height that makes an element end at the bottom of the viewport, measured
 * from where it sits in the page — so a sideways-scrolling board keeps its
 * scrollbar on screen instead of below the fold, whatever is stacked above it.
 *
 * Returns a callback ref rather than taking a ref object: the element usually
 * mounts after the first render (behind a loading state), and an effect keyed
 * on a ref object would never learn that it appeared.
 *
 * Measured against the document, not the current scroll position, so the
 * value does not change as the page scrolls. Re-measured on resize and when
 * the content above it changes height (a summary band that loads late).
 * Never below `min`: on a short window the page scrolls a little rather than
 * squeezing the element to nothing.
 */
export const useViewportFill = ({
  bottomGap = 24,
  min = 420,
}: { bottomGap?: number; min?: number } = {}): [
  (element: HTMLElement | null) => void,
  number | undefined,
] => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    if (!element) return;

    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(
        Math.max(min, Math.round(window.innerHeight - top - bottomGap)),
      );
    };

    measure();
    window.addEventListener("resize", measure);
    // The element's own size is set from this value, so watch what sits above
    // it (the parent's other children), not the element itself.
    const observer = new ResizeObserver(measure);
    for (const sibling of element.parentElement?.children ?? []) {
      if (sibling !== element) observer.observe(sibling);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [element, bottomGap, min]);

  return [setElement, height];
};
