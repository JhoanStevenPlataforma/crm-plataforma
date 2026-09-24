import type { Meta } from "@storybook/react-vite";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Db } from "../providers/fakerest/dataGenerator/types";
import {
  companies,
  quoteLines,
  quoteStatuses,
  quoteVersions,
  quotes,
} from "../quotes/quoteFixtures";
import type { TaskNotification } from "../types";
import { NotificationsBell } from "./NotificationsBell";

const meta: Meta<typeof NotificationsBell> = {
  title: "Notifications/NotificationsBell",
  component: NotificationsBell,
};

export default meta;

/**
 * The bell, plus a marker that says we are still on the dashboard.
 *
 * `StoryWrapper` renders its children AS the `/` route, so the marker unmounts
 * the instant a click navigates anywhere -- which is what makes "this
 * notification did NOT take me away" an assertion rather than a hope. Without
 * it the test passes whether the click navigates or not, because the route it
 * would land on renders nothing recognisable either.
 */
const Dashboard = () => (
  <>
    <NotificationsBell />
    <p>Nothing to do here</p>
  </>
);

const buildNotification = (
  overrides: Partial<TaskNotification> = {},
): TaskNotification => ({
  id: 1,
  task_id: null,
  entity_type: "quote",
  entity_id: 1,
  recipient_id: 1,
  channel: "in_app",
  scheduled_for: "2026-09-20T09:00:00.000Z",
  delivered_at: "2026-09-20T09:00:00.000Z",
  read_at: null,
  // Deliberately NOT what the bell should show. These columns are the English
  // fallback for a reader with no catalogue; the key below is what a client
  // renders, and a story whose two agreed would prove nothing (quotes §13.6
  // #18).
  title: "UNTRANSLATED-TITLE-FROM-THE-ROW",
  body: "UNTRANSLATED-BODY-FROM-THE-ROW",
  message_key: "crm.notifications.quote.accepted",
  message_params: {
    number: "Q-2026-00001",
    actor: "Clara Cliente",
    version: "1",
  },
  status: "delivered",
  attempt: 0,
  created_at: "2026-09-20T09:00:00.000Z",
  ...overrides,
});

/**
 * The quote the bell points at is a REAL one in the demo database, reached
 * through the real route, so clicking the entry proves the link lands on a page
 * that renders rather than on a blank screen.
 */
const quoteDb = {
  companies,
  quote_statuses: quoteStatuses,
  quotes: [{ ...quotes[0], status_key: "accepted" }],
  quote_versions: quoteVersions,
  quote_lines: quoteLines,
} as Partial<Db>;

/** A customer answered a quotation: one click away from the quotation. */
export const QuoteAnswered = () => (
  <StoryWrapper
    data={
      { ...quoteDb, task_notifications: [buildNotification()] } as Partial<Db>
    }
  >
    <Dashboard />
  </StoryWrapper>
);

/**
 * A task reminder, which is what this bell was built for. It stays inert on
 * click: the notification names its task and where the user goes is their call.
 */
export const TaskReminder = () => (
  <StoryWrapper
    data={
      {
        ...quoteDb,
        task_notifications: [
          buildNotification({
            id: 2,
            task_id: 7,
            entity_type: null,
            entity_id: null,
            title: "Call Ana about the renewal",
            body: "She asked to be called back on Thursday",
            message_key: null,
            message_params: null,
          }),
        ],
      } as Partial<Db>
    }
  >
    <Dashboard />
  </StoryWrapper>
);

/** Nothing to report: the badge is absent, not a zero. */
export const Empty = () => (
  <StoryWrapper data={{ ...quoteDb, task_notifications: [] } as Partial<Db>}>
    <Dashboard />
  </StoryWrapper>
);
