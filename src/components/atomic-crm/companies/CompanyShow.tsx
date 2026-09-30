import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { SortButton } from "@/components/admin/sort-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityTasksPanel } from "../tasks/EntityTasksPanel";
import { EntityTimeline } from "../timeline/EntityTimeline";
import { UserPlus } from "lucide-react";
import {
  RecordContextProvider,
  ShowBase,
  useListContext,
  useLocaleState,
  useRecordContext,
  useShowContext,
  useTranslate,
} from "ra-core";
import {
  Link as RouterLink,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";

import { ActivityLog } from "../activity/ActivityLog";
import { Avatar } from "../contacts/Avatar";
import { TagsList } from "../contacts/TagsList";
import { findDealLabel } from "../deals/dealUtils";
import { formatRelativeDate } from "../misc/RelativeDate";
import { Status } from "../misc/Status";
import { formatMoney } from "../misc/reporting";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contact, Deal } from "../types";
import { CompanyAside } from "./CompanyAside";
import { CompanyAvatar } from "./CompanyAvatar";
import { contactDisplayName } from "../contacts/contactName";
import { RecordBreadcrumb } from "../misc/RecordBreadcrumb";

export const CompanyShow = () => (
  <ShowBase>
    <CompanyShowContent />
  </ShowBase>
);

const CompanyShowContent = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  const navigate = useNavigate();

  // Get tab from URL or default to "activity"
  const tabMatch = useMatch("/companies/:id/show/:tab");
  const currentTab = tabMatch?.params?.tab || "activity";

  const handleTabChange = (value: string) => {
    if (value === currentTab) return;
    if (value === "activity") {
      navigate(`/companies/${record?.id}/show`);
      return;
    }
    navigate(`/companies/${record?.id}/show/${value}`);
  };

  if (isPending || !record) return null;

  return (
    // Details first on a phone, the right-hand column from `lg` up; see
    // `ContactShow`.
    <div className="mt-2 flex flex-col gap-6 pb-2 lg:flex-row lg:gap-8">
      <RecordBreadcrumb resource="companies" />
      <CompanyAside />
      <div className="min-w-0 flex-1 lg:order-first">
        <Card>
          <CardContent>
            <div className="mb-4 flex items-center">
              <CompanyAvatar />
              <h1 className="ml-3 flex-1 text-2xl leading-tight font-semibold tracking-tight">
                {record.name}
              </h1>
            </div>
            <Tabs defaultValue={currentTab} onValueChange={handleTabChange}>
              <TabsList
                className={`grid w-full ${record.nb_deals ? "grid-cols-4" : "grid-cols-3"}`}
              >
                <TabsTrigger value="activity">
                  {translate("crm.common.activity")}
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  {record.nb_contacts === 0
                    ? translate("resources.companies.no_contacts")
                    : translate("resources.companies.nb_contacts", {
                        smart_count: record.nb_contacts ?? 0,
                      })}
                </TabsTrigger>
                {record.nb_deals ? (
                  <TabsTrigger value="deals">
                    {translate("resources.companies.nb_deals", {
                      smart_count: record.nb_deals ?? 0,
                    })}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="tasks">
                  {translate("resources.tasks.name", { smart_count: 2 })}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="activity" className="pt-2">
                <ActivityLog companyId={record.id} context="company" />
              </TabsContent>
              <TabsContent value="contacts">
                {record.nb_contacts ? (
                  <ReferenceManyField
                    reference="contacts_summary"
                    target="company_id"
                    sort={{ field: "last_name", order: "ASC" }}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-row justify-end space-x-2 mt-1">
                        {!!record.nb_contacts && (
                          <SortButton
                            fields={["last_name", "first_name", "last_seen"]}
                          />
                        )}
                        <CreateRelatedContactButton />
                      </div>
                      <ContactsIterator />
                    </div>
                  </ReferenceManyField>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-row justify-end space-x-2 mt-1">
                      <CreateRelatedContactButton />
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="deals">
                {record.nb_deals ? (
                  <ReferenceManyField
                    reference="deals"
                    target="company_id"
                    sort={{ field: "name", order: "ASC" }}
                  >
                    <DealsIterator />
                  </ReferenceManyField>
                ) : null}
              </TabsContent>
              <TabsContent value="tasks" className="pt-2">
                <EntityTasksPanel
                  entityType="company"
                  entityId={record.id}
                  entityLabel={record.name}
                />
                {/* The legacy `activity` tab is `activity_log`, which does not
                    know tasks exist (W9). The unified timeline sits with the
                    tasks it explains until that view is retired (§6.1). */}
                <div className="border-t mt-4 pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {translate("resources.tasks.timeline.title")}
                  </h3>
                  <EntityTimeline entityType="company" entityId={record.id} />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ContactsIterator = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const location = useLocation();
  const { data: contacts, error, isPending } = useListContext<Contact>();

  if (isPending || error) return null;

  return (
    <div className="pt-0">
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <div className="p-0 text-sm">
            <RouterLink
              to={`/contacts/${contact.id}/show`}
              state={{ from: location.pathname }}
              className="flex items-center justify-between hover:bg-muted py-2 transition-colors"
            >
              <div className="mr-4">
                <Avatar />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{contactDisplayName(contact)}</div>
                <div className="text-sm text-muted-foreground">
                  {contact.title}
                  {contact.nb_tasks
                    ? ` - ${translate("crm.common.task_count", {
                        smart_count: contact.nb_tasks ?? 0,
                      })}`
                    : ""}
                  &nbsp; &nbsp;
                  <TagsList />
                </div>
              </div>
              {contact.last_seen && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    {translate("crm.common.last_activity_with_date", {
                      date: formatRelativeDate(contact.last_seen, locale),
                    })}{" "}
                    <Status status={contact.status} />
                  </div>
                </div>
              )}
            </RouterLink>
          </div>
        </RecordContextProvider>
      ))}
    </div>
  );
};

const CreateRelatedContactButton = () => {
  const translate = useTranslate();
  const company = useRecordContext<Company>();
  return (
    <Button variant="outline" asChild size="sm" className="h-9">
      <RouterLink
        to="/contacts/create"
        state={company ? { record: { company_id: company.id } } : undefined}
        className="flex items-center gap-2"
      >
        <UserPlus className="h-4 w-4" />
        {translate("resources.contacts.action.add")}
      </RouterLink>
    </Button>
  );
};

const DealsIterator = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { data: deals, error, isPending } = useListContext<Deal>();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  if (isPending || error) return null;
  return (
    <div>
      <div>
        {deals.map((deal) => (
          <div key={deal.id} className="p-0 text-sm">
            <RouterLink
              to={`/deals/${deal.id}/show`}
              className="flex items-center justify-between hover:bg-muted py-2 px-4 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{deal.name}</div>
                <div className="text-sm text-muted-foreground">
                  {findDealLabel(dealStages, deal.stage)},{" "}
                  {formatMoney(deal.amount, currency)}
                  {deal.category
                    ? `, ${dealCategories.find((c) => c.value === deal.category)?.label ?? deal.category}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  {translate("crm.common.last_activity_with_date", {
                    date: formatRelativeDate(deal.updated_at, locale),
                  })}{" "}
                </div>
              </div>
            </RouterLink>
          </div>
        ))}
      </div>
    </div>
  );
};
