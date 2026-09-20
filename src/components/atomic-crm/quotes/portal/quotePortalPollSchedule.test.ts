import { nextPollDelay } from "./quotePortalPollSchedule";

describe("nextPollDelay", () => {
  it("asks every ten seconds, once a minute after three failures in a row, and not at all after six", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(nextPollDelay)).toEqual([
      10_000,
      10_000,
      10_000,
      60_000,
      60_000,
      60_000,
      null,
      null,
    ]);
  });
});
