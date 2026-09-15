import { useTranslate } from "ra-core";

import poweredByLogo from "../root/logos/logo_plataforma_dark.svg";

/**
 * The vendor's mark under the sign-in card.
 *
 * Imported as a fixed asset rather than read from the configuration, and that
 * is the whole point of it: the logo at the top of the card is the CUSTOMER's,
 * replaceable in Settings, while this one says who built the product. Wiring it
 * to the same configuration value would make it disappear the moment somebody
 * rebranded, which is the one case it exists for.
 *
 * It uses the dark-mode lockup because it sits outside the card, on the dark
 * ground. Small and dimmed: it is an attribution, not a second logo competing
 * with the one just above it. Not smaller than 18px, though -- the mark is a
 * two-line wordmark and its second line turns to mush below that, which is
 * noise rather than discretion.
 */
export const PoweredBy = () => {
  const translate = useTranslate();

  return (
    <p className="flex items-center justify-center gap-2 text-xs text-white/40">
      {translate("crm.auth.powered_by")}
      <img
        src={poweredByLogo}
        alt="Plataforma Software"
        className="h-[18px] w-auto object-contain opacity-80"
      />
    </p>
  );
};
