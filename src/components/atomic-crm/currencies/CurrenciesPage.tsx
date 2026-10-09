import { useCanAccess, useTranslate } from "ra-core";
import { useSearchParams } from "react-router";

import { PageHeader } from "@/components/admin/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CurrencyTable } from "./CurrencyTable";
import { FxHealthPanel } from "./FxHealthPanel";
import { FxOverview } from "./FxOverview";
import { FxSettingsForm } from "./FxSettingsForm";
import { ProvidersPanel } from "./ProvidersPanel";
import { RateHistory } from "./RateHistory";
import { RatesTable } from "./RatesTable";

const TABS = [
  "overview",
  "currencies",
  "rates",
  "providers",
  "history",
  "settings",
  "health",
] as const;
type Tab = (typeof TABS)[number];

/**
 * Financial settings > Currencies and exchange rates
 * (docs/proposals/multi-currency-fx.md).
 *
 * One page with tabs rather than seven routes: the tabs are views of one
 * subject, and the active tab lives in the URL (`?tab=`) so a link -- the
 * failing-provider notification's, for one -- lands on the right view.
 *
 * Everybody reaches it (a rep checks the rate a quotation will use). Which
 * tabs show, and what each offers, follows the role; the database enforces
 * the same rules whatever is shown here.
 */
export const CurrenciesPage = () => {
  const translate = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canAccess: canSeeHealth } = useCanAccess({
    resource: "fx_health",
    action: "list",
  });
  const { canAccess: canConfigure } = useCanAccess({
    resource: "exchange_rate_settings",
    action: "edit",
  });

  const visible = TABS.filter((tab) => {
    if (tab === "health" || tab === "providers") return canSeeHealth;
    if (tab === "settings") return canConfigure;
    return true;
  });
  const requested = searchParams.get("tab") as Tab | null;
  const tab: Tab =
    requested && visible.includes(requested) ? requested : "overview";

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={translate("crm.fx.title")}
        description={translate("crm.fx.description")}
        className="mb-0"
      />
      <Tabs value={tab} onValueChange={go}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            {visible.map((key) => (
              <TabsTrigger key={key} value={key}>
                {translate(`crm.fx.tabs.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {tab === "overview" ? <FxOverview onNavigate={go} /> : null}
      {tab === "currencies" ? <CurrencyTable /> : null}
      {tab === "rates" ? <RatesTable /> : null}
      {tab === "providers" ? <ProvidersPanel /> : null}
      {tab === "history" ? <RateHistory /> : null}
      {tab === "settings" ? <FxSettingsForm /> : null}
      {tab === "health" ? <FxHealthPanel /> : null}
    </div>
  );
};

CurrenciesPage.path = "/currencies";
