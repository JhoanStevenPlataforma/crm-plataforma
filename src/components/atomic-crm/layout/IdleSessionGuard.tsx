import { useLogout, useTranslate } from "ra-core";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  formatRemaining,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  idleStateAt,
  readSharedActivity,
  writeSharedActivity,
  type IdleState,
} from "./idleSession";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;
// pointermove fires dozens of times a second; the shared clock needs far less.
const WRITE_THROTTLE_MS = 5_000;
const TICK_MS = 1_000;

/**
 * Signs the user out after a period without activity, warning first.
 * Rendered by both layouts, so it runs only behind the sign-in. See
 * `idleSession.ts` for the policy.
 *
 * Once the warning is up, moving the mouse no longer counts: staying signed in
 * takes the button (or activity in another tab).
 */
export const IdleSessionGuard = ({
  timeoutMs = IDLE_TIMEOUT_MS,
  warningMs = IDLE_WARNING_MS,
}: {
  timeoutMs?: number;
  warningMs?: number;
}) => {
  const logout = useLogout();
  const translate = useTranslate();
  const [state, setState] = useState<IdleState>({ kind: "active" });
  // Kept after the warning ends, so the text does not lose its time while the
  // dialog animates out.
  const [remainingMs, setRemainingMs] = useState(warningMs);
  const lastActivity = useRef(0);
  const lastWrite = useRef(0);
  const isWarning = useRef(false);
  const isSigningOut = useRef(false);

  const markActive = useCallback((force = false) => {
    const now = Date.now();
    lastActivity.current = now;
    if (force || now - lastWrite.current >= WRITE_THROTTLE_MS) {
      lastWrite.current = now;
      writeSharedActivity(now);
    }
  }, []);

  const signOut = useCallback(() => {
    if (isSigningOut.current) return;
    isSigningOut.current = true;
    logout();
  }, [logout]);

  useEffect(() => {
    isWarning.current = state.kind === "warning";
  }, [state.kind]);

  useEffect(() => {
    // Mounting is a sign-in or a reload: start the clock now, so a timestamp
    // left by an earlier session cannot sign the new one straight out.
    markActive(true);
    const onActivity = () => {
      if (!isWarning.current) markActive();
    };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );
    return () =>
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity),
      );
  }, [markActive]);

  useEffect(() => {
    const tick = () => {
      const last = Math.max(lastActivity.current, readSharedActivity() ?? 0);
      lastActivity.current = last;
      const next = idleStateAt(Date.now(), last, timeoutMs, warningMs);
      if (next.kind === "expired") signOut();
      if (next.kind === "warning") setRemainingMs(next.remainingMs);
      // Keep the same object while active, or every tick re-renders.
      setState((previous) =>
        previous.kind === "active" && next.kind === "active" ? previous : next,
      );
    };
    const interval = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(interval);
  }, [timeoutMs, warningMs, signOut]);

  const stay = () => {
    markActive(true);
    setState({ kind: "active" });
  };

  return (
    <Dialog
      open={state.kind === "warning"}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate("crm.auth.idle.title")}</DialogTitle>
          <DialogDescription>
            {translate("crm.auth.idle.description", {
              time: formatRemaining(remainingMs),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={signOut}>
            {translate("crm.auth.idle.sign_out")}
          </Button>
          <Button onClick={stay}>{translate("crm.auth.idle.stay")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
