import { useState } from "react";
import {
  useGetList,
  useGetMany,
  useLocaleState,
  useTranslate,
  type Identifier,
} from "ra-core";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import type { EmailMessage, EmailStatus, Sale } from "../types";
import { EmailMessageDialog } from "./EmailMessageDialog";
import { EmailStatusBadge } from "./EmailStatusBadge";

const ALL = "__all";
const PAGE_SIZE = 50;
const STATUSES: EmailStatus[] = [
  "pending",
  "processing",
  "accepted",
  "delivered",
  "bounced",
  "failed",
  "canceled",
  "simulated",
];

/**
 * Every message the CRM queued, newest first, with how its delivery went: the
 * place to find out why a customer did not receive something.
 *
 * Filtered by status on the server and by recipient or subject in the page
 * (over what is loaded). A row opens the message itself, where the provider's
 * events and the error are, and where a failed one is retried.
 */
export const EmailHistoryPanel = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const [status, setStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<Identifier | null>(null);

  const {
    data = [],
    total,
    error,
  } = useGetList<EmailMessage>("email_messages", {
    pagination: { page: 1, perPage },
    sort: { field: "created_at", order: "DESC" },
    filter: status === ALL ? {} : { "status@eq": status },
  });

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? data.filter(
        (message) =>
          message.to_email.toLowerCase().includes(needle) ||
          message.subject.toLowerCase().includes(needle),
      )
    : data;

  const senderIds = [
    ...new Set(
      rows
        .map((message) => message.sales_id)
        .filter((id): id is NonNullable<typeof id> => id != null),
    ),
  ];
  const { data: senders = [] } = useGetMany<Sale>("sales", { ids: senderIds });
  const senderOf = (id: EmailMessage["sales_id"]) => {
    const sale = senders.find((row) => String(row.id) === String(id));
    return sale
      ? `${sale.first_name} ${sale.last_name}`
      : translate("crm.email.history.automatic");
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={translate("crm.email.tabs.history")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-history-status">
              {translate("crm.email.history.status")}
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="email-history-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  {translate("crm.email.history.all_statuses")}
                </SelectItem>
                {STATUSES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {translate(`crm.email.status.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-history-search">
              {translate("crm.email.history.search")}
            </Label>
            <Input
              id="email-history-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={translate("crm.email.history.count", {
          shown: rows.length,
          total: total ?? rows.length,
        })}
        contentClassName="p-0"
      >
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {translate("crm.email.history.load_error")}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {translate("crm.email.history.empty")}
          </p>
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate("crm.email.history.date")}</TableHead>
                  <TableHead>{translate("crm.email.fields.to")}</TableHead>
                  <TableHead>{translate("crm.email.fields.subject")}</TableHead>
                  <TableHead>{translate("crm.email.history.status")}</TableHead>
                  <TableHead>{translate("crm.email.history.sender")}</TableHead>
                  <TableHead>
                    {translate("crm.email.history.problem")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((message) => (
                  <TableRow
                    key={message.id}
                    className="cursor-pointer"
                    onClick={() => setOpenId(message.id)}
                  >
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(message.created_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      {message.to_email}
                    </TableCell>
                    <TableCell className="max-w-72 truncate font-medium">
                      {/* A real button, so the row is reachable by keyboard. */}
                      <button
                        type="button"
                        className="cursor-pointer text-left hover:underline"
                        onClick={() => setOpenId(message.id)}
                      >
                        {message.subject}
                      </button>
                    </TableCell>
                    <TableCell>
                      <EmailStatusBadge status={message.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {senderOf(message.sales_id)}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                      {message.error_code
                        ? translate(
                            `crm.email.delivery_errors.${message.error_code}`,
                            { _: message.error_code },
                          )
                        : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(total ?? 0) > data.length ? (
          <div className="border-t p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPerPage((current) => current + PAGE_SIZE)}
            >
              {translate("crm.email.history.load_more")}
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <EmailMessageDialog messageId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};
