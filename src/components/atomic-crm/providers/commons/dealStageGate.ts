import type { DealStageGate } from "../../types";

/**
 * The completed-task rule that gates a deal stage move, on the client side.
 *
 * The rule itself lives in `public.deal_stage_gate()` and nowhere else — this
 * module only carries the vocabulary needed to recognise its refusal and to
 * emulate it in demo mode.
 *
 * The refusal has to be told apart from every other reason a move can fail
 * (someone else's deal, a dropped connection), because it is the only one the
 * user can act on: complete a task and try again. Postgres carries that
 * distinction in the exception's `detail`, which PostgREST surfaces as
 * `details` — a stable key rather than a message, so it survives translation.
 */
export const DEAL_STAGE_GATE_ERROR = "deal_stage_requires_completed_tasks";

/**
 * The error both data providers throw when the rule refuses a move.
 *
 * Carries the gate itself: the kanban can then say "0 of 1" without asking the
 * server a second question it already answered.
 */
export class DealStageGateError extends Error {
  readonly code = DEAL_STAGE_GATE_ERROR;
  readonly gate?: DealStageGate;

  constructor(message: string, gate?: DealStageGate) {
    super(message);
    this.name = "DealStageGateError";
    this.gate = gate;
  }
}

export const isDealStageGateError = (
  error: unknown,
): error is DealStageGateError =>
  error instanceof Error &&
  (error as { code?: string }).code === DEAL_STAGE_GATE_ERROR;

/**
 * Was this PostgREST error the rule refusing the move?
 *
 * `details` is where PostgREST puts the exception's `DETAIL`, and the older
 * `hint` field is checked too so a proxy that reshapes the body cannot turn an
 * actionable refusal into a generic failure.
 */
export const isGateRefusal = (error: {
  details?: string | null;
  message?: string | null;
}): boolean =>
  error?.details === DEAL_STAGE_GATE_ERROR ||
  Boolean(error?.message?.includes(DEAL_STAGE_GATE_ERROR));

/** Parses the counts Postgres attached to the refusal, when they made it through. */
export const parseGateFromHint = (hint: unknown): DealStageGate | undefined => {
  if (typeof hint !== "string" || hint === "") return undefined;
  try {
    return JSON.parse(hint) as DealStageGate;
  } catch {
    // A hint we cannot read costs the user a count in the message, not the
    // move itself. The refusal still stands on its own.
    return undefined;
  }
};
