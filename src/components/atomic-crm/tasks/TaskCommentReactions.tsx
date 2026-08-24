import { SmilePlus } from "lucide-react";
import { useGetIdentity, useTranslate } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { TaskCommentReaction } from "../types";

/**
 * Emoji acknowledgements on a comment (proposal §8.2).
 *
 * 👍 is the point: "seen and agreed" without a reply that says nothing, which
 * is what keeps a task thread readable. Each reaction is still an attributed
 * row and lands in the audit trail like any other acknowledgement.
 */
const REACTION_EMOJIS = ["👍", "✅", "👀", "🎉"];

export const TaskCommentReactions = ({
  reactions,
  onToggle,
  isPending,
}: {
  reactions: TaskCommentReaction[];
  /** `mine` is the caller's own row for that emoji, when it exists. */
  onToggle: (emoji: string, mine?: TaskCommentReaction) => void;
  isPending?: boolean;
}) => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const used = REACTION_EMOJIS.filter((emoji) =>
    reactions.some((reaction) => reaction.emoji === emoji),
  );
  const offered = isPickerOpen
    ? REACTION_EMOJIS.filter((emoji) => !used.includes(emoji))
    : [];

  const mineFor = (emoji: string) =>
    reactions.find(
      (reaction) =>
        reaction.emoji === emoji &&
        identity != null &&
        reaction.sales_id === identity.id,
    );

  return (
    <div className="flex items-center gap-1">
      {used.map((emoji) => {
        const count = reactions.filter(
          (reaction) => reaction.emoji === emoji,
        ).length;
        const mine = mineFor(emoji);
        return (
          <Button
            key={emoji}
            type="button"
            variant={mine ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            aria-label={translate(
              mine
                ? "resources.tasks.comments.reactions.remove"
                : "resources.tasks.comments.reactions.add",
              { emoji },
            )}
            aria-pressed={mine != null}
            disabled={isPending}
            onClick={() => onToggle(emoji, mine)}
          >
            <span aria-hidden>{emoji}</span>
            <span>{count}</span>
          </Button>
        );
      })}

      {offered.map((emoji) => (
        <Button
          key={emoji}
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          aria-label={translate("resources.tasks.comments.reactions.add", {
            emoji,
          })}
          disabled={isPending}
          onClick={() => {
            onToggle(emoji, undefined);
            setIsPickerOpen(false);
          }}
        >
          <span aria-hidden>{emoji}</span>
        </Button>
      ))}

      {offered.length === 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-xs"
          aria-label={translate("resources.tasks.comments.reactions.open")}
          disabled={isPending}
          onClick={() => setIsPickerOpen(true)}
        >
          <SmilePlus className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};
