import { describe, expect, it } from "vitest";

import {
  buildDigestMessage,
  buildEmailMessage,
  groupForDelivery,
  isSupportedChannel,
  type ClaimedNotification,
} from "./notificationMessage.ts";

const buildNotification = (
  overrides: Partial<ClaimedNotification> = {},
): ClaimedNotification => ({
  id: 1,
  task_id: 4711,
  channel: "email",
  recipient_id: 12,
  recipient_email: "laura@example.com",
  recipient_name: "Laura Mendez",
  recipient_digest: false,
  title: "Call Ana about the renewal",
  body: "She asked to be called back on Thursday",
  scheduled_for: "2026-08-10T09:00:00.000Z",
  attempt: 1,
  task_title: "Call Ana about the renewal",
  task_due_date: "2026-08-10T09:00:00.000Z",
  ...overrides,
});

describe("isSupportedChannel", () => {
  it("accepts email", () => {
    expect(isSupportedChannel("email")).toBe(true);
  });

  it("rejects channels with no provider, so they are settled as skipped", () => {
    // The point of the deliverable: a channel nobody can deliver must be
    // visibly skipped, never left queued forever (O6).
    expect(isSupportedChannel("whatsapp")).toBe(false);
    expect(isSupportedChannel("sms")).toBe(false);
  });
});

describe("buildEmailMessage", () => {
  it("puts the reminder title in the subject", () => {
    const message = buildEmailMessage(buildNotification());

    expect(message.subject).toBe("Reminder: Call Ana about the renewal");
    expect(message.to).toBe("laura@example.com");
  });

  it("falls back to the task title when the reminder has none", () => {
    const message = buildEmailMessage(
      buildNotification({ title: null, task_title: "Send the proposal" }),
    );

    expect(message.subject).toBe("Reminder: Send the proposal");
  });

  it("falls back to the task id when there is no title at all", () => {
    const message = buildEmailMessage(
      buildNotification({ title: null, task_title: null }),
    );

    expect(message.subject).toBe("Reminder: Task #4711");
  });

  it("includes the due date and a link back to the task", () => {
    const message = buildEmailMessage(
      buildNotification(),
      "https://crm.example.com/",
    );

    expect(message.textBody).toContain("Due: 2026-08-10 09:00 UTC");
    expect(message.textBody).toContain("https://crm.example.com/#/tasks/4711");
  });

  it("still sends when no base URL is configured", () => {
    // A reminder with no link beats no reminder at all.
    const message = buildEmailMessage(buildNotification());

    expect(message.textBody).toContain(
      "She asked to be called back on Thursday",
    );
    expect(message.textBody).not.toContain("/#/tasks/");
  });

  it("omits an unparseable due date rather than printing garbage", () => {
    const message = buildEmailMessage(
      buildNotification({ task_due_date: "not a date" }),
    );

    expect(message.textBody).not.toContain("Due:");
  });

  it("refuses to build a message for a recipient with no address", () => {
    expect(() =>
      buildEmailMessage(buildNotification({ recipient_email: null })),
    ).toThrow(/no email/);
  });
});

describe("groupForDelivery", () => {
  it("keeps normal recipients one message per notification", () => {
    const groups = groupForDelivery([
      buildNotification({ id: 1 }),
      buildNotification({ id: 2 }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("collapses one digest recipient's batch into a single group", () => {
    // Deferring twenty reminders to 08:00 and then sending twenty emails at
    // 08:00 is the same fatigue with a delay, not a digest (§9.5).
    const groups = groupForDelivery([
      buildNotification({ id: 1, recipient_digest: true }),
      buildNotification({ id: 2, recipient_digest: true }),
      buildNotification({ id: 3, recipient_digest: true }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("keeps different digest recipients apart", () => {
    const groups = groupForDelivery([
      buildNotification({ id: 1, recipient_id: 12, recipient_digest: true }),
      buildNotification({ id: 2, recipient_id: 99, recipient_digest: true }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("does not fold a digest recipient's rows into somebody else's message", () => {
    const groups = groupForDelivery([
      buildNotification({ id: 1, recipient_id: 12, recipient_digest: true }),
      buildNotification({ id: 2, recipient_id: 99, recipient_digest: false }),
      buildNotification({ id: 3, recipient_id: 12, recipient_digest: true }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].map((n) => n.id)).toEqual([1, 3]);
    expect(groups[1].map((n) => n.id)).toEqual([2]);
  });
});

describe("buildDigestMessage", () => {
  it("lists every task in one message", () => {
    const message = buildDigestMessage(
      [
        buildNotification({ id: 1, task_id: 1, title: "Llamar a Ana" }),
        buildNotification({ id: 2, task_id: 2, title: "Enviar propuesta" }),
      ],
      "https://crm.example.com",
    );

    expect(message.subject).toBe("Your tasks (2)");
    expect(message.textBody).toContain("Llamar a Ana");
    expect(message.textBody).toContain("Enviar propuesta");
    expect(message.textBody).toContain("https://crm.example.com/#/tasks/2");
  });

  it("degrades to the normal message for a batch of one", () => {
    // "Your tasks (1)" reads like a system that cannot count.
    const message = buildDigestMessage([
      buildNotification({ title: "Llamar a Ana" }),
    ]);

    expect(message.subject).toBe("Reminder: Llamar a Ana");
  });

  it("refuses an empty batch rather than sending a blank email", () => {
    expect(() => buildDigestMessage([])).toThrow(/empty batch/);
  });
});
