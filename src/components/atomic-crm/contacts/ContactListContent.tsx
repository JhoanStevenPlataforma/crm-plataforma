import { difference, union } from "lodash";
import {
  type Identifier,
  RecordContextProvider,
  useListContext,
  useLocaleState,
  useTranslate,
} from "ra-core";
import { type MouseEvent, useCallback, useRef } from "react";
import { Link } from "react-router";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

import { Status } from "../misc/Status";
import { formatRelativeDate } from "../misc/RelativeDate";
import type { Contact } from "../types";
import { Avatar } from "./Avatar";
import { contactDisplayName } from "./contactName";
import { TagsList } from "./TagsList";

export const ContactListContent = () => {
  const translate = useTranslate();
  const {
    data: contacts,
    error,
    isPending,
    onToggleItem,
    onSelect,
    selectedIds,
  } = useListContext<Contact>();
  const lastSelected = useRef<Identifier | null>(null);

  // Handle shift+click to select a range of rows
  const handleToggleItem = useCallback(
    (id: Identifier, event: MouseEvent) => {
      if (!contacts) return;

      const ids = contacts.map((contact) => contact.id);
      const lastSelectedIndex = lastSelected.current
        ? ids.indexOf(lastSelected.current)
        : -1;

      if (event.shiftKey && lastSelectedIndex !== -1) {
        const index = ids.indexOf(id);
        const idsBetweenSelections = ids.slice(
          Math.min(lastSelectedIndex, index),
          Math.max(lastSelectedIndex, index) + 1,
        );

        const isClickedItemSelected = selectedIds?.includes(id);
        const newSelectedIds = isClickedItemSelected
          ? difference(selectedIds, idsBetweenSelections)
          : union(selectedIds, idsBetweenSelections);

        onSelect?.(newSelectedIds);
      } else {
        onToggleItem(id);
      }

      lastSelected.current = id;
    },
    [contacts, selectedIds, onSelect, onToggleItem],
  );

  if (isPending) {
    return <Skeleton className="w-full h-9" />;
  }

  if (error) {
    return null;
  }

  return (
    <div className="md:divide-y">
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <ContactItemContent
            contact={contact}
            handleToggleItem={handleToggleItem}
          />
        </RecordContextProvider>
      ))}

      {contacts.length === 0 && (
        <div className="p-4">
          <div className="text-muted-foreground">
            {translate("resources.contacts.empty.title", {})}
          </div>
        </div>
      )}
    </div>
  );
};

const ContactItemContent = ({
  contact,
  handleToggleItem,
}: {
  contact: Contact;
  handleToggleItem: (id: Identifier, event: MouseEvent) => void;
}) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { selectedIds } = useListContext<Contact>();
  const lastActivity = contact.last_seen
    ? formatRelativeDate(contact.last_seen, locale)
    : null;

  return (
    <div className="flex flex-row items-center pl-2 pr-4 py-2 hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl">
      <div
        className="px-4 py-3 flex items-center cursor-pointer"
        onClick={(e) => handleToggleItem(contact.id, e)}
      >
        <Checkbox
          className="cursor-pointer"
          checked={selectedIds.includes(contact.id)}
        />
      </div>
      <Link
        to={`/contacts/${contact.id}/show`}
        className="flex-1 min-w-0 grid grid-cols-[auto_1fr] @xl:grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 items-center"
      >
        <Avatar />
        <div className="flex-1 min-w-0">
          <div className="font-medium">{contactDisplayName(contact)}</div>
          {contact.title || contact.company_id != null || contact.nb_tasks ? (
            <div className="text-sm text-muted-foreground">
              {contact.title && contact.company_id != null
                ? `${translate("resources.contacts.position_at", {
                    title: contact.title,
                  })} `
                : contact.title}
              {contact.company_id != null && (
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                >
                  <TextField source="name" />
                </ReferenceField>
              )}
              {contact.nb_tasks
                ? ` - ${translate("crm.common.task_count", {
                    smart_count: contact.nb_tasks,
                  })}`
                : ""}
              &nbsp;&nbsp;
              <TagsList />
            </div>
          ) : null}
        </div>
        {contact.last_seen && (
          // Narrow list: under the name, rather than squeezing it to a word
          // per line. Wide list: its own column on the right.
          <div className="col-start-2 @xl:col-start-3 @xl:text-right @xl:ml-4">
            <div
              className="text-sm text-muted-foreground"
              title={contact.last_seen}
            >
              {translate("crm.common.last_activity_with_date", {
                date: lastActivity,
              })}{" "}
              <Status status={contact.status} />
            </div>
          </div>
        )}
      </Link>
    </div>
  );
};
