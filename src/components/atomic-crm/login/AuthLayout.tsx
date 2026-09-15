import type { ReactNode } from "react";

import { LocalesMenuButton } from "@/components/admin/locales-menu-button";
import { Notification } from "@/components/admin/notification";

import { useConfigurationContext } from "../root/ConfigurationContext";

/**
 * The shell every unauthenticated screen sits in.
 *
 * A dark full-bleed ground with a light card floating on it. The contrast is
 * doing a job, not a decoration: the authenticated application is a light,
 * dense working surface, so making the door dark tells a returning user at a
 * glance that they are outside it. It is also the one screen in the product
 * with a single task, which is why the card is narrow and centred and nothing
 * else competes with it.
 *
 * The background is three CSS layers over a flat colour — a hairline grid and
 * two opposed radial glows — rather than an image. That keeps the login free of
 * a network request that would delay the only thing on the page, and it renders
 * identically at any viewport.
 *
 * `<Notification>` is mounted here because every auth page needs it and the
 * pages themselves are just forms.
 */
export const AuthLayout = ({
  children,
  footer,
}: {
  children: ReactNode;
  /** Rendered under the card, inside its column. Used for secondary links. */
  footer?: ReactNode;
}) => (
  <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0F1216] text-[#ECEEF1]">
    {/* The grid. Deliberately below the threshold where it reads as a pattern:
        it gives the ground a sense of surface without becoming something to
        look at. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.055) 1px, transparent 1px)," +
          "linear-gradient(to bottom, rgba(255,255,255,0.055) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    />
    {/* Two lights, and they are not decoration: warm in the brand hue at the
        top left, cool at the bottom right. A single source makes a flat panel;
        opposing temperatures at opposite corners give the ground depth, which
        is what lets the white card read as floating above it rather than as a
        hole cut into it. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -left-64 -top-64 size-208 rounded-full blur-3xl"
      style={{
        background:
          "radial-gradient(circle, rgba(224,138,46,0.22) 0%, rgba(224,138,46,0) 68%)",
      }}
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-72 -right-64 size-208 rounded-full blur-3xl"
      style={{
        background:
          "radial-gradient(circle, rgba(60,110,190,0.20) 0%, rgba(60,110,190,0) 68%)",
      }}
    />

    <header className="relative z-10 flex items-center justify-end gap-2 px-4 py-4 sm:px-8">
      {/* The one control here that has somewhere to go. */}
      <LocalesMenuButton />
    </header>

    <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-surface p-6 text-foreground shadow-2xl shadow-black/50 sm:p-10">
          {children}
        </div>
        {footer}
      </div>
    </main>

    <Notification />
  </div>
);

/**
 * The product mark at the top of the card.
 *
 * The logo is a wordmark: it carries the product name itself, so no title text
 * is rendered beside it. The previous tile-plus-name arrangement would now show
 * the name twice.
 *
 * It reads the light variant because the card is light, and it reads it from
 * the configuration, so rebranding stays a Settings operation here exactly as
 * it is in the sidebar.
 */
export const AuthBrand = () => {
  const { darkModeLogo, title } = useConfigurationContext();

  return (
    <img
      src={darkModeLogo}
      alt={title}
      className="h-11 w-auto max-w-[16rem] object-contain"
    />
  );
};
