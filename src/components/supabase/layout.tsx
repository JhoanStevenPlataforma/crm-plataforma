import * as React from "react";

import {
  AuthBrand,
  AuthLayout,
} from "@/components/atomic-crm/login/AuthLayout";

/**
 * The shell for the auth pages Supabase owns: forgot password, set password,
 * OAuth consent.
 *
 * It delegates to `login/AuthLayout` rather than carrying its own markup, so a
 * user who follows a recovery link does not land on a screen that looks like a
 * different product from the one they just tried to sign in to. `AuthLayout`
 * mounts `<Notification>` itself, which is why this file no longer does.
 */
export const Layout = ({ children }: React.PropsWithChildren) => (
  <AuthLayout>
    <div className="flex flex-col gap-6">
      <AuthBrand />
      {children}
    </div>
  </AuthLayout>
);
