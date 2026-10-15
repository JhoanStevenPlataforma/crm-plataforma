import { useState } from "react";
import {
  useCanAccess,
  useCreate,
  useDelete,
  useGetList,
  useLocaleState,
  useNotify,
  useTranslate,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionCard } from "../misc/SectionCard";
import { emailErrorMessage } from "../providers/commons/emailRpc";
import type { EmailSuppression } from "../types";

const LIST_PAGE = { page: 1, perPage: 500 };

/**
 * The addresses the CRM will not write to: one that bounced for good, one
 * whose owner reported a message as spam, one an administrator added.
 *
 * Managers read it -- it is what explains "this address is suppressed" to
 * their team. Only an administrator adds an address or takes one off, and
 * taking one off is a decision: the provider keeps its own list, and writing
 * to an address it considers dead costs sender reputation.
 */
export const EmailSuppressionsPanel = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const [locale = "en"] = useLocaleState();
  const [email, setEmail] = useState("");
  const [detail, setDetail] = useState("");
  const { canAccess: canChange } = useCanAccess({
    resource: "email_suppressions",
    action: "delete",
  });

  const {
    data = [],
    error,
    refetch,
  } = useGetList<EmailSuppression>("email_suppressions", {
    pagination: LIST_PAGE,
    sort: { field: "created_at", order: "DESC" },
  });
  const [create, { isPending: isAdding }] = useCreate<EmailSuppression>();
  const [remove, { isPending: isRemoving }] = useDelete<EmailSuppression>();

  const onError = (failure: unknown) =>
    notify(emailErrorMessage(failure), { type: "error" });

  const add = () =>
    create(
      "email_suppressions",
      {
        data: {
          email: email.trim().toLowerCase(),
          reason: "manual",
          detail: detail.trim() || null,
        },
      },
      {
        onSuccess: () => {
          notify("crm.email.suppressions.added");
          setEmail("");
          setDetail("");
          refetch();
        },
        onError,
      },
    );

  const takeOff = (suppression: EmailSuppression) =>
    remove(
      "email_suppressions",
      { id: suppression.id, previousData: suppression },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify("crm.email.suppressions.removed");
          refetch();
        },
        onError,
      },
    );

  return (
    <div className="flex flex-col gap-4">
      {canChange ? (
        <SectionCard
          title={translate("crm.email.suppressions.add_title")}
          subtitle={translate("crm.email.suppressions.add_help")}
        >
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-suppression-address">
                {translate("crm.email.suppressions.address")}
              </Label>
              <Input
                id="email-suppression-address"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email-suppression-detail">
                {translate("crm.email.suppressions.detail")}
              </Label>
              <Input
                id="email-suppression-detail"
                maxLength={500}
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
              />
            </div>
            <Button disabled={isAdding || email.trim() === ""} onClick={add}>
              {translate("crm.email.suppressions.add")}
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title={translate("crm.email.tabs.suppressions")}
        subtitle={translate("crm.email.suppressions.description")}
        contentClassName="p-0"
      >
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {translate("crm.email.suppressions.load_error")}
          </p>
        ) : data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {translate("crm.email.suppressions.empty")}
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {translate("crm.email.suppressions.address")}
                  </TableHead>
                  <TableHead>
                    {translate("crm.email.suppressions.reason")}
                  </TableHead>
                  <TableHead>
                    {translate("crm.email.suppressions.detail")}
                  </TableHead>
                  <TableHead>
                    {translate("crm.email.suppressions.since")}
                  </TableHead>
                  {canChange ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((suppression) => (
                  <TableRow key={suppression.email}>
                    <TableCell className="font-medium">
                      {suppression.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {translate(
                          `crm.email.suppressions.reasons.${suppression.reason}`,
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                      {suppression.detail}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(suppression.created_at).toLocaleDateString(
                        locale,
                        { dateStyle: "medium" },
                      )}
                    </TableCell>
                    {canChange ? (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRemoving}
                          onClick={() => takeOff(suppression)}
                        >
                          {translate("crm.email.suppressions.remove")}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
