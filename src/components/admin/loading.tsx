import { Translate, useTimeout } from "ra-core";

import { HermesLoader } from "@/components/ui/hermes-loader";

/**
 * Loading indicator used for slow element or page loads.
 *
 * Displays the Hermes caduceus and customizable loading messages.
 * Automatically shown by the default Layout when page loading takes more than 1 second.
 * Works as a fallback for React Suspense boundaries.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/loading/ Loading documentation}
 */
export const Loading = (props: LoadingProps) => {
  const {
    loadingPrimary = "ra.page.loading",
    loadingSecondary = "ra.message.loading",
    delay = 1000,
    ...rest
  } = props;
  const oneSecondHasPassed = useTimeout(delay);
  return oneSecondHasPassed ? (
    <div
      role="status"
      className="flex h-full flex-col items-center justify-center gap-5 py-10 animate-in fade-in-0 duration-300"
      {...rest}
    >
      {/* The messages below name the wait, so the drawing stays silent. */}
      <HermesLoader size="lg" label={null} />
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-foreground">
          <Translate i18nKey={loadingPrimary}>{loadingPrimary}</Translate>
        </p>
        <p className="text-xs text-muted-foreground">
          <Translate i18nKey={loadingSecondary}>{loadingSecondary}</Translate>
        </p>
      </div>
    </div>
  ) : null;
};

export interface LoadingProps {
  loadingPrimary?: string;
  loadingSecondary?: string;
  delay?: number;
}
