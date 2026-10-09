import type { EmailProvider } from "./types.ts";

/**
 * The simulated provider: the default, and what development and the test
 * suites run on.
 *
 * It calls nothing and says so. `simulated: true` makes the dispatcher settle
 * the message as `simulated`, a status of its own -- never `accepted` -- so no
 * screen can report a mail that did not leave.
 */
export const mockProvider: EmailProvider = {
  key: "mock",
  needsCredentials: false,
  send: () =>
    Promise.resolve({ ok: true, providerMessageId: null, simulated: true }),
};
