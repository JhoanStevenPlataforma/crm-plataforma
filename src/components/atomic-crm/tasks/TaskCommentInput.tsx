import { Paperclip, X } from "lucide-react";
import { useGetList, useTranslate } from "ra-core";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { Sale } from "../types";
import { TaskAttachmentFileInput } from "./TaskAttachmentFileInput";
import {
  activeMentionQuery,
  applyMention,
  type MentionQuery,
} from "./taskMentions";

const MAX_SUGGESTIONS = 5;

/**
 * The comment composer, with @mention autocomplete (proposal §8.2).
 *
 * The picker writes a `@[Name](sales:12)` token rather than a bare name, which
 * is what lets the database resolve the mention server-side from the body
 * alone. Picking from the list is therefore not a convenience — it is the only
 * way a mention becomes real, and typing a name by hand deliberately does
 * nothing.
 */
export const TaskCommentInput = ({
  onSubmit,
  isPending,
  initialValue = "",
  onCancel,
  submitLabel,
  canAttach = false,
}: {
  onSubmit: (body: string, files: File[]) => void;
  isPending?: boolean;
  initialValue?: string;
  onCancel?: () => void;
  submitLabel?: string;
  /** Files can be staged when composing a new comment, not when editing one. */
  canAttach?: boolean;
}) => {
  const translate = useTranslate();
  const [body, setBody] = useState(initialValue);
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [caret, setCaret] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "first_name", order: "ASC" },
  });

  const suggestions = (() => {
    if (query == null || !sales) return [];
    const needle = query.query.toLowerCase();
    return sales
      .filter((sale) =>
        `${sale.first_name} ${sale.last_name}`.toLowerCase().includes(needle),
      )
      .slice(0, MAX_SUGGESTIONS);
  })();

  const syncQuery = (value: string, position: number) => {
    setCaret(position);
    setQuery(activeMentionQuery(value, position));
  };

  const pick = (sale: Sale) => {
    if (query == null) return;
    const label = `${sale.first_name} ${sale.last_name}`.trim();
    const next = applyMention(body, query, caret, "sales", sale.id, label);
    setBody(next.body);
    setQuery(null);
    // The caret must land after the inserted token, not at the end of the
    // body: the user may be mentioning someone mid-sentence.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = () => {
    if (!body.trim() || isPending) return;
    onSubmit(body.trim(), files);
    setBody("");
    setFiles([]);
    setQuery(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={inputRef}
        value={body}
        rows={3}
        placeholder={translate("resources.tasks.comments.placeholder")}
        aria-label={translate("resources.tasks.comments.placeholder")}
        onChange={(event) => {
          setBody(event.target.value);
          syncQuery(event.target.value, event.target.selectionStart ?? 0);
        }}
        onSelect={(event) =>
          syncQuery(body, event.currentTarget.selectionStart ?? 0)
        }
        onKeyDown={(event) => {
          if (event.key === "Escape" && query) {
            event.preventDefault();
            setQuery(null);
          }
          // Enter sends, Shift+Enter breaks the line — the convention every
          // chat tool uses, and the one the muscle memory expects.
          if (event.key === "Enter" && !event.shiftKey && !query) {
            event.preventDefault();
            submit();
          }
        }}
      />

      {suggestions.length > 0 && (
        <ul
          className="border rounded-md divide-y bg-popover"
          role="listbox"
          aria-label={translate("resources.tasks.comments.mention_list")}
        >
          {suggestions.map((sale) => (
            <li key={sale.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer"
                onClick={() => pick(sale)}
              >
                {sale.first_name} {sale.last_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Staged, not uploaded: the files are attached once the comment exists,
          because an attachment row hangs off a comment id (§8.2). */}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs"
                aria-label={translate("resources.tasks.attachments.remove", {
                  name: file.name,
                })}
                onClick={() =>
                  setFiles((staged) =>
                    staged.filter((candidate) => candidate !== file),
                  )
                }
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 justify-end">
        {canAttach && (
          <div className="mr-auto">
            <TaskAttachmentFileInput
              isPending={isPending}
              label="resources.tasks.attachments.attach"
              onSelect={(picked) =>
                setFiles((staged) => [...staged, ...picked])
              }
            />
          </div>
        )}
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            {translate("ra.action.cancel")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={!body.trim() || isPending}
        >
          {translate(submitLabel ?? "resources.tasks.comments.send")}
        </Button>
      </div>
    </div>
  );
};
