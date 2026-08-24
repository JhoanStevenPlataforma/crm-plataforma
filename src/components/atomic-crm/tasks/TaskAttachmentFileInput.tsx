import { Paperclip } from "lucide-react";
import { useTranslate } from "ra-core";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Attach files" — a labelled file input, reused by the task's Files tab and
 * by the comment composer.
 *
 * A plain `<input type="file">` behind a button rather than the note editor's
 * `<FileInput>`: that one stages files inside a react-hook-form record, and
 * these uploads are not part of a form submission — a task attachment is its
 * own row, written the moment the bytes are stored.
 */
export const TaskAttachmentFileInput = ({
  onSelect,
  isPending,
  label = "resources.tasks.attachments.add",
}: {
  onSelect: (files: File[]) => void;
  isPending?: boolean;
  label?: string;
}) => {
  const translate = useTranslate();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-label={translate(label)}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Clearing the input is what lets the same file be picked twice in a
          // row: without it the change event never fires the second time.
          event.target.value = "";
          onSelect(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3 w-3" />
        {translate(label)}
      </Button>
    </div>
  );
};
