import type { LucideIcon } from "lucide-react";
import { useLocaleState } from "ra-core";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

import { formatTimeOfDay } from "./activityDays";

/**
 * One event on the activity timeline.
 *
 * The anatomy every CRM feed worth copying shares: a glyph that says what KIND
 * of event it was before the sentence is read, the sentence (who did what to
 * which record), the time on the right in a column of its own, and -- for a
 * note -- the words themselves set apart as a quote, because they are the only
 * part of the event that is not metadata.
 *
 * Notes take the brand tint; creations stay neutral. The feed is mostly
 * creations, and a note is what someone actually wrote: it is the row worth
 * the eye's first stop. Status colours are deliberately not used -- a new
 * company is not "success".
 */
export const ActivityLogRow = ({
  icon: Icon,
  emphasis = false,
  date,
  children,
  note,
  noteLink,
}: {
  icon: LucideIcon;
  /** Brand-tinted glyph, for events that carry written content. */
  emphasis?: boolean;
  date: string;
  /** The sentence. Record names inside it should be `ActivityLogEntity`. */
  children: ReactNode;
  note?: string;
  noteLink?: string | false;
}) => {
  const [locale = "en"] = useLocaleState();
  const plainNote = note?.replace(/\s+/g, " ").trim();
  const dateObj = new Date(date);

  return (
    <li className="group/row relative flex gap-3 pb-5 last:pb-1">
      {/* The spine joining this event to the next; the last one has none. */}
      <span
        aria-hidden
        className="absolute top-9 bottom-0 left-[15px] w-px bg-border group-last/row:hidden"
      />
      <span
        aria-hidden
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card",
          emphasis
            ? "bg-brand-tint text-brand"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm leading-6 text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:no-underline [&_a]:transition-colors [&_a:hover]:text-brand">
            {children}
          </p>
          <time
            dateTime={date}
            title={dateObj.toLocaleString(locale)}
            className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums"
          >
            {formatTimeOfDay(dateObj, locale)}
          </time>
        </div>

        {plainNote ? <NoteQuote text={plainNote} link={noteLink} /> : null}
      </div>
    </li>
  );
};

const NoteQuote = ({ text, link }: { text: string; link?: string | false }) => {
  const quote = (
    // `data-slot` lets a denser host (the dashboard) clamp harder.
    <p
      data-slot="activity-note"
      className="line-clamp-3 text-sm leading-relaxed text-foreground/90"
    >
      {text}
    </p>
  );
  const frame =
    "block rounded-lg border border-border/70 border-l-2 border-l-brand/60 bg-surface-muted px-3 py-2";
  return link ? (
    <Link
      to={link}
      className={cn(
        frame,
        "no-underline transition-colors hover:border-border-strong hover:border-l-brand hover:bg-muted/60",
      )}
    >
      {quote}
    </Link>
  ) : (
    <div className={frame}>{quote}</div>
  );
};
