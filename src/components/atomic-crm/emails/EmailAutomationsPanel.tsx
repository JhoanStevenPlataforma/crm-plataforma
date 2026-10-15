import { useEffect, useState } from "react";
import {
  useGetList,
  useLocaleState,
  useNotify,
  useTranslate,
  useUpdate,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SectionCard } from "../misc/SectionCard";
import { emailErrorMessage } from "../providers/commons/emailRpc";
import type {
  EmailAutomation,
  EmailAutomationState,
  EmailTemplate,
} from "../types";
import { asEmailLanguage } from "./emailTemplate";

const LIST_PAGE = { page: 1, perPage: 200 };
const STATES: EmailAutomationState[] = ["disabled", "paused", "enabled"];
/** The limits of the table's own checks: the inputs offer nothing it refuses. */
const DELAY_DAYS = { min: 1, max: 90 };
const MAX_SENDS = { min: 1, max: 3 };

type Draft = Pick<
  EmailAutomation,
  "state" | "template_key" | "delay_days" | "max_sends"
>;

const draftOf = (rule: EmailAutomation): Draft => ({
  state: rule.state,
  template_key: rule.template_key,
  delay_days: rule.delay_days,
  max_sends: rule.max_sends,
});

const within = (value: number | null, range: { min: number; max: number }) =>
  value != null &&
  Number.isInteger(value) &&
  value >= range.min &&
  value <= range.max;

/**
 * What the CRM sends by itself (docs/proposals/outbound-email.md).
 *
 * The rules are seeded and there are exactly two: nothing here adds or removes
 * one. A manager reads how each is set; an administrator switches it. Both
 * ship switched off, so an automatic message is never a surprise.
 */
export const EmailAutomationsPanel = ({ canEdit }: { canEdit: boolean }) => {
  const translate = useTranslate();
  const { data: rules, error } = useGetList<EmailAutomation>(
    "email_automations",
    { pagination: LIST_PAGE, sort: { field: "key", order: "ASC" } },
  );
  const { data: templates = [] } = useGetList<EmailTemplate>(
    "email_templates",
    {
      pagination: LIST_PAGE,
      sort: { field: "name", order: "ASC" },
      filter: { scope: "quote" },
    },
  );

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {translate("crm.email.automations.load_error")}
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {translate("crm.email.automations.description")}
      </p>
      {(rules ?? []).map((rule) => (
        <AutomationCard
          key={rule.id}
          rule={rule}
          templates={templates}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
};

const AutomationCard = ({
  rule,
  templates,
  canEdit,
}: {
  rule: EmailAutomation;
  templates: EmailTemplate[];
  canEdit: boolean;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [locale] = useLocaleState();
  const [draft, setDraft] = useState<Draft>(() => draftOf(rule));
  const [update, { isPending }] = useUpdate<EmailAutomation>();

  useEffect(() => setDraft(draftOf(rule)), [rule]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const isFollowup = rule.key === "quote_followup";
  const isValid =
    !isFollowup ||
    (within(draft.delay_days, DELAY_DAYS) &&
      within(draft.max_sends, MAX_SENDS));
  const isDirty = (Object.keys(draft) as Array<keyof Draft>).some(
    (key) => draft[key] !== rule[key],
  );

  // One entry per template KEY: a rule names the key, and each message picks
  // the language its quotation was last written in. The key is shown under the
  // name it has in the reader's language, when it has one.
  const language = asEmailLanguage(locale);
  const templateKeys = [
    ...new Map(
      [...templates]
        // The key the rule has is offered even when its template is inactive.
        .filter(
          (template) =>
            template.is_active || template.key === rule.template_key,
        )
        // Last write wins in the Map: the reader's language goes last.
        .sort(
          (a, b) =>
            Number(a.language === language) - Number(b.language === language),
        )
        .map((template) => [template.key, template.name] as const),
    ),
  ].sort(([, a], [, b]) => a.localeCompare(b));

  // Only what this form edits: the key is fixed and the audit columns are the
  // server's.
  const save = () =>
    update(
      "email_automations",
      { id: rule.id, data: draft, previousData: rule },
      {
        mutationMode: "pessimistic",
        onSuccess: () => notify("crm.email.automations.saved"),
        onError: (error) => notify(emailErrorMessage(error), { type: "error" }),
      },
    );

  const id = (field: string) => `email-automation-${rule.key}-${field}`;

  return (
    <SectionCard
      title={translate(`crm.email.automations.rules.${rule.key}.title`)}
      subtitle={translate(
        `crm.email.automations.rules.${rule.key}.description`,
      )}
      action={
        <Badge
          variant={rule.state === "enabled" ? "default" : "outline"}
          className="font-normal"
        >
          {translate(`crm.email.automations.states.${rule.state}`)}
        </Badge>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("state")}>
              {translate("crm.email.automations.state")}
            </Label>
            <Select
              value={draft.state}
              disabled={!canEdit}
              onValueChange={(value) =>
                set("state", value as EmailAutomationState)
              }
            >
              <SelectTrigger id={id("state")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {translate(`crm.email.automations.states.${state}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={id("template")}>
              {translate("crm.email.automations.template")}
            </Label>
            <Select
              value={draft.template_key}
              disabled={!canEdit}
              onValueChange={(value) => set("template_key", value)}
            >
              <SelectTrigger id={id("template")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateKeys.map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isFollowup ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor={id("delay")}>
                  {translate("crm.email.automations.delay_days")}
                </Label>
                <Input
                  id={id("delay")}
                  type="number"
                  {...DELAY_DAYS}
                  disabled={!canEdit}
                  value={draft.delay_days ?? ""}
                  onChange={(event) =>
                    set(
                      "delay_days",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={id("max-sends")}>
                  {translate("crm.email.automations.max_sends")}
                </Label>
                <Input
                  id={id("max-sends")}
                  type="number"
                  {...MAX_SENDS}
                  disabled={!canEdit}
                  value={draft.max_sends}
                  onChange={(event) =>
                    set("max_sends", Number(event.target.value))
                  }
                />
              </div>
            </>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {translate(`crm.email.automations.state_help.${draft.state}`)}
        </p>
        {isFollowup && !isValid ? (
          <p role="alert" className="text-xs text-destructive">
            {translate("crm.email.automations.followup_invalid", {
              min_days: DELAY_DAYS.min,
              max_days: DELAY_DAYS.max,
              min_sends: MAX_SENDS.min,
              max_sends: MAX_SENDS.max,
            })}
          </p>
        ) : null}

        {canEdit ? (
          <div>
            <Button disabled={isPending || !isDirty || !isValid} onClick={save}>
              {translate("ra.action.save")}
            </Button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
};
