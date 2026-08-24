import { Paperclip, Trash2 } from "lucide-react";
import { useLocaleState, useTranslate } from "ra-core";

import { Button } from "@/components/ui/button";

import type { TaskAttachment } from "../types";

/**
 * The files of a task, or of one comment (proposal §3.2, §8.2).
 *
 * Presentational on purpose: the same list renders in the task's Files tab and
 * under a comment, and both get their rows from a single query rather than one
 * per comment.
 *
 * A row is a button, not a link: the bucket is private, so the URL is signed
 * on click (`useTaskAttachments().open`) instead of being rendered into the
 * page where it would outlive the reader's access to the task.
 */
export const TaskAttachmentList = ({
  attachments,
  onOpen,
  onRemove,
  isPending,
}: {
  attachments: TaskAttachment[];
  onOpen: (attachment: TaskAttachment) => void;
  onRemove?: (attachment: TaskAttachment) => void;
  isPending?: boolean;
}) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();

  if (attachments.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex items-center gap-2 group">
          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
          <button
            type="button"
            className="text-sm underline underline-offset-2 text-left truncate"
            onClick={() => onOpen(attachment)}
          >
            {attachment.file_name}
          </button>
          {attachment.size_bytes != null && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatFileSize(attachment.size_bytes, locale)}
            </span>
          )}
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={translate("resources.tasks.attachments.remove", {
                name: attachment.file_name,
              })}
              disabled={isPending}
              onClick={() => onRemove(attachment)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};

/**
 * "24.7kB", localized. `Intl` already knows how to do this in every locale the
 * app ships, so there is no byte-unit table here.
 */
const formatFileSize = (bytes: number, locale = "en"): string =>
  new Intl.NumberFormat(locale, {
    notation: "compact",
    style: "unit",
    unit: "byte",
    unitDisplay: "narrow",
  }).format(bytes);
