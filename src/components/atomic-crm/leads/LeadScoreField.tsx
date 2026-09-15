import { useRecordContext } from "ra-core";

import { cn } from "@/lib/utils";

import type { Lead } from "../types";

/**
 * The lead score, as a number and a bar.
 *
 * `leads.score` is a `smallint` a person types into the form, 0 to 100. It is
 * NOT computed, and nothing in this application ranks or predicts — so the
 * column is labelled "score", not "AI score". A number a human entered,
 * presented as a machine's judgement, is the kind of label that gets acted on
 * as if it were evidence.
 *
 * The bar is redundant with the number on purpose: a column of two-digit
 * figures is read one row at a time, while a column of bars is read as a shape,
 * which is what makes a list of fifty leads sortable by eye.
 *
 * Three bands rather than a gradient. A continuous ramp implies a precision the
 * field does not have — nobody distinguishes a 71 from a 74 — and the bands are
 * the same semantic tokens the status column uses, so "green" means the same
 * thing in both.
 */
const bandFor = (score: number) => {
  if (score >= 75) return "bg-success";
  if (score >= 50) return "bg-warning";
  return "bg-muted-foreground";
};

export const LeadScoreField = () => {
  const record = useRecordContext<Lead>();
  const score = record?.score;

  // An em dash, not a zero. "No score yet" and "scored zero" are different
  // claims, and the second one is an accusation.
  if (score == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const clamped = Math.min(100, Math.max(0, score));

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-right tabular-nums">{score}</span>
      <div
        className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-secondary"
        role="presentation"
      >
        <div
          className={cn("h-full rounded-full", bandFor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
