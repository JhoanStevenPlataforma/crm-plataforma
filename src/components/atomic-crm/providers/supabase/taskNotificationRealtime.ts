import type { SupabaseClient } from "@supabase/supabase-js";
import type { Identifier } from "ra-core";

import type { Unsubscribe } from "./quoteRealtime";

/** One channel per subscription, for the reason `quoteRealtime.ts` gives. */
let subscriptions = 0;

const SALE_ID = /^\d+$/;

/**
 * Tells the notification inbox that a row arrived for `recipientId` (tasks
 * proposal §9.4). `dispatch_due_reminders()` inserts in-app rows already
 * delivered, so the insert itself is the delivery.
 *
 * RLS restricts `task_notifications` to its own recipient and Realtime honours
 * RLS, so the filter narrows what the inbox hears and RLS decides whether it
 * may hear it at all.
 */
export const subscribeToTaskNotifications = async (
  client: SupabaseClient,
  recipientId: Identifier,
  onInsert: () => void,
): Promise<Unsubscribe> => {
  // The id ends up inside a filter string: anything but digits is not a sale.
  if (!SALE_ID.test(String(recipientId))) return () => {};

  subscriptions += 1;
  const channel = client
    .channel(`task-notifications-${recipientId}-${subscriptions}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "task_notifications",
        filter: `recipient_id=eq.${recipientId}`,
      },
      onInsert,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
};
