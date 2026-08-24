import type { Identifier } from "ra-core";

/**
 * The @mention token format (proposal §8.2).
 *
 * A mention is written into the comment body as `@[Display Name](sales:12)`.
 * The display name is there for anyone reading the raw text; the id after the
 * colon is what actually resolves the person.
 *
 * Storing the id in the body — rather than sending the UI's list of mentioned
 * people alongside it — is what lets the database parse mentions server-side
 * from the only thing a reader can see. Two colleagues called "Ana García"
 * therefore resolve to the right inbox, and a client cannot claim a mention
 * that is not in the text (nor hide one that is).
 *
 * The database owns the authoritative parse (`public.sync_comment_mentions`).
 * This module is the frontend half of the same contract: the composer writes
 * these tokens, and the renderer turns them back into readable names.
 */

export type MentionSubject = "sales" | "team";

export type Mention = {
  subject: MentionSubject;
  id: number;
  label: string;
};

/** Matches one `@[Label](sales:12)` / `@[Label](team:3)` token. */
const MENTION_TOKEN = /@\[([^\]]*)\]\((sales|team):(\d+)\)/g;

/** Serializes one mention into the token the database knows how to parse. */
export const formatMention = (
  subject: MentionSubject,
  id: Identifier,
  label: string,
): string => `@[${label.replace(/[[\]]/g, "")}](${subject}:${id})`;

/**
 * Every mention in a body, in the order they appear. Duplicates are kept: the
 * caller decides whether repeating a name twice means anything.
 */
export const parseMentions = (body: string): Mention[] => {
  const mentions: Mention[] = [];
  // `matchAll` needs its own regex state, and MENTION_TOKEN is a shared global.
  for (const match of body.matchAll(new RegExp(MENTION_TOKEN))) {
    mentions.push({
      label: match[1],
      subject: match[2] as MentionSubject,
      id: Number(match[3]),
    });
  }
  return mentions;
};

/** The distinct `sales` ids a body mentions — what the inbox keys off. */
export const mentionedSalesIds = (body: string): number[] => [
  ...new Set(
    parseMentions(body)
      .filter((mention) => mention.subject === "sales")
      .map((mention) => mention.id),
  ),
];

export type CommentSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; subject: MentionSubject; id: number };

/**
 * Splits a body into plain runs and mentions so the renderer can style the
 * mentions without ever putting the raw token in front of a user — and without
 * building HTML, which is what would need sanitizing.
 */
export const toCommentSegments = (body: string): CommentSegment[] => {
  const segments: CommentSegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(new RegExp(MENTION_TOKEN))) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ type: "text", value: body.slice(cursor, start) });
    }
    segments.push({
      type: "mention",
      value: match[1],
      subject: match[2] as MentionSubject,
      id: Number(match[3]),
    });
    cursor = start + match[0].length;
  }

  if (cursor < body.length) {
    segments.push({ type: "text", value: body.slice(cursor) });
  }

  return segments;
};

/** The body as a human reads it, with tokens collapsed back to `@Name`. */
export const toPlainText = (body: string): string =>
  toCommentSegments(body)
    .map((segment) =>
      segment.type === "mention" ? `@${segment.value}` : segment.value,
    )
    .join("");

/**
 * The `@qu` the user is currently typing, if the caret sits inside one.
 *
 * Returns null as soon as the fragment is not a plausible mention — after a
 * space, or when the caret has moved away — so the autocomplete closes on its
 * own instead of needing the component to track open/closed state.
 */
export type MentionQuery = { query: string; start: number };

export const activeMentionQuery = (
  body: string,
  caret: number,
): MentionQuery | null => {
  const upToCaret = body.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;

  // Only at the start of a word: `email@example.com` is not a mention.
  const before = at === 0 ? "" : upToCaret[at - 1];
  if (before !== "" && !/\s/.test(before)) return null;

  const fragment = upToCaret.slice(at + 1);
  // A completed token is not a query any more, and a name is one word here.
  if (/[\s[\]()]/.test(fragment)) return null;

  return { query: fragment, start: at };
};

/** Replaces the `@fragment` under the caret with a finished mention token. */
export const applyMention = (
  body: string,
  query: MentionQuery,
  caret: number,
  subject: MentionSubject,
  id: Identifier,
  label: string,
): { body: string; caret: number } => {
  const token = `${formatMention(subject, id, label)} `;
  const next = body.slice(0, query.start) + token + body.slice(caret);
  return { body: next, caret: query.start + token.length };
};
