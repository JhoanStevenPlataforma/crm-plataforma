import { useTranslate } from "ra-core";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The written reason a move needs (a quote transition, a deal's stage, a
 * cancelled task).
 *
 * Marked required, and says so in words while it is empty: the dialog's
 * confirm button stays disabled until something is typed, and a disabled
 * button with no explanation was read as broken in the usability audit.
 */
export const RequiredReasonField = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) => {
  const translate = useTranslate();
  const hintId = `${id}-hint`;
  const isEmpty = value.trim() === "";

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      </Label>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        autoFocus
        required
        aria-describedby={isEmpty ? hintId : undefined}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {isEmpty ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {translate("crm.common.reason_required")}
        </p>
      ) : null}
    </div>
  );
};
