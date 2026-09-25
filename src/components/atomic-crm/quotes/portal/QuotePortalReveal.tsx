import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** How much of the element must be on screen for it to count as shown. */
const REVEAL_THRESHOLD = 0.16;

/** Where the element is relative to the viewport. */
type Placement = "shown" | "above" | "below";

const SHOWN =
  "translate-y-0 scale-100 opacity-100 [transform:perspective(1400px)_rotateY(0deg)]";

const EFFECTS = {
  /** Text and cards: rise into place and fade in. */
  rise: {
    base: "duration-800 ease-[cubic-bezier(.2,.8,.2,1)]",
    above: "-translate-y-9 opacity-0",
    below: "translate-y-9 opacity-0",
  },
  /** Pictures: settle from a slight zoom-out and fade in. */
  zoom: {
    base: "duration-1000 ease-out",
    above: "scale-96 opacity-0",
    below: "scale-96 opacity-0",
  },
  /** FX-09: a picture on the left turns in from its outer edge… */
  "tilt-left": {
    base: "duration-1100 ease-[cubic-bezier(.2,.8,.2,1)]",
    above: "scale-96 opacity-0 [transform:perspective(1400px)_rotateY(14deg)]",
    below: "scale-96 opacity-0 [transform:perspective(1400px)_rotateY(14deg)]",
  },
  /** FX-09: …and one on the right from the other side. */
  "tilt-right": {
    base: "duration-1100 ease-[cubic-bezier(.2,.8,.2,1)]",
    above: "scale-96 opacity-0 [transform:perspective(1400px)_rotateY(-14deg)]",
    below: "scale-96 opacity-0 [transform:perspective(1400px)_rotateY(-14deg)]",
  },
} as const;

export type RevealEffect = keyof typeof EFFECTS;

/**
 * Animates its content in every time it scrolls into view and out every time
 * it leaves, in both directions. Used on the presentation only — NEVER on the
 * quotation sheet: the offer is never hidden behind an animation, and a
 * browser that runs no observer must still show every figure.
 *
 * THE HIDDEN OFFSET ALWAYS POINTS AWAY FROM THE SCREEN. Something that left
 * over the top waits above its place and comes back down; something below
 * waits below and rises. The observer measures the transformed box, so the
 * offset moving the element further out is also what keeps it from flickering
 * at the threshold: hiding makes it less visible, showing makes it more.
 *
 * `delay` staggers siblings on the way IN only (FX-12); leaving is immediate,
 * so a slide scrolled past never lingers half-drawn. `data-shown` lets a child
 * animate with its wrapper (`group-data-[shown=true]:…`, FX-13).
 *
 * Starts shown where it cannot animate (no `IntersectionObserver`), and a
 * reader who asked for reduced motion gets the content with no movement
 * (`motion-reduce:`).
 */
export const QuotePortalReveal = ({
  children,
  effect = "rise",
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  effect?: RevealEffect;
  /** Milliseconds before this element starts to come in. */
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) => {
  const ref = useRef<HTMLElement>(null);
  const [placement, setPlacement] = useState<Placement>(() =>
    typeof IntersectionObserver === "undefined" ? "shown" : "below",
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) {
          setPlacement("shown");
        } else {
          const viewportTop = entry.rootBounds?.top ?? 0;
          setPlacement(
            entry.boundingClientRect.top < viewportTop ? "above" : "below",
          );
        }
      },
      { threshold: REVEAL_THRESHOLD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const styles = EFFECTS[effect];
  const isShown = placement === "shown";
  return (
    <Tag
      // The ref is typed for the element either tag renders.
      ref={ref as never}
      data-shown={isShown}
      style={
        isShown && delay > 0 ? { transitionDelay: `${delay}ms` } : undefined
      }
      className={cn(
        "group transition-[opacity,translate,scale,transform] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none",
        styles.base,
        isShown ? SHOWN : styles[placement],
        className,
      )}
    >
      {children}
    </Tag>
  );
};
