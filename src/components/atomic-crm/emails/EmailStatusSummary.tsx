import { CircleAlert, CircleCheck, FlaskConical } from "lucide-react";
import { useTranslate } from "ra-core";

import { useEmailStatus } from "./useEmailStatus";

/**
 * What the current configuration does, in one sentence: nothing (switched
 * off), nothing real (simulated), not yet (the provider is incomplete), or
 * sends. An integration is "ready" here only when it can actually send --
 * and even then production needs a verified sender domain, which no screen
 * can check: the note says so.
 */
export const EmailStatusSummary = () => {
  const translate = useTranslate();
  const { data: status } = useEmailStatus();
  if (!status) return null;

  const state = !status.is_enabled
    ? "disabled"
    : status.is_simulated
      ? "simulated"
      : status.is_ready
        ? "ready"
        : "incomplete";
  const Icon =
    state === "ready"
      ? CircleCheck
      : state === "simulated"
        ? FlaskConical
        : CircleAlert;

  return (
    <div
      role="status"
      className="flex gap-3 rounded-md border bg-surface p-3 text-sm"
    >
      <Icon
        className={
          state === "ready"
            ? "size-4 shrink-0 text-success"
            : state === "simulated"
              ? "size-4 shrink-0 text-warning"
              : "size-4 shrink-0 text-destructive"
        }
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          {translate(`crm.email.settings.state.${state}`)}
        </span>
        <span className="text-muted-foreground">
          {translate(`crm.email.settings.state_hint.${state}`)}
        </span>
      </div>
    </div>
  );
};
