/**
 * Idle sign-out policy for a tab left open.
 *
 * The auth server already ends a session after 1 hour without a token refresh
 * (`[auth.sessions]` in supabase/config.toml), but an open tab refreshes its
 * token on its own, so from the server's side an unattended laptop is never
 * idle. Only the browser can tell that nobody is touching the page.
 *
 * The last activity is shared through localStorage, so working in one tab
 * keeps every other tab signed in, and reading a timestamp (instead of
 * counting down a timer) makes a device that wakes from sleep sign out at once.
 */

export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const IDLE_WARNING_MS = 2 * 60 * 1000;

const LAST_ACTIVITY_KEY = "crm.lastActivityAt";

export type IdleState =
  | { kind: "active" }
  | { kind: "warning"; remainingMs: number }
  | { kind: "expired" };

export const idleStateAt = (
  now: number,
  lastActivityAt: number,
  timeoutMs: number,
  warningMs: number,
): IdleState => {
  const remainingMs = lastActivityAt + timeoutMs - now;
  if (remainingMs <= 0) return { kind: "expired" };
  if (remainingMs <= warningMs) return { kind: "warning", remainingMs };
  return { kind: "active" };
};

/** `m:ss`, rounded up so the countdown never shows 0:00 while still open. */
export const formatRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Storage can throw (blocked site data); the tab then keeps its own clock.
export const readSharedActivity = (): number | null => {
  try {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

export const writeSharedActivity = (at: number): void => {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // See readSharedActivity.
  }
};
