import { Skeleton } from "@/components/ui/skeleton";

import { AuthLayout } from "./AuthLayout";

/**
 * Shown while `isInitialized()` decides between the sign-in form and the
 * first-run signup redirect.
 *
 * It renders inside the real shell and mirrors the card's actual blocks, so the
 * page does not jump when the answer arrives — the previous version was a
 * centred column of grey bars on a white page, which then swapped for a dark
 * screen.
 */
export const LoginSkeleton = () => (
  <AuthLayout>
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-12 rounded-xl" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  </AuthLayout>
);
