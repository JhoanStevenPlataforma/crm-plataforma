import { type ReactNode } from "react";

/**
 * The frame for a desktop screen opened on a phone. Mobile screens bring their
 * own `MobileContent` (and header); a desktop screen has neither, so without
 * this it would touch the screen edges and end under the bottom navigation.
 *
 * `--bottom-nav` is that navigation's height (`h-14`): the bars a desktop
 * screen pins to the bottom (form toolbar, settings save bar) sit on it.
 */
export const MobileDesktopPage = ({ children }: { children: ReactNode }) => (
  <main
    className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-24 min-h-screen [--bottom-nav:--spacing(14)]"
    id="main-content"
  >
    {children}
  </main>
);

export const MobileContent = ({ children }: { children: ReactNode }) => (
  <main
    className="max-w-screen-xl mx-auto pt-18 px-4 pb-20 min-h-screen overflow-y-auto"
    id="main-content"
  >
    {children}
  </main>
);
