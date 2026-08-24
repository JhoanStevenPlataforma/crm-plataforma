import { useQueryClient } from "@tanstack/react-query";
import { useGetIdentity, useGetList, useUpdate } from "ra-core";
import { useEffect } from "react";

import type { TaskNotification } from "../types";

/** How many unread notifications the bell lists before "see all". */
const INBOX_PAGE_SIZE = 20;

/**
 * The in-app notification inbox (proposal §9.4, deliverable 2.2).
 *
 * There is no worker behind in-app delivery: `dispatch_due_reminders()` inserts
 * the outbox row already marked delivered, and Supabase Realtime streams that
 * insert to the recipient. This hook only has to invalidate the query when a
 * row arrives — the list itself stays a normal `useGetList`, so it works
 * identically with FakeRest, where there is no socket at all.
 *
 * RLS restricts `task_notifications` to its own recipient and Realtime honours
 * RLS, so the subscription cannot surface somebody else's notification even
 * though the channel name is shared.
 */
export const useTaskNotifications = () => {
  const queryClient = useQueryClient();
  const { identity } = useGetIdentity();

  const { data, total, isPending, refetch } = useGetList<TaskNotification>(
    "task_notifications",
    {
      filter: { channel: "in_app", "read_at@is": null },
      sort: { field: "created_at", order: "DESC" },
      pagination: { page: 1, perPage: INBOX_PAGE_SIZE },
    },
    { enabled: identity?.id != null },
  );

  useEffect(() => {
    if (identity?.id == null) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    // Imported lazily and defensively: demo mode never loads a Supabase client,
    // and a build without the env vars must not crash the header over a
    // notification badge.
    const subscribe = async () => {
      try {
        const { getSupabaseClient } = await import(
          "../providers/supabase/supabase"
        );
        const client = getSupabaseClient();
        if (cancelled) return;

        const channel = client
          .channel(`task-notifications-${identity.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "task_notifications",
              filter: `recipient_id=eq.${identity.id}`,
            },
            () => {
              queryClient.invalidateQueries({
                queryKey: ["task_notifications"],
              });
            },
          )
          .subscribe();

        unsubscribe = () => {
          client.removeChannel(channel);
        };
      } catch {
        // No socket: the inbox still works, it just refreshes on navigation
        // rather than instantly. Degrading quietly beats a broken header.
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [identity?.id, queryClient]);

  const [update] = useUpdate();

  const markAsRead = (notification: TaskNotification) =>
    update(
      "task_notifications",
      {
        id: notification.id,
        data: { read_at: new Date().toISOString() },
        previousData: notification,
      },
      { onSuccess: () => refetch() },
    );

  return {
    notifications: data ?? [],
    unreadCount: total ?? 0,
    isPending,
    markAsRead,
  };
};
