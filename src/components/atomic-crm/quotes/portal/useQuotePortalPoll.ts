import { useEffect, useRef, useState } from "react";

import {
  portalErrorKeyOf,
  type QuotePortalClient,
  type QuotePortalPayload,
} from "./quotePortalClient";
import {
  BACKOFF_AFTER_FAILURES,
  nextPollDelay,
} from "./quotePortalPollSchedule";

export type QuotePortalPoll = {
  /** The link stopped working while the page was open. */
  isLinkClosed: boolean;
  /** Several checks in a row failed: the page asks less often, or not at all. */
  isFailing: boolean;
  /** Ask now, and go back to the normal pace. */
  checkNow: () => void;
};

/**
 * Keeps the customer's page current while it is open (quotes §6.5, D2).
 *
 * The page asks the edge function for the document's `etag` — which records
 * nothing — and opens the document again, recording that open, only when the
 * answer differs from the etag of what is on screen. Reopening through the
 * ordinary `view` is deliberate: a read path that leaves no trace would be the
 * one way to pull the document unrecorded. The trail therefore gains a view
 * per change the page actually received, never one per check.
 *
 * Only while the tab is VISIBLE. A backgrounded tab costs nothing, and coming
 * back to it asks at once rather than waiting out the interval.
 *
 * A dead link is not a failure to retry: the rep revised or withdrew the
 * offer, so the page stops asking and says so. The customer keeps the copy
 * they were reading.
 */
export const useQuotePortalPoll = ({
  client,
  token,
  etag,
  onRefreshed,
}: {
  client: QuotePortalClient;
  /** Null while there is no document on screen to keep current. */
  token: string | null;
  etag: string | null;
  /** Receives the document when it was opened again. Must be stable. */
  onRefreshed: (payload: QuotePortalPayload) => void;
}): QuotePortalPoll => {
  const [failures, setFailures] = useState(0);
  // Keyed by the link, so another link opened in the same page starts open.
  const [closedToken, setClosedToken] = useState<string | null>(null);
  const [restarts, setRestarts] = useState(0);
  const checkAtOnce = useRef(false);
  const isLinkClosed = token != null && closedToken === token;

  useEffect(() => {
    if (!token || !etag || isLinkClosed) return;

    let isActive = true;
    let isChecking = false;
    let failed = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      const delay = nextPollDelay(failed);
      if (delay != null) timer = setTimeout(check, delay);
    };

    // A check that finds the tab hidden stops the loop there, without
    // rescheduling -- so a timer already set when the tab was hidden fires once
    // and asks nothing -- and the `visibilitychange` listener picks it up again.
    const check = async () => {
      if (!isActive || isChecking || document.visibilityState !== "visible") {
        return;
      }
      isChecking = true;
      try {
        if ((await client.version(token)) !== etag) {
          const payload = await client.view(token);
          // The new etag restarts this effect; the timer set below is cleared
          // by that restart before it can fire.
          if (isActive) onRefreshed(payload);
        }
        failed = 0;
      } catch (error) {
        if (portalErrorKeyOf(error) === "quote_link_invalid") {
          if (isActive) setClosedToken(token);
          return;
        }
        failed += 1;
      } finally {
        isChecking = false;
      }
      if (!isActive) return;
      setFailures(failed);
      schedule();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (checkAtOnce.current) {
      checkAtOnce.current = false;
      void check();
    } else {
      schedule();
    }

    return () => {
      isActive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, token, etag, isLinkClosed, onRefreshed, restarts]);

  return {
    isLinkClosed,
    isFailing: failures >= BACKOFF_AFTER_FAILURES,
    checkNow: () => {
      checkAtOnce.current = true;
      setFailures(0);
      setRestarts((count) => count + 1);
    },
  };
};
