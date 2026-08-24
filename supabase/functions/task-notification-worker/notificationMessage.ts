/**
 * Turning one outbox row into the message a provider will accept (§9.3, §9.4).
 *
 * Pure on purpose: the interesting decisions here — what the subject says when
 * a reminder has no title, whether the due date is rendered, how the task is
 * linked back to — are the ones worth testing without a network or a database.
 */

export type ClaimedNotification = {
  id: number;
  task_id: number;
  channel: string;
  recipient_id: number;
  recipient_email: string | null;
  recipient_name: string | null;
  /** Set when the recipient asked for one message a day instead of N (§9.5). */
  recipient_digest: boolean;
  title: string | null;
  body: string | null;
  scheduled_for: string;
  attempt: number;
  task_title: string | null;
  task_due_date: string | null;
};

export type EmailMessage = {
  to: string;
  subject: string;
  textBody: string;
};

/** Channels this worker can actually deliver. The rest are settled `skipped`. */
export const SUPPORTED_CHANNELS = ["email"] as const;

export const isSupportedChannel = (channel: string): boolean =>
  (SUPPORTED_CHANNELS as readonly string[]).includes(channel);

const formatDueDate = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
};

/**
 * The task link is what makes a reminder actionable rather than a nag. Without
 * a configured base URL the message still goes out — a reminder with no link
 * beats no reminder at all.
 */
const taskUrl = (baseUrl: string, taskId: number): string | null =>
  baseUrl ? `${baseUrl.replace(/\/$/, "")}/#/tasks/${taskId}` : null;

export const buildEmailMessage = (
  notification: ClaimedNotification,
  baseUrl = "",
): EmailMessage => {
  if (!notification.recipient_email) {
    throw new Error(`recipient ${notification.recipient_id} has no email`);
  }

  const subjectSource =
    notification.title?.trim() ||
    notification.task_title?.trim() ||
    `Task #${notification.task_id}`;

  const lines: string[] = [];
  const body = notification.body?.trim();
  if (body) lines.push(body);

  const due = formatDueDate(notification.task_due_date);
  if (due) lines.push(`Due: ${due}`);

  const url = taskUrl(baseUrl, notification.task_id);
  if (url) lines.push(url);

  return {
    to: notification.recipient_email,
    subject: `Reminder: ${subjectSource}`,
    textBody: lines.join("\n\n"),
  };
};

/**
 * One message for a recipient's whole batch (§9.5, digest mode).
 *
 * Deferring twenty reminders to 08:00 and then sending twenty emails at 08:00
 * is not a digest — it is the same fatigue with a delay. The database moves
 * `scheduled_for` to the digest hour; collapsing the batch into one message is
 * this function's job, and the two together are what the setting promises.
 *
 * A single-item batch degrades to the normal message on purpose: "Your tasks
 * (1)" reads like a system that cannot count.
 */
export const buildDigestMessage = (
  notifications: ClaimedNotification[],
  baseUrl = "",
): EmailMessage => {
  if (notifications.length === 0) {
    throw new Error("cannot build a digest for an empty batch");
  }
  if (notifications.length === 1) {
    return buildEmailMessage(notifications[0], baseUrl);
  }

  const [first] = notifications;
  if (!first.recipient_email) {
    throw new Error(`recipient ${first.recipient_id} has no email`);
  }

  const items = notifications.map((notification) => {
    const label =
      notification.title?.trim() ||
      notification.task_title?.trim() ||
      `Task #${notification.task_id}`;
    const due = formatDueDate(notification.task_due_date);
    const url = taskUrl(baseUrl, notification.task_id);

    return [`- ${label}`, due ? `  Due: ${due}` : null, url ? `  ${url}` : null]
      .filter(Boolean)
      .join("\n");
  });

  return {
    to: first.recipient_email,
    subject: `Your tasks (${notifications.length})`,
    textBody: items.join("\n\n"),
  };
};

/**
 * Splits a claimed batch into the messages to actually send.
 *
 * Digest recipients get one group each; everybody else gets one group per row.
 * Returned as groups rather than messages so the caller can settle every row a
 * message covered — a digest that sent must not leave nineteen rows unsettled.
 */
export const groupForDelivery = (
  notifications: ClaimedNotification[],
): ClaimedNotification[][] => {
  const digests = new Map<number, ClaimedNotification[]>();
  const groups: ClaimedNotification[][] = [];

  for (const notification of notifications) {
    if (!notification.recipient_digest) {
      groups.push([notification]);
      continue;
    }
    const existing = digests.get(notification.recipient_id);
    if (existing) {
      existing.push(notification);
    } else {
      const group = [notification];
      digests.set(notification.recipient_id, group);
      groups.push(group);
    }
  }

  return groups;
};
