import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useCreate,
  useDataProvider,
  useDelete,
  useNotify,
  useTranslate,
  useUpdate,
} from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { emailErrorMessage } from "../providers/commons/emailRpc";
import type { CrmDataProvider } from "../providers/types";
import type { EmailTemplate } from "../types";
import { unresolvedVariables } from "./emailTemplate";

const SCOPES: EmailTemplate["scope"][] = [
  "generic",
  "contact",
  "lead",
  "company",
  "deal",
  "quote",
];
const LANGUAGES: EmailTemplate["language"][] = ["es", "en", "fr"];
const CATEGORIES: EmailTemplate["category"][] = ["transactional", "commercial"];
const KEY_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;

type Draft = Omit<EmailTemplate, "id" | "is_system">;

const EMPTY: Draft = {
  key: "",
  name: "",
  subject: "",
  body: "",
  scope: "generic",
  category: "transactional",
  language: "es",
  is_active: true,
};

/**
 * One template: its name, what kind of record offers it, its subject and its
 * text.
 *
 * The variables it may use are read from the server for the chosen scope
 * (`email_template_variables()`), so the list shown is the list enforced: a
 * template naming anything else is refused when saved, and this dialog says
 * which variable before the server has to.
 */
export const EmailTemplateDialog = ({
  template,
  onClose,
  onSaved,
}: {
  /** Null for a new template. */
  template: EmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [draft, setDraft] = useState<Draft>(() =>
    template
      ? {
          key: template.key,
          name: template.name,
          subject: template.subject,
          body: template.body,
          scope: template.scope,
          category: template.category,
          language: template.language,
          is_active: template.is_active,
        }
      : EMPTY,
  );
  const [create, { isPending: isCreating }] = useCreate<EmailTemplate>();
  const [update, { isPending: isUpdating }] = useUpdate<EmailTemplate>();
  const [remove, { isPending: isRemoving }] = useDelete<EmailTemplate>();
  const isPending = isCreating || isUpdating || isRemoving;
  const isSystem = template?.is_system === true;

  const { data: allowed = [] } = useQuery({
    queryKey: ["email", "templateVariables", draft.scope],
    queryFn: () => dataProvider.getEmailTemplateVariables(draft.scope),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Every `{{name}}` in the text, the link included: here the question is
  // which are KNOWN, not which are still unfilled.
  const used = unresolvedVariables(draft.subject, draft.body, false);
  const unknown = used.filter((name) => !allowed.includes(name));
  const linkInSubject = /\{\{\s*quote_link\s*\}\}/.test(draft.subject);
  const canSave =
    !isPending &&
    draft.name.trim() !== "" &&
    draft.subject.trim() !== "" &&
    draft.body.trim() !== "" &&
    KEY_PATTERN.test(draft.key) &&
    unknown.length === 0 &&
    !linkInSubject;

  const callbacks = (message: string) => ({
    onSuccess: () => {
      notify(message);
      onSaved();
    },
    onError: (failure: unknown) =>
      notify(emailErrorMessage(failure), { type: "error" }),
  });

  const save = () => {
    const data = {
      ...draft,
      name: draft.name.trim(),
      subject: draft.subject.trim(),
      body: draft.body.trim(),
    };
    if (template) {
      update(
        "email_templates",
        { id: template.id, data, previousData: template },
        {
          mutationMode: "pessimistic",
          ...callbacks("crm.email.templates.saved"),
        },
      );
    } else {
      create(
        "email_templates",
        { data },
        callbacks("crm.email.templates.saved"),
      );
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate(
              template
                ? "crm.email.templates.edit_title"
                : "crm.email.templates.new_title",
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              isSystem
                ? "crm.email.templates.system_help"
                : "crm.email.templates.dialog_help",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-template-name">
                {translate("crm.email.templates.name")}
              </Label>
              <Input
                id="email-template-name"
                maxLength={120}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-template-key">
                {translate("crm.email.templates.key")}
              </Label>
              <Input
                id="email-template-key"
                maxLength={60}
                disabled={isSystem}
                value={draft.key}
                onChange={(event) => set("key", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {translate("crm.email.templates.key_help")}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-template-scope">
                {translate("crm.email.templates.scope")}
              </Label>
              <Select
                value={draft.scope}
                disabled={isSystem}
                onValueChange={(value) => set("scope", value as Draft["scope"])}
              >
                <SelectTrigger id="email-template-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {translate(`crm.email.templates.scopes.${scope}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-template-language">
                {translate("crm.email.templates.language")}
              </Label>
              <Select
                value={draft.language}
                disabled={isSystem}
                onValueChange={(value) =>
                  set("language", value as Draft["language"])
                }
              >
                <SelectTrigger id="email-template-language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {language.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-template-category">
                {translate("crm.email.templates.category")}
              </Label>
              <Select
                value={draft.category}
                onValueChange={(value) =>
                  set("category", value as Draft["category"])
                }
              >
                <SelectTrigger id="email-template-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {translate(`crm.email.templates.categories.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email-template-subject">
              {translate("crm.email.fields.subject")}
            </Label>
            <Input
              id="email-template-subject"
              maxLength={200}
              value={draft.subject}
              onChange={(event) => set("subject", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email-template-body">
              {translate("crm.email.fields.body")}
            </Label>
            <Textarea
              id="email-template-body"
              rows={10}
              value={draft.body}
              onChange={(event) => set("body", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {translate("crm.email.templates.variables", {
                variables: allowed.map((name) => `{{${name}}}`).join("  "),
              })}
            </p>
            {unknown.length > 0 ? (
              <p role="alert" className="text-xs text-destructive">
                {translate("crm.email.templates.unknown_variables", {
                  variables: unknown.map((name) => `{{${name}}}`).join(", "),
                })}
              </p>
            ) : null}
            {linkInSubject ? (
              <p role="alert" className="text-xs text-destructive">
                {translate("crm.email.templates.link_in_subject")}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="email-template-active">
              {translate("crm.email.templates.active_label")}
            </Label>
            <Switch
              id="email-template-active"
              checked={draft.is_active}
              onCheckedChange={(checked) => set("is_active", checked)}
            />
          </div>
        </div>

        <DialogFooter>
          {template && !isSystem ? (
            <Button
              variant="outline"
              className="mr-auto text-destructive"
              disabled={isPending}
              onClick={() =>
                remove(
                  "email_templates",
                  { id: template.id, previousData: template },
                  {
                    mutationMode: "pessimistic",
                    ...callbacks("crm.email.templates.deleted"),
                  },
                )
              }
            >
              {translate("ra.action.delete")}
            </Button>
          ) : null}
          <Button variant="outline" disabled={isPending} onClick={onClose}>
            {translate("ra.action.cancel")}
          </Button>
          <Button disabled={!canSave} onClick={save}>
            {translate("ra.action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
