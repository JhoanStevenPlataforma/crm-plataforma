import {
  InfiniteListBase,
  RecordRepresentation,
  ShowBase,
  useShowContext,
  useTranslate,
} from "ra-core";
import type { ShowBaseProps } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { NoteCreate, NotesIterator } from "../notes";
import type { Contact } from "../types";
import { Avatar } from "./Avatar";
import { ContactAside } from "./ContactAside";
import { RecordBreadcrumb } from "../misc/RecordBreadcrumb";

export const ContactShow = (props: ShowBaseProps = {}) => (
  <ShowBase {...props}>
    <ContactShowContent />
  </ShowBase>
);

const ContactShowContent = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Contact>();
  if (isPending || !record) return null;

  return (
    // On a phone the aside (edit, status, email, phone, tasks) comes first:
    // after an infinite list of notes nobody would ever reach it. From `lg` up
    // it is the right-hand column, as it always was.
    <div className="mt-2 mb-2 flex flex-col gap-6 lg:flex-row lg:gap-8">
      <RecordBreadcrumb resource="contacts" />
      <ContactAside />
      <div className="min-w-0 flex-1 lg:order-first">
        <Card>
          <CardContent>
            <div className="-mx-6 mb-2 flex items-center border-b px-6 pb-5">
              <Avatar />
              <div className="ml-3 flex-1">
                <h1 className="text-2xl leading-tight font-semibold tracking-tight">
                  <RecordRepresentation />
                </h1>
                <div className="inline-flex flex-wrap text-sm text-muted-foreground">
                  {record.title && record.company_id != null
                    ? `${translate("resources.contacts.position_at", {
                        title: record.title,
                      })} `
                    : record.title}
                  {record.company_id != null && (
                    <ReferenceField
                      source="company_id"
                      reference="companies"
                      link="show"
                    >
                      &nbsp;
                      <TextField source="name" />
                    </ReferenceField>
                  )}
                </div>
              </div>
              <div>
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link="show"
                  className="no-underline"
                >
                  <CompanyAvatar />
                </ReferenceField>
              </div>
            </div>
            <InfiniteListBase
              resource="contact_notes"
              filter={{ contact_id: record.id }}
              sort={{ field: "date", order: "DESC" }}
              perPage={25}
              disableSyncWithLocation
              storeKey={false}
              empty={
                <NoteCreate reference="contacts" showStatus className="mt-4" />
              }
            >
              <NotesIterator reference="contacts" showStatus />
            </InfiniteListBase>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
