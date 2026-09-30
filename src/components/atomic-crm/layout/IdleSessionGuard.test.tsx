import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import { IdleSessionGuard } from "./IdleSessionGuard";
import { writeSharedActivity } from "./idleSession";

const MINUTE = 60 * 1000;

// Only the clock the guard reads is faked: React, Radix and the element
// polling keep their real setTimeout.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

const renderGuard = async () => {
  const logout = vi.fn(async () => undefined);
  const screen = await render(
    <StoryWrapper authProvider={{ logout }}>
      <IdleSessionGuard />
    </StoryWrapper>,
  );
  return { logout, screen };
};

describe("IdleSessionGuard", () => {
  it("warns two minutes before the hour and then signs the user out", async () => {
    const { logout, screen } = await renderGuard();

    vi.advanceTimersByTime(57 * MINUTE);
    expect(
      screen.getByRole("dialog", { name: "Are you still there?" }).query(),
    ).toBeNull();

    vi.advanceTimersByTime(1 * MINUTE);
    const dialog = screen.getByRole("dialog", { name: "Are you still there?" });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog).toHaveTextContent("close in 2:00");
    expect(logout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * MINUTE);
    await expect.poll(() => logout).toHaveBeenCalledTimes(1);
  });

  it("restarts the hour when the user chooses to stay signed in", async () => {
    const { logout, screen } = await renderGuard();

    vi.advanceTimersByTime(58 * MINUTE);
    await userEvent.click(
      screen.getByRole("button", { name: "Stay signed in" }),
    );
    await expect
      .element(screen.getByRole("dialog", { name: "Are you still there?" }))
      .not.toBeInTheDocument();

    // Past the original deadline, still inside the new one.
    vi.advanceTimersByTime(59 * MINUTE);
    await expect
      .element(screen.getByRole("dialog", { name: "Are you still there?" }))
      .toHaveTextContent("close in 1:00");
    expect(logout).not.toHaveBeenCalled();
  });

  it("stays signed in while the user works in another tab", async () => {
    const { logout, screen } = await renderGuard();

    vi.advanceTimersByTime(58 * MINUTE);
    await expect
      .element(screen.getByRole("dialog", { name: "Are you still there?" }))
      .toBeVisible();

    writeSharedActivity(Date.now());
    vi.advanceTimersByTime(1000);
    await expect
      .element(screen.getByRole("dialog", { name: "Are you still there?" }))
      .not.toBeInTheDocument();

    vi.advanceTimersByTime(30 * MINUTE);
    expect(logout).not.toHaveBeenCalled();
  });
});
