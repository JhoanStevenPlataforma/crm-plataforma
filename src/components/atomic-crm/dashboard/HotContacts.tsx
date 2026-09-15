import { Plus } from "lucide-react";
import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Avatar } from "../contacts/Avatar";
import { SectionCard } from "../misc/SectionCard";
import { useTeamScopeFilter } from "../misc/useTeamScopeFilter";
import { SimpleList } from "../simple-list/SimpleList";
import type { Contact } from "../types";

export const HotContacts = () => {
  const { identity } = useGetIdentity();
  const teamScope = useTeamScopeFilter();
  const translate = useTranslate();

  const {
    data: contactData,
    total: contactTotal,
    isPending: contactsLoading,
  } = useGetList<Contact>(
    "contacts",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "last_seen", order: "DESC" },
      filter: { status: "hot", ...teamScope },
    },
    { enabled: Number.isInteger(identity?.id) },
  );

  return (
    <SectionCard
      title={translate("resources.contacts.hot.title")}
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/contacts/create">
                <Plus className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate("resources.contacts.action.create")}
          </TooltipContent>
        </Tooltip>
      }
      // The list reaches the card's edges; its rows carry their own padding.
      contentClassName="p-0"
    >
      <SimpleList<Contact>
        linkType="show"
        data={contactData}
        total={contactTotal}
        isPending={contactsLoading}
        resource="contacts"
        primaryText={(contact) => `${contact.first_name} ${contact.last_name}`}
        secondaryText={(contact) =>
          contact.title && contact.company_name
            ? translate("resources.contacts.position_at_company", {
                title: contact.title,
                company: contact.company_name,
              })
            : contact.title || contact.company_name
        }
        leftAvatar={(contact) => <Avatar record={contact} />}
        empty={
          <div className="flex flex-col gap-2 p-4">
            <p className="text-sm">
              {translate("resources.contacts.hot.empty_hint")}
            </p>
            <p className="text-sm text-muted-foreground">
              {translate("resources.contacts.hot.empty_change_status")}
            </p>
          </div>
        }
      />
    </SectionCard>
  );
};
