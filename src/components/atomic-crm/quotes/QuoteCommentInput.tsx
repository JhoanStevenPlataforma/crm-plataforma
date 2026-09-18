import { useTranslate } from "ra-core";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { QuoteComment } from "../types";

/** `quote_comments_body_length`. */
const MAX_BODY_LENGTH = 8000;

type Visibility = QuoteComment["visibility"];

/**
 * Writes a comment on a quotation, or rewrites the body of one.
 *
 * The AUDIENCE IS CHOSEN HERE, once, before the words leave: the database
 * refuses to change `visibility` afterwards, so a remark written for the team
 * can never be shared after the fact, and nothing shared can be taken back into
 * the team's thread. It starts on "internal" every time, replies to the
 * customer included, for the reason §2.5 gives the column default: shared by
 * default turns a note about the customer's budget into a message to the
 * customer. An edit shows no switch at all.
 *
 * Enter adds a line; Ctrl/Cmd+Enter sends. A message that may reach a customer
 * is not sent by a stray keystroke.
 *
 * The text is cleared only once `onSubmit` resolves, so a refused write leaves
 * the words where they were typed.
 */
export const QuoteCommentInput = ({
  onSubmit,
  isPending = false,
  initialBody = "",
  showVisibility = true,
  submitLabel = "resources.quotes.comments.send",
  onCancel,
}: {
  onSubmit: (body: string, visibility: Visibility) => Promise<void>;
  isPending?: boolean;
  initialBody?: string;
  showVisibility?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}) => {
  const translate = useTranslate();
  const id = useId();
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = body.trim();
  const isBusy = isPending || isSubmitting;
  const isShared = visibility === "shared";

  const submit = async () => {
    if (!trimmed || isBusy) return;
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed, visibility);
      setBody("");
      setVisibility("internal");
    } catch {
      // The container has already said why; the words stay for another try.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        rows={3}
        maxLength={MAX_BODY_LENGTH}
        aria-label={translate("resources.quotes.comments.placeholder")}
        placeholder={translate("resources.quotes.comments.placeholder")}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {showVisibility ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Switch
              id={`${id}-shared`}
              checked={isShared}
              onCheckedChange={(checked) =>
                setVisibility(checked ? "shared" : "internal")
              }
            />
            <Label htmlFor={`${id}-shared`} className="font-normal">
              {translate("resources.quotes.comments.share")}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              isShared
                ? "resources.quotes.comments.share_on"
                : "resources.quotes.comments.share_off",
            )}
          </p>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={onCancel}
          >
            {translate("ra.action.cancel")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!trimmed || isBusy}
          onClick={() => void submit()}
        >
          {translate(
            showVisibility && isShared
              ? "resources.quotes.comments.send_shared"
              : submitLabel,
          )}
        </Button>
      </div>
    </div>
  );
};
