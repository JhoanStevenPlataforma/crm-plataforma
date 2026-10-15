import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslate, type Identifier } from "ra-core";

import { Button } from "@/components/ui/button";

import type { EmailEntityType } from "../types";
import { EmailComposeDialog } from "./EmailComposeDialog";
import { useEmailStatus } from "./useEmailStatus";

/**
 * "Send email" on a record. Absent while outbound email is switched off --
 * a button that can only answer "not available" is noise.
 *
 * The dialog is mounted only while open, so a page of records does not ask
 * the server for every record's recipients.
 */
export const SendEmailButton = ({
  entityType,
  entityId,
  label,
  variant = "outline",
  size = "sm",
  className,
}: {
  entityType: EmailEntityType;
  entityId: Identifier;
  /** A translation key; "Send email" when absent. */
  label?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
}) => {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const { data: status } = useEmailStatus();

  if (!status?.is_enabled) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Mail className="size-4" aria-hidden="true" />
        {translate(label ?? "crm.email.action.send")}
      </Button>
      {open ? (
        <EmailComposeDialog
          open
          entityType={entityType}
          entityId={entityId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
};
