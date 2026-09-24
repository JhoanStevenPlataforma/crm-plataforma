import { useTranslate } from "ra-core";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { PORTAL_EMAIL_PATTERN } from "./QuotePortalAcceptDialog";
import {
  portalErrorKeyOf,
  type QuotePortalComment,
  type QuotePortalErrorKey,
  type QuotePortalThreadComment,
} from "./quotePortalClient";

/** What `quote_portal_comment()` accepts; a longer body is refused there. */
const MAX_BODY_LENGTH = 4000;

const formatCommentDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
};

/**
 * The conversation under the quotation (quotes §2.5, Phase 8).
 *
 * PLAIN TEXT, whoever wrote it. A body is React text in a `whitespace-pre-line`
 * paragraph — never markdown, never HTML — because the customer's words reach
 * the team's screens and the team's reach a page anybody holding the link can
 * open (§6.6). A line break is the only formatting a message needs.
 *
 * NOT PRINTED (`quote-print-hide`): the PDF is the offer, and the conversation
 * about the offer is not part of it.
 *
 * The form is offered while the payload's `actions.can_comment` says so — the
 * predicate `quote_portal_comment()` enforces, so the form and the refusal
 * cannot disagree. Once the quotation is answered, withdrawn or superseded the
 * thread stays readable and says it is closed. The signature is prefilled with
 * the addressee, like the acceptance; the email is optional and, as the form
 * says, reaches the team only: the thread shows nobody's address.
 */
export const QuotePortalComments = ({
  comments,
  canComment,
  defaultName,
  defaultEmail,
  onSubmit,
}: {
  comments: QuotePortalThreadComment[];
  canComment: boolean;
  defaultName: string;
  defaultEmail: string;
  /** Resolves once the comment is recorded; rejects with the server's refusal. */
  onSubmit: (comment: QuotePortalComment) => Promise<void>;
}) => {
  const translate = useTranslate();
  const [body, setBody] = useState("");
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [isPending, setIsPending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<QuotePortalErrorKey | null>(null);

  if (!canComment && comments.length === 0) return null;

  const teamLabel = translate("resources.quotes.portal.comments.team");
  const trimmedEmail = email.trim();
  const isValid =
    body.trim() !== "" &&
    name.trim() !== "" &&
    (trimmedEmail === "" || PORTAL_EMAIL_PATTERN.test(trimmedEmail));

  const submit = async () => {
    setIsPending(true);
    setIsSent(false);
    setError(null);
    try {
      await onSubmit({
        body: body.trim(),
        name: name.trim(),
        email: trimmedEmail || null,
      });
      setBody("");
      setIsSent(true);
    } catch (caught) {
      setError(portalErrorKeyOf(caught));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section
      aria-labelledby="quote-portal-comments-title"
      className="quote-print-hide flex flex-col overflow-hidden rounded-3xl border bg-card text-sm text-card-foreground shadow-xl shadow-foreground/5"
    >
      <header className="flex items-center gap-2.5 border-b px-5 py-4">
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full",
            canComment
              ? "bg-success ring-4 ring-success/15"
              : "bg-muted-foreground",
          )}
        />
        <h2 id="quote-portal-comments-title" className="font-bold">
          {translate("resources.quotes.portal.comments.title")}
        </h2>
      </header>

      <div className="flex flex-col gap-4 p-5">
        {comments.length === 0 ? (
          <p className="rounded-2xl bg-muted/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
            {translate("resources.quotes.portal.comments.empty")}
          </p>
        ) : (
          <ol className="-mr-2 flex max-h-96 flex-col gap-2.5 overflow-y-auto pr-2">
            {comments.map((comment, index) => (
              <li
                key={`${comment.created_at}-${index}`}
                className={cn(
                  "flex flex-col gap-1 rounded-2xl p-3",
                  comment.author_kind === "internal"
                    ? "mr-4 bg-muted/60"
                    : "ml-4 bg-brand-tint",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-semibold">
                    {comment.author_name ?? teamLabel}
                  </span>
                  {comment.author_kind === "internal" && comment.author_name ? (
                    <Badge variant="outline" className="text-[10px]">
                      {teamLabel}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground">
                    {formatCommentDate(comment.created_at)}
                  </span>
                  {comment.edited_at ? (
                    <span className="text-muted-foreground">
                      {translate("resources.quotes.portal.comments.edited")}
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-line break-words">
                  {comment.body}
                </p>
              </li>
            ))}
          </ol>
        )}

        {canComment ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (isValid && !isPending) void submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="quote-portal-comment-body"
                className="text-xs text-muted-foreground"
              >
                {translate("resources.quotes.portal.comments.message")}
              </Label>
              <Textarea
                id="quote-portal-comment-body"
                value={body}
                rows={4}
                maxLength={MAX_BODY_LENGTH}
                className="min-h-28 rounded-xl"
                onChange={(event) => {
                  setBody(event.target.value);
                  setIsSent(false);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label
                  htmlFor="quote-portal-comment-name"
                  className="text-xs text-muted-foreground"
                >
                  {translate("resources.quotes.portal.comments.name")}
                </Label>
                <Input
                  id="quote-portal-comment-name"
                  value={name}
                  autoComplete="name"
                  maxLength={200}
                  className="rounded-xl text-xs"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label
                  htmlFor="quote-portal-comment-email"
                  className="text-xs text-muted-foreground"
                >
                  {translate("resources.quotes.portal.comments.email")}
                </Label>
                <Input
                  id="quote-portal-comment-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  maxLength={320}
                  className="rounded-xl text-xs"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {translate(`resources.quotes.portal.errors.${error}`)}
              </p>
            ) : isSent ? (
              <p role="status" className="text-xs text-muted-foreground">
                {translate("resources.quotes.portal.comments.sent")}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={!isValid || isPending}
              className="mt-1 w-full rounded-xl bg-brand font-bold text-brand-foreground hover:bg-brand/90"
            >
              {translate("resources.quotes.portal.comments.submit")}
              <span aria-hidden>→</span>
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate("resources.quotes.portal.comments.closed")}
          </p>
        )}
      </div>

      {canComment ? (
        <p className="px-5 pb-5 text-[11px] leading-snug text-muted-foreground">
          {translate("resources.quotes.portal.comments.privacy")}
        </p>
      ) : null}
    </section>
  );
};
