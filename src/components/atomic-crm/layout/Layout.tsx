import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";

/**
 * The application shell: fixed navigation on the left, content on the right.
 *
 * Replaces a centred column under a row of tabs. Two changes matter beyond the
 * look. The content is no longer capped at `max-w-screen-xl` -- the kanban and
 * the reporting screens are the widest things in the product and were being
 * squeezed on exactly the displays that could afford them. And the navigation
 * is now a persistent structure rather than seven peers, so where a screen sits
 * in the product is legible from the screen itself.
 *
 * The sidebar collapses to an icon rail (the trigger in the topbar, or ctrl+B)
 * and its state persists in a cookie, so a user who works in the kanban all day
 * keeps their width back.
 */
export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* `app-canvas`: the ground with its ambient light (index.css). */}
      <SidebarInset className="app-canvas min-w-0">
        <Topbar />
        <main
          className="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:px-8 lg:py-6"
          id="main-content"
        >
          <ErrorBoundary FallbackComponent={Error}>
            <Suspense
              fallback={
                <div className="flex flex-col gap-4">
                  <Skeleton className="h-9 w-56" />
                  <Skeleton className="h-64 w-full" />
                </div>
              }
            >
              {children}
            </Suspense>
          </ErrorBoundary>
        </main>
      </SidebarInset>
      <Notification />
    </SidebarProvider>
  );
};
