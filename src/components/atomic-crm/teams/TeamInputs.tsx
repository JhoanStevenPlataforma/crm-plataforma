import { required, useTranslate } from "ra-core";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { TextInput } from "@/components/admin/text-input";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { currentYearPeriod } from "./teamBudget";

/**
 * A team is name + description (proposal §3.2) plus what it is expected to sell.
 *
 * The three budget fields are write-only: the data provider turns them into a
 * `team_budgets` row and reads the vigente one back under the same names.
 * Saving with the same period edits that period's amount; changing the period
 * opens a new one and leaves the previous figure intact, which is the whole
 * reason the budget is a table and not a column.
 *
 * Labels resolve from `resources.teams.fields.*` by source name, so they are
 * not repeated here.
 */
export const TeamInputs = () => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const period = currentYearPeriod();

  return (
    <div className="flex flex-col gap-4 w-full">
      <TextInput source="name" validate={required()} helperText={false} />
      <TextInput source="description" multiline helperText={false} />

      <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
        <NumberInput
          source="budget"
          min={0}
          step={1000}
          className="sm:flex-1"
          helperText={translate("resources.teams.budget.helper", { currency })}
        />
        <DateInput
          source="budget_start"
          className="sm:flex-1"
          defaultValue={period.start}
          helperText={false}
        />
        <DateInput
          source="budget_end"
          className="sm:flex-1"
          defaultValue={period.end}
          helperText={false}
        />
      </div>
    </div>
  );
};
