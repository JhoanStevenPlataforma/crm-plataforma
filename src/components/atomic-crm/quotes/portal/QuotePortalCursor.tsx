import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { fx } from "./quotePortalFx";

/** How far the ring closes on the pointer per frame (0-1): its lag. */
const FOLLOW = 0.18;

const INTERACTIVE = "a, button, input, textarea, select, label, [role=button]";

/**
 * FX-27: an amber ring that trails the pointer and swells over anything that
 * can be clicked. The system cursor stays — the ring is an accent, not a
 * replacement, so nobody loses track of where they point.
 *
 * Desktop only: rendered when the device has a fine pointer that hovers and
 * the reader has not asked for reduced motion. Moves by writing `transform`
 * on its own element each frame, so the page never re-renders for it.
 */
export const QuotePortalCursor = () => {
  const [isEnabled] = useState(
    () =>
      fx(27) &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const ring = useRef<HTMLDivElement>(null);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isEnabled) return;
    const target = { x: -100, y: -100 };
    const position = { ...target };
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      setIsVisible(true);
      const element = event.target as Element | null;
      setIsOverTarget(Boolean(element?.closest?.(INTERACTIVE)));
    };
    const onLeave = () => setIsVisible(false);
    const tick = () => {
      position.x += (target.x - position.x) * FOLLOW;
      position.y += (target.y - position.y) * FOLLOW;
      if (ring.current) {
        ring.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`;
      }
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, [isEnabled]);

  if (!isEnabled) return null;
  return (
    <div
      ref={ring}
      aria-hidden
      className="quote-print-hide pointer-events-none fixed top-0 left-0 z-[60]"
    >
      <div
        className={cn(
          "rounded-full border-2 border-brand transition-[width,height,opacity,background-color] duration-300",
          isOverTarget ? "size-12 bg-brand/10" : "size-7",
          isVisible ? "opacity-70" : "opacity-0",
        )}
      />
    </div>
  );
};
