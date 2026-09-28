import { Handshake } from "lucide-react";
import { Link } from "react-router";
import {
  useCreatePath,
  useListContext,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { Card } from "@/components/ui/card";

import { Avatar as ContactAvatar } from "../contacts/Avatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { CompanyAvatar } from "./CompanyAvatar";
import { contactDisplayName } from "../contacts/contactName";

export const CompanyCard = (props: { record?: Company }) => {
  const createPath = useCreatePath();
  const record = useRecordContext<Company>(props);
  const translate = useTranslate();
  const { companySectors } = useConfigurationContext();
  if (!record) return null;

  const sector = companySectors.find((s) => s.value === record.sector);
  const sectorLabel = sector?.label;

  return (
    <Link
      to={createPath({
        resource: "companies",
        id: record.id,
        type: "show",
      })}
      className="block h-full no-underline"
    >
      {/* Lifts rather than greys on hover: the card is a door to the
          company, and the raise says so before the pointer settles. */}
      <Card className="group/company h-full gap-0 overflow-hidden py-0 transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised">
        <div className="flex flex-1 flex-col items-center gap-2 px-4 pt-6 pb-5 text-center">
          <CompanyAvatar />
          <div className="flex min-w-0 max-w-full flex-col gap-0.5">
            <h6 className="truncate text-sm font-semibold transition-colors group-hover/company:text-brand">
              {record.name}
            </h6>
            <p className="truncate text-xs text-muted-foreground">
              {sectorLabel ?? " "}
            </p>
          </div>
        </div>
        <div className="flex h-11 items-center justify-between gap-2 border-t border-border/70 bg-surface-muted/60 px-4">
          <div className="flex min-w-0 items-center">
            {record.nb_contacts ? (
              <ReferenceManyField reference="contacts" target="company_id">
                <AvatarGroupIterator />
              </ReferenceManyField>
            ) : null}
          </div>
          {record.nb_deals ? (
            <div
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
              title={translate("resources.deals.name", {
                smart_count: record.nb_deals ?? 0,
                _: "Deal |||| Deals",
              })}
            >
              <Handshake className="size-3.5" />
              <span className="font-semibold text-foreground tabular-nums">
                {record.nb_deals}
              </span>
              <span className="hidden xl:inline">
                {translate("resources.deals.name", {
                  smart_count: record.nb_deals ?? 0,
                  _: "Deal |||| Deals",
                })}
              </span>
            </div>
          ) : null}
        </div>
      </Card>
    </Link>
  );
};

const AvatarGroupIterator = () => {
  const { data, total, error, isPending } = useListContext();
  if (isPending || error) return null;

  const MAX_AVATARS = 3;
  return (
    <div className="*:data-[slot=avatar]:ring-background flex -space-x-0.5 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:grayscale-50">
      {data.slice(0, MAX_AVATARS).map((record: any) => (
        <ContactAvatar
          key={record.id}
          record={record}
          width={25}
          height={25}
          title={contactDisplayName(record)}
        />
      ))}
      {total > MAX_AVATARS && (
        <span
          className="relative flex size-8 shrink-0 overflow-hidden rounded-full w-[25px] h-[25px]"
          data-slot="avatar"
        >
          <span className="bg-muted flex size-full items-center justify-center rounded-full text-[10px]">
            +{total - MAX_AVATARS}
          </span>
        </span>
      )}
    </div>
  );
};
