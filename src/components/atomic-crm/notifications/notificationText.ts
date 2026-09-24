import type { TaskNotification } from "../types";

/** What `useTranslate()` returns — narrowed to what this module needs. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The labels the decline dialog offered the customer, reused verbatim. */
const REASON_KEY_PREFIX = "resources.quotes.portal.reject_dialog.reasons.";

export type NotificationText = {
  title: string;
  /** Empty when the notification has nothing to add to its title. */
  body: string;
};

/**
 * The text of a notification, in the language the reader is looking at
 * (quotes proposal §13.6 #18).
 *
 * The database writes `message_key` and `message_params` and never a sentence,
 * because it has no idea who will read the row or in what language. It writes
 * `title` and `body` in English as well, for readers with no catalogue — the
 * email worker composes outside React and still uses those.
 *
 * So this is the seam: given a row and a translator, produce what the bell
 * shows. A row with no `message_key` — every task reminder ever written, and
 * every quote row written before that column existed — falls through to the
 * English columns unchanged.
 *
 * Pure, because the interesting decisions here are the ones worth testing
 * without a router or a data provider: what stands in for a customer who did
 * not sign, and which of the two parts is data rather than a message.
 */
export const notificationText = (
  notification: Pick<
    TaskNotification,
    "title" | "body" | "message_key" | "message_params"
  >,
  translate: Translate,
  untitled = "",
): NotificationText => {
  const key = notification.message_key;
  const fallbackTitle = notification.title ?? untitled;
  const fallbackBody = notification.body ?? "";

  if (!key) {
    return { title: fallbackTitle, body: fallbackBody };
  }

  const params: Record<string, unknown> = { ...notification.message_params };

  // A customer who answered without signing has no name. "The customer" is
  // itself a sentence needing translation, so the database leaves the
  // parameter null and the catalogue supplies the stand-in.
  if (!params.actor) {
    params.actor = translate("crm.notifications.quote.customer");
  }

  // The database stores the reason CODE — a value from a check constraint —
  // and the words for it live beside the dialog that offered them to the
  // customer. Translating it here keeps one set of labels for both sides.
  if (typeof params.reason_code === "string" && params.reason_code) {
    params.reason = translate(`${REASON_KEY_PREFIX}${params.reason_code}`, {
      _: params.reason_code,
    });
  } else if (params.reason === undefined) {
    params.reason = translate("crm.notifications.quote.rejected.no_reason", {
      _: "",
    });
  }

  return {
    title: translate(`${key}.title`, { ...params, _: fallbackTitle }),
    // A body the catalogue does not define is not missing — it is a body that
    // is DATA. A customer's own words are quoted, never translated, and a
    // notification that says everything in its title has none at all.
    body: translate(`${key}.body`, { ...params, _: fallbackBody }),
  };
};
