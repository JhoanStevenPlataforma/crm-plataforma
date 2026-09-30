import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import { quoteErrorMessage } from "../providers/commons/quoteRpc";
import type { CrmDataProvider } from "../providers/types";
import type { QuoteAccessToken, QuoteSummary, QuoteVersion } from "../types";
import { QuoteShareLinkField } from "./QuoteShareLinkField";
import { useQuoteDraft } from "./useQuoteDraft";

/** A quote has a handful of links, not a page of them (quotes §11). */
const LINKS_PAGE = { page: 1, perPage: 50 };

/**
 * The customer link of this quotation (quotes §6.2, as revised 2026-09-29).
 *
 * ONE PERMANENT LINK per quotation, the same for every version: the customer
 * keeps it, and it opens the newest issued document with a selector for the
 * older ones. So the card on top is always the link to copy or open, whatever
 * version this page is showing, and it says which version the customer sees —
 * which is not the draft being worked on, until that draft is sent.
 *
 * A quotation issued before links were permanent, or whose link was revoked
 * (a link sent to the wrong person is killed that way), has none: the card
 * offers to create it. Reading never creates one.
 *
 * Below it, the other links this quotation was shared through — the
 * per-version links of before, and revoked ones — read from
 * `quote_access_tokens_summary`, which carries neither the hash nor a token.
 */
export const QuoteLinksPanel = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { version } = useQuoteDraft(quote);
  const hasIssued = (quote?.nb_issued_versions ?? 0) > 0;

  const {
    data: shareLink,
    error: linkError,
    isPending: isLinkPending,
  } = useQuery({
    queryKey: ["quotes", "shareLink", quote?.id],
    queryFn: () => dataProvider.getQuoteShareLink(quote!.id),
    enabled: quote?.id != null && hasIssued,
  });

  const { data: tokens, error: tokensError } = useGetList<QuoteAccessToken>(
    "quote_access_tokens_summary",
    {
      filter: { quote_id: quote?.id },
      sort: { field: "created_at", order: "DESC" },
      pagination: LINKS_PAGE,
    },
    { enabled: quote?.id != null && hasIssued },
  );

  // The token carries the version's id; people know versions by number.
  const { data: versions } = useGetList<QuoteVersion>(
    "quote_versions",
    {
      filter: { quote_id: quote?.id },
      sort: { field: "version_number", order: "ASC" },
      pagination: LINKS_PAGE,
    },
    { enabled: quote?.id != null && hasIssued },
  );
  const versionNumberOf = (versionId: QuoteAccessToken["version_id"]) =>
    versions?.find((candidate) => String(candidate.id) === String(versionId))
      ?.version_number ?? "…";

  const onError = (failure: unknown) =>
    notify(quoteErrorMessage(failure), { type: "error" });

  // `refresh()` invalidates every query, the link's included.
  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: () =>
      dataProvider.getQuoteShareLink(quote!.id, { create: true }),
    onSuccess: () => refresh(),
    onError,
  });

  const { mutate: revoke, isPending: isRevoking } = useMutation({
    mutationFn: (tokenId: QuoteAccessToken["id"]) =>
      dataProvider.revokeQuoteToken(tokenId),
    onSuccess: () => refresh(),
    onError,
  });

  // Nothing has ever been issued, so there is nothing to share: a link to a
  // first draft is one the server refuses (`quote_not_issued`).
  if (!quote || !hasIssued) return null;

  const isMutating = isCreating || isRevoking;
  const hasOpenDraft = version != null && version.issued_at == null;
  const permanentRow = (tokens ?? []).find((token) =>
    shareLink ? String(token.id) === String(shareLink.token_id) : false,
  );
  const others = (tokens ?? []).filter((token) => token !== permanentRow);

  return (
    <section className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="quote-share-link" className="text-sm font-medium">
          {translate("resources.quotes.links.title")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate("resources.quotes.links.permanent_hint")}
        </p>
      </div>

      {linkError != null ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.links.load_error")}
        </p>
      ) : isLinkPending ? (
        <Skeleton className="h-9 w-full" />
      ) : shareLink ? (
        <div className="flex flex-col gap-2">
          <QuoteShareLinkField id="quote-share-link" token={shareLink.token} />
          <p className="text-xs text-muted-foreground">
            {translate("resources.quotes.links.customer_sees", {
              version: shareLink.version_number,
            })}
            {hasOpenDraft
              ? ` ${translate("resources.quotes.links.draft_pending", {
                  version: version?.version_number,
                })}`
              : null}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {translate("resources.quotes.links.views", {
                count: permanentRow?.view_count ?? 0,
              })}
              {" · "}
              {translate("resources.quotes.link.open_counts")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={isMutating}
              title={translate("resources.quotes.links.revoke_hint")}
              onClick={() => revoke(shareLink.token_id)}
            >
              {translate("resources.quotes.links.revoke")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {translate("resources.quotes.links.none")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isMutating}
            onClick={() => create()}
          >
            {translate("resources.quotes.links.create")}
          </Button>
        </div>
      )}

      {tokensError != null ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.links.load_error")}
        </p>
      ) : others.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            {translate("resources.quotes.links.others")}
          </h4>
          <ul className="flex flex-col gap-1 text-sm">
            {others.map((token) => (
              <li
                key={token.id}
                className="flex flex-wrap items-center gap-2 border-t py-1"
              >
                <span className="font-medium">
                  {token.label ||
                    translate(
                      token.is_permanent
                        ? "resources.quotes.links.permanent"
                        : "resources.quotes.links.unlabelled",
                      { version: versionNumberOf(token.version_id) },
                    )}
                </span>
                <Badge variant="outline" className="font-normal">
                  {translate(
                    token.is_active
                      ? "resources.quotes.links.active"
                      : "resources.quotes.links.inactive",
                  )}
                </Badge>
                {token.expires_at ? (
                  <span className="text-muted-foreground">
                    {translate("resources.quotes.links.expires", {
                      date: new Date(token.expires_at).toLocaleDateString(),
                    })}
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {translate("resources.quotes.links.views", {
                    count: token.view_count ?? 0,
                  })}
                </span>
                {token.is_active ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7"
                    disabled={isMutating}
                    onClick={() => revoke(token.id)}
                  >
                    {translate("resources.quotes.links.revoke")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
