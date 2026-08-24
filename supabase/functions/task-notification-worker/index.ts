// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { readEmailConfig, sendEmail } from "./emailChannel.ts";
import {
  buildDigestMessage,
  groupForDelivery,
  isSupportedChannel,
  type ClaimedNotification,
} from "./notificationMessage.ts";

/**
 * The external-channel delivery worker (deliverable 2.5, §9.3).
 *
 * `dispatch_due_reminders()` fills the outbox every minute; in-app deliveries
 * are complete the moment the row exists, because Realtime streams it. Every
 * other channel needs somebody to pick the row up — that is this function.
 *
 * Three properties are the point:
 *
 *  - **Claims are exclusive.** `claim_task_notifications()` uses
 *    `for update skip locked`, so running this on a schedule AND by hand at the
 *    same time cannot double-send.
 *  - **Every outcome is recorded.** Sent, failed, or skipped for want of a
 *    provider — the row says which, and a terminal failure lands in the task's
 *    timeline as `reminder.failed` (O6).
 *  - **A channel with no provider is skipped explicitly**, never left queued.
 *    A row stuck at `queued` forever is indistinguishable from one about to go
 *    out, which is exactly the invisible failure this module exists to remove.
 *
 * Call it with the service-role key. Schedule it with pg_cron + pg_net, a
 * Supabase scheduled function, or any external cron:
 *
 *     curl -X POST "$SUPABASE_URL/functions/v1/task-notification-worker" \
 *          -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
 */

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRM_BASE_URL = Deno.env.get("CRM_BASE_URL") ?? "";
const BATCH_SIZE = Number(Deno.env.get("TASK_NOTIFICATION_BATCH_SIZE") ?? 50);

type Settlement = {
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string | null;
  error?: string | null;
};

/**
 * Delivers one group — a single notification, or a digest recipient's whole
 * batch collapsed into one message (§9.5). The verdict applies to every row in
 * the group, so a digest that failed does not leave part of its batch claiming
 * success.
 */
const deliver = async (group: ClaimedNotification[]): Promise<Settlement> => {
  const [first] = group;

  if (!isSupportedChannel(first.channel)) {
    return {
      status: "skipped",
      error: `no provider configured for channel '${first.channel}'`,
    };
  }

  const emailConfig = readEmailConfig((key) => Deno.env.get(key));
  if (!emailConfig) {
    return {
      status: "skipped",
      error:
        "email is not configured (POSTMARK_SERVER_TOKEN / TASK_REMINDER_FROM_EMAIL)",
    };
  }

  let message;
  try {
    message = buildDigestMessage(group, CRM_BASE_URL);
  } catch (error: unknown) {
    // A recipient with no address will never become deliverable, so this is
    // skipped rather than retried until the attempt budget runs out.
    return {
      status: "skipped",
      error: error instanceof Error ? error.message : "unbuildable message",
    };
  }

  const result = await sendEmail(message, emailConfig);
  return result.ok
    ? { status: "sent", providerMessageId: result.providerMessageId }
    : { status: "failed", error: result.error };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return createErrorResponse(405, "Method not allowed");
  }

  // The gateway accepts any valid project JWT, including the publishable key,
  // so the service-role check has to happen here. A worker anybody can trigger
  // is a way to burn somebody else's email quota.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!SERVICE_ROLE_KEY || authorization !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return createErrorResponse(401, "Unauthorized");
  }

  const { data: claimed, error } = await supabaseAdmin.rpc(
    "claim_task_notifications",
    { p_limit: BATCH_SIZE },
  );

  if (error) {
    return createErrorResponse(
      500,
      `Could not claim notifications: ${error.message}`,
    );
  }

  const notifications = (claimed ?? []) as ClaimedNotification[];
  const summary = {
    claimed: notifications.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const group of groupForDelivery(notifications)) {
    const settlement = await deliver(group);
    summary[settlement.status] += group.length;

    for (const notification of group) {
      const { error: settleError } = await supabaseAdmin.rpc(
        "complete_task_notification",
        {
          p_id: notification.id,
          p_status: settlement.status,
          p_provider_message_id: settlement.providerMessageId ?? null,
          p_error: settlement.error ?? null,
        },
      );

      // Leaving the row at `sending` is recoverable: the pg_cron sweep
      // (`requeue_stale_task_notifications`) puts it back in the queue.
      if (settleError) {
        console.error(
          `task-notification-worker: could not settle ${notification.id}: ${settleError.message}`,
        );
      }
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
