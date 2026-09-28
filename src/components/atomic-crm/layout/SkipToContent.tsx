import { useTranslate } from "ra-core";

/**
 * "Skip to content": the first thing a keyboard user reaches, so the sidebar's
 * dozen links are not crossed on every page. Hidden until focused.
 *
 * Moves focus with script rather than following `#main-content`: the app runs
 * on a hash router, where that href would be read as a route.
 */
export const SkipToContent = ({ targetId }: { targetId: string }) => {
  const translate = useTranslate();
  return (
    <a
      href={`#${targetId}`}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(targetId)?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-float"
    >
      {translate("crm.navigation.skip_to_content")}
    </a>
  );
};
