import { useQueryClient } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetIdentity,
  useGetList,
  useUpdate,
} from "ra-core";
import { useEffect } from "react";

import type { CrmDataProvider } from "../providers/types";
import type { TaskNotification } from "../types";

/** How many unread notifications the bell lists before "see all". */
const INBOX_PAGE_SIZE = 20;

/**
 * The in-app notification inbox (proposal §9.4, deliverable 2.2).
 *
 * There is no worker behind in-app delivery: `dispatch_due_reminders()` inserts
 * the outbox row already marked delivered, and Supabase Realtime streams that
 * insert to the recipient. This hook only has to invalidate the query when the
 * data provider announces a row — the list itself stays a normal `useGetList`,
 * so it works identically with FakeRest, whose announcement is a no-op.
 */
export const useTaskNotifications = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
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

    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    const onInsert = () => {
      void queryClient.invalidateQueries({ queryKey: ["task_notifications"] });
    };

    dataProvider.subscribeToTaskNotifications(identity.id, onInsert).then(
      (stop) => {
        // Left before the subscription was up: stop it straight away.
        if (isActive) unsubscribe = stop;
        else stop();
      },
      () => {
        // No socket: the inbox still works, it just refreshes on navigation
        // rather than instantly. Degrading quietly beats a broken header.
      },
    );

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [dataProvider, identity?.id, queryClient]);

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
