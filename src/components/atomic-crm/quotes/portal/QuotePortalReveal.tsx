import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** How much of the element must be on screen before it animates in. */
const REVEAL_THRESHOLD = 0.16;

const EFFECTS = {
  /** Text and cards: rise and fade in. */
  rise: "translate-y-9 opacity-0 duration-800 ease-[cubic-bezier(.2,.8,.2,1)]",
  /** Pictures: settle from a slight zoom-out and fade in. */
  zoom: "scale-96 opacity-0 duration-1000 ease-out",
} as const;

/**
 * Animates its content in the first time it scrolls into view, then leaves it
 * alone. Used on the presentation only — NEVER on the quotation sheet: the
 * offer is never hidden behind an animation, and a browser that runs no
 * observer must still show every figure.
 *
 * Starts visible where it cannot animate (no `IntersectionObserver`), and a
 * reader who asked for reduced motion gets the content with no movement
 * (`motion-reduce:`).
 */
export const QuotePortalReveal = ({
  children,
  effect = "rise",
  className,
}: {
  children: ReactNode;
  effect?: keyof typeof EFFECTS;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const element = ref.current;
    if (isVisible || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: REVEAL_THRESHOLD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,translate,scale] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:opacity-100 motion-reduce:transition-none",
        EFFECTS[effect],
        isVisible && "translate-y-0 scale-100 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
};
