import { useMutation } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
} from "ra-core";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { quoteErrorMessage } from "../providers/commons/quoteRpc";
import type { CrmDataProvider } from "../providers/types";
import type {
  QuoteAccessToken,
  QuoteLink,
  QuoteSummary,
  QuoteVersion,
} from "../types";
import { QuoteLinkDialog } from "./QuoteLinkDialog";
import { useQuoteDraft } from "./useQuoteDraft";

/** A quote has a handful of links, not a page of them (quotes §11). */
const LINKS_PAGE = { page: 1, perPage: 50 };

/**
 * The links this quotation has been shared through (quotes §6.2).
 *
 * Read from `quote_access_tokens_summary`, never from `quote_access_tokens`:
 * the table carries `token_hash` and has no select policy for anybody, which is
 * how the question "is exposing a hash safe?" was removed rather than answered.
 * Nothing here can reconstruct a link — the rows say WHO it was for, until
 * when, and whether the customer has opened it.
 *
 * "Generate a new link" rather than "copy link", and the panel says why: the
 * raw token existed once, at the moment it was minted. Older links keep working
 * until somebody revokes them, which is what makes per-recipient links coherent
 * rather than merely a limitation.
 */
export const QuoteLinksPanel = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { version } = useQuoteDraft(quote);
  const [link, setLink] = useState<QuoteLink | null>(null);

  const {
    data: tokens,
    error,
    isPending,
  } = useGetList<QuoteAccessToken>(
    "quote_access_tokens_summary",
    {
      filter: { quote_id: quote?.id },
      sort: { field: "created_at", order: "DESC" },
      pagination: LINKS_PAGE,
    },
    { enabled: quote?.id != null },
  );

  // The token carries the version's id; people know versions by number.
  // Printing the id said "version 0" for version 1 (and "version 4817" once a
  // database has been used for a while).
  const { data: versions } = useGetList<QuoteVersion>(
    "quote_versions",
    {
      filter: { quote_id: quote?.id },
      sort: { field: "version_number", order: "ASC" },
      pagination: LINKS_PAGE,
    },
    { enabled: quote?.id != null },
  );
  const versionNumberOf = (versionId: QuoteAccessToken["version_id"]) =>
    versions?.find((candidate) => String(candidate.id) === String(versionId))
      ?.version_number ?? "…";

  const onError = (failure: unknown) =>
    notify(quoteErrorMessage(failure), { type: "error" });

  const { mutate: mint, isPending: isMinting } = useMutation({
    mutationFn: () => dataProvider.createQuoteLink(quote!.id),
    onSuccess: (minted) => {
      setLink(minted);
      refresh();
    },
    onError,
  });

  const { mutate: revoke, isPending: isRevoking } = useMutation({
    mutationFn: (tokenId: QuoteAccessToken["id"]) =>
      dataProvider.revokeQuoteToken(tokenId),
    onSuccess: () => refresh(),
    onError,
  });

  if (!quote) return null;

  // Nothing has ever been issued, so there is nothing to share and no panel to
  // show. An empty box inviting a link for a first draft would be an invitation
  // the server refuses (`quote_not_issued`).
  //
  // Keyed on whether a document EXISTS, not on whether one is current: a
  // revision replaces the live version, and hiding the panel then would hide
  // the links it just revoked — which is precisely the moment somebody wants to
  // see that they stopped working.
  if ((quote.nb_issued_versions ?? 0) === 0) return null;

  // `create_quote_link()` refuses while a revision is open (`quote_draft_exists`):
  // `revise_quote()` revoked the links to the version it replaces so nobody
  // accepts it, and a fresh one would reopen that door. Not offered rather than
  // offered and refused.
  const hasOpenDraft = version != null && version.issued_at == null;
  const isMutating = isMinting || isRevoking;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {translate("resources.quotes.links.title")}
        </h3>
        {hasOpenDraft ? (
          <span className="text-xs text-muted-foreground">
            {translate("resources.quotes.links.revision_open")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isMutating}
            onClick={() => mint()}
          >
            {translate("resources.quotes.links.new")}
          </Button>
        )}
      </div>

      {error != null ? (
        <p className="text-sm text-destructive">
          {translate("resources.quotes.links.load_error")}
        </p>
      ) : isPending ? null : (tokens ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("resources.quotes.links.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {(tokens ?? []).map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center gap-2 border-t py-1"
            >
              <span className="font-medium">
                {token.label ||
                  translate("resources.quotes.links.unlabelled", {
                    version: versionNumberOf(token.version_id),
                  })}
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
              {/* What the customer actually did with it, which is the only
                  signal this module has before the portal exists. */}
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
      )}

      <QuoteLinkDialog link={link} onClose={() => setLink(null)} />
    </div>
  );
};
