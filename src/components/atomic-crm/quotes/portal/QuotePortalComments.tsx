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
      className="quote-print-hide flex flex-col gap-4 rounded-xl border bg-card p-6 text-sm text-card-foreground"
    >
      <h2 id="quote-portal-comments-title" className="text-base font-semibold">
        {translate("resources.quotes.portal.comments.title")}
      </h2>

      {comments.length === 0 ? (
        <p className="text-muted-foreground">
          {translate("resources.quotes.portal.comments.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.map((comment, index) => (
            <li
              key={`${comment.created_at}-${index}`}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3",
                comment.author_kind === "internal" && "bg-muted/40",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">
                  {comment.author_name ?? teamLabel}
                </span>
                {comment.author_kind === "internal" && comment.author_name ? (
                  <Badge variant="outline" className="text-[10px]">
                    {teamLabel}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {formatCommentDate(comment.created_at)}
                </span>
                {comment.edited_at ? (
                  <span className="text-xs text-muted-foreground">
                    {translate("resources.quotes.portal.comments.edited")}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-line break-words">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}

      {canComment ? (
        <form
          className="flex flex-col gap-4 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid && !isPending) void submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="quote-portal-comment-body">
              {translate("resources.quotes.portal.comments.message")}
            </Label>
            <Textarea
              id="quote-portal-comment-body"
              value={body}
              rows={4}
              maxLength={MAX_BODY_LENGTH}
              onChange={(event) => {
                setBody(event.target.value);
                setIsSent(false);
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quote-portal-comment-name">
                {translate("resources.quotes.portal.comments.name")}
              </Label>
              <Input
                id="quote-portal-comment-name"
                value={name}
                autoComplete="name"
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quote-portal-comment-email">
                {translate("resources.quotes.portal.comments.email")}
              </Label>
              <Input
                id="quote-portal-comment-email"
                type="email"
                value={email}
                autoComplete="email"
                maxLength={320}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate("resources.quotes.portal.comments.privacy")}
          </p>

          {error ? (
            <p role="alert" className="text-destructive">
              {translate(`resources.quotes.portal.errors.${error}`)}
            </p>
          ) : isSent ? (
            <p role="status" className="text-muted-foreground">
              {translate("resources.quotes.portal.comments.sent")}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={!isValid || isPending}>
              {translate("resources.quotes.portal.comments.submit")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground">
          {translate("resources.quotes.portal.comments.closed")}
        </p>
      )}
    </section>
  );
};
