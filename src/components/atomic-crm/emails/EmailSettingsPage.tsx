import { useCanAccess, useGetOne, useTranslate } from "ra-core";
import { Navigate, useSearchParams } from "react-router";

import { PageHeader } from "@/components/admin/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { EmailSettings } from "../types";
import { EmailAutomationsPanel } from "./EmailAutomationsPanel";
import { EmailHistoryPanel } from "./EmailHistoryPanel";
import { EmailProviderForm } from "./EmailProviderForm";
import { EmailSecretsCard } from "./EmailSecretsCard";
import { EmailStatusSummary } from "./EmailStatusSummary";
import { EmailSuppressionsPanel } from "./EmailSuppressionsPanel";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import { EmailTestCard } from "./EmailTestCard";

const TABS = [
  "history",
  "suppressions",
  "automations",
  "templates",
  "settings",
] as const;
type Tab = (typeof TABS)[number];

/**
 * Settings > Email (docs/proposals/outbound-email.md).
 *
 * One page with tabs, the active one in the URL (`?tab=`), like the currencies
 * page: every message with how its delivery went, the addresses the CRM no
 * longer writes to, what it sends by itself, the templates, and the provider
 * with its sender and credentials.
 *
 * Managers reach the first three -- they are what explains a message, or a
 * refusal, to their team -- and read the automations without switching them;
 * the templates and the provider are an admin's. The page gates itself
 * (the router does not), and the database enforces the same rules whatever is
 * rendered here.
 */
export const EmailSettingsPage = () => {
  const translate = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canAccess: canSeeHistory, isPending: isHistoryPending } =
    useCanAccess({ resource: "email_history", action: "list" });
  const { canAccess: canConfigure, isPending: isConfigurePending } =
    useCanAccess({ resource: "email_settings", action: "edit" });

  if (isHistoryPending || isConfigurePending) return null;
  if (!canSeeHistory && !canConfigure) return <Navigate to="/" replace />;

  const visible = TABS.filter((tab) =>
    tab === "templates" || tab === "settings" ? canConfigure : canSeeHistory,
  );
  const requested = searchParams.get("tab") as Tab | null;
  const tab: Tab =
    requested && visible.includes(requested) ? requested : visible[0];

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={translate("crm.email.settings.title")}
        description={translate("crm.email.settings.description")}
        className="mb-0"
      />
      <EmailStatusSummary />
      <Tabs value={tab} onValueChange={go}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            {visible.map((key) => (
              <TabsTrigger key={key} value={key}>
                {translate(`crm.email.tabs.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {canSeeHistory ? (
          <>
            <TabsContent value="history">
              <EmailHistoryPanel />
            </TabsContent>
            <TabsContent value="suppressions">
              <EmailSuppressionsPanel />
            </TabsContent>
            <TabsContent value="automations">
              <EmailAutomationsPanel canEdit={canConfigure === true} />
            </TabsContent>
          </>
        ) : null}
        {canConfigure ? (
          <>
            <TabsContent value="templates">
              <EmailTemplatesPanel />
            </TabsContent>
            <TabsContent value="settings">
              <ProviderSettings />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
};

/** The provider, the sender, the credentials and a test message. */
const ProviderSettings = () => {
  const translate = useTranslate();
  const { data: settings, error } = useGetOne<EmailSettings>("email_settings", {
    id: 1,
  });

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {translate("crm.email.settings.load_error")}
      </p>
    );
  }
  if (!settings) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <EmailProviderForm settings={settings} />
      <EmailSecretsCard />
      <EmailTestCard />
    </div>
  );
};

EmailSettingsPage.path = "/email";
