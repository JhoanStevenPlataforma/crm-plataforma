import { useDataProvider, useGetList, useNotify, useTranslate } from "ra-core";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../root/ConfigurationContext";

type DealQuoteStageRule = {
  id: number;
  trigger_key: QuoteTrigger;
  to_stage: string;
  closes: boolean;
  only_if_no_open_quote: boolean;
};

/** The quotation events that can move a deal, in the order they happen. */
const TRIGGERS = [
  "sent",
  "viewed",
  "commented",
  "negotiating",
  "accepted",
  "rejected",
  "expired",
] as const;
type QuoteTrigger = (typeof TRIGGERS)[number];

/**
 * What each event means for the deal beyond its stage — kept when an admin
 * changes the stage: an answer CLOSES the deal (and a closed deal is never
 * reopened by a quotation), bad news waits until no other quotation is open.
 */
const TRIGGER_FLAGS: Record<
  QuoteTrigger,
  { closes: boolean; only_if_no_open_quote: boolean }
> = {
  sent: { closes: false, only_if_no_open_quote: false },
  viewed: { closes: false, only_if_no_open_quote: false },
  commented: { closes: false, only_if_no_open_quote: false },
  negotiating: { closes: false, only_if_no_open_quote: false },
  accepted: { closes: true, only_if_no_open_quote: false },
  rejected: { closes: true, only_if_no_open_quote: true },
  expired: { closes: false, only_if_no_open_quote: true },
};

const NONE = "__none";

/**
 * Where a quotation's event moves its deal (`deal_quote_stage_rules`): one
 * stage per event, or none. Saved on each choice — the rows are the rule the
 * server applies, and they are not part of the configuration form above.
 *
 * The stages offered are this installation's own, so an installation that
 * renamed its pipeline points the events at the new names here.
 */
export const DealQuoteStageRules = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { dealStages } = useConfigurationContext();
  const { data: rules = [], refetch } = useGetList<DealQuoteStageRule>(
    "deal_quote_stage_rules",
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "id", order: "ASC" },
    },
  );

  const save = async (trigger: QuoteTrigger, stage: string) => {
    const rule = rules.find((row) => row.trigger_key === trigger);
    try {
      if (stage === NONE) {
        if (rule) {
          await dataProvider.delete("deal_quote_stage_rules", {
            id: rule.id,
            previousData: rule,
          });
        }
      } else if (rule) {
        await dataProvider.update("deal_quote_stage_rules", {
          id: rule.id,
          data: { to_stage: stage },
          previousData: rule,
        });
      } else {
        await dataProvider.create("deal_quote_stage_rules", {
          data: {
            trigger_key: trigger,
            to_stage: stage,
            ...TRIGGER_FLAGS[trigger],
          },
        });
      }
      notify("crm.settings.deal_quote_rules.saved");
    } catch {
      notify("crm.settings.deal_quote_rules.save_error", { type: "error" });
    } finally {
      refetch();
    }
  };

  return (
    <Card id="deal-quote-rules" className="scroll-mt-20">
      <CardContent className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {translate("crm.settings.deal_quote_rules.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate("crm.settings.deal_quote_rules.help")}
          </p>
        </div>
        <div className="grid gap-3">
          {TRIGGERS.map((trigger) => {
            const rule = rules.find((row) => row.trigger_key === trigger);
            const id = `deal-quote-rule-${trigger}`;
            return (
              <div
                key={trigger}
                className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]"
              >
                <label htmlFor={id} className="text-sm">
                  {translate(
                    `crm.settings.deal_quote_rules.triggers.${trigger}`,
                  )}
                </label>
                <Select
                  value={rule?.to_stage ?? NONE}
                  onValueChange={(stage) => save(trigger, stage)}
                >
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {translate("crm.settings.deal_quote_rules.no_move")}
                    </SelectItem>
                    {dealStages.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                    {rule &&
                    !dealStages.some(
                      (stage) => stage.value === rule.to_stage,
                    ) ? (
                      // A stage renamed since the rule was set: shown, so the
                      // admin sees the rule is pointing nowhere.
                      <SelectItem value={rule.to_stage}>
                        {translate(
                          "crm.settings.deal_quote_rules.unknown_stage",
                          {
                            stage: rule.to_stage,
                          },
                        )}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
