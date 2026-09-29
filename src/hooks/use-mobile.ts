import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/** Tailwind's `lg`: below it a side panel beside the content leaves no room. */
export const COMPACT_BREAKPOINT = 1024;

/** True while the window is narrower than `breakpoint` pixels. */
export function useIsBelow(breakpoint: number) {
  const [isBelow, setIsBelow] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => {
      setIsBelow(window.innerWidth < breakpoint);
    };
    mql.addEventListener("change", onChange);
    setIsBelow(window.innerWidth < breakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return !!isBelow;
}

export function useIsMobile() {
  return useIsBelow(MOBILE_BREAKPOINT);
}
