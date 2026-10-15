import { useState } from "react";
import { Plus } from "lucide-react";
import { useGetList, useTranslate } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import type { EmailTemplate } from "../types";
import { EmailTemplateDialog } from "./EmailTemplateDialog";

const LIST_PAGE = { page: 1, perPage: 200 };

/**
 * The reusable messages: what everybody's compose dialog offers.
 *
 * An admin sees inactive ones too (a template being written is inactive until
 * it is ready), so the list here is longer than the one a rep is offered. A
 * system template can be reworded and switched off, never deleted or re-keyed:
 * an automation names it by key.
 */
export const EmailTemplatesPanel = () => {
  const translate = useTranslate();
  // `undefined`: closed. `null`: a new template. Otherwise the one edited.
  const [editing, setEditing] = useState<EmailTemplate | null | undefined>(
    undefined,
  );

  const {
    data = [],
    error,
    refetch,
  } = useGetList<EmailTemplate>("email_templates", {
    pagination: LIST_PAGE,
    sort: { field: "name", order: "ASC" },
  });

  return (
    <SectionCard
      title={translate("crm.email.tabs.templates")}
      subtitle={translate("crm.email.templates.description")}
      action={
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus className="size-4" aria-hidden="true" />
          {translate("crm.email.templates.new")}
        </Button>
      }
      contentClassName="p-0"
    >
      {error ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          {translate("crm.email.templates.load_error")}
        </p>
      ) : data.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {translate("crm.email.templates.empty")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{translate("crm.email.templates.name")}</TableHead>
              <TableHead>{translate("crm.email.templates.scope")}</TableHead>
              <TableHead>{translate("crm.email.templates.language")}</TableHead>
              <TableHead>{translate("crm.email.fields.subject")}</TableHead>
              <TableHead>{translate("crm.email.templates.state")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="cursor-pointer text-left hover:underline"
                    onClick={() => setEditing(template)}
                  >
                    {template.name}
                  </button>
                </TableCell>
                <TableCell>
                  {translate(`crm.email.templates.scopes.${template.scope}`)}
                </TableCell>
                <TableCell className="uppercase">{template.language}</TableCell>
                <TableCell className="max-w-80 truncate text-sm text-muted-foreground">
                  {template.subject}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="font-normal">
                      {translate(
                        template.is_active
                          ? "crm.email.templates.active"
                          : "crm.email.templates.inactive",
                      )}
                    </Badge>
                    {template.is_system ? (
                      <Badge variant="outline" className="font-normal">
                        {translate("crm.email.templates.system")}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing !== undefined ? (
        <EmailTemplateDialog
          template={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            refetch();
          }}
        />
      ) : null}
    </SectionCard>
  );
};
