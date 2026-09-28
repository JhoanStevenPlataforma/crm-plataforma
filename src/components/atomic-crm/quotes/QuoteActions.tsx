import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetIdentity,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
} from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import { quoteErrorMessage } from "../providers/commons/quoteRpc";
import type {
  CrmRole,
  QuoteLink,
  QuoteStatusKey,
  QuoteSummary,
  QuoteTransition,
} from "../types";
import { QuoteIssueDialog, type IssueQuoteInput } from "./QuoteIssueDialog";
import { QuoteLinkDialog } from "./QuoteLinkDialog";
import { QuoteReasonDialog } from "./QuoteReasonDialog";
import { QuoteStatusBadge } from "./QuoteStatusBadge";
import { useQuoteDraft } from "./useQuoteDraft";

/** The status machine is eleven rows and thirty-odd edges (quotes §11). */
const MACHINE_PAGE = { page: 1, perPage: 200 };

/**
 * What a move is, once the toolbar has read the graph.
 *
 * `issue` and `revise` are not transitions a client may make: both are RPCs
 * that do several things in one transaction — freeze a version and mint a
 * token, or clone a document and revoke its links. They appear in
 * `quote_transitions` all the same, because the STATUS part of what they do
 * still has to be legal, and that is what makes them visible here.
 */
type MoveKind = "issue" | "revise" | "transition";

const kindOf = (edge: QuoteTransition, hasOpenDraft: boolean): MoveKind => {
  if (edge.to_status_key === "sent") return "issue";
  // The database's own test, not a status list: `revise_quote()` refuses when a
  // draft is already open (`quote_draft_exists`), which is exactly the case
  // where `-> draft` means "send this back for edits" instead of "open a new
  // version of the document the customer has".
  if (edge.to_status_key === "draft" && !hasOpenDraft) return "revise";
  return "transition";
};

/**
 * The moves a quotation offers, read off the status machine rather than written
 * out here (quotes §3).
 *
 * The graph is DATA — `quote_transitions` — for the two reasons
 * `deal_stage_requirements` gives: a graph that needs a migration to change is
 * one nobody tunes, and a list of literal status names is wrong for the first
 * customer who renames one. A toolbar with the buttons hardcoded would be a
 * third copy of the graph, and the one nobody updates.
 *
 * Only `allowed_actor = 'internal'` edges are offered. `viewed`, `accepted` and
 * `rejected` belong to the customer on the portal and `expired` to the sweeper;
 * rendering a button for them would be offering to forge the customer's answer,
 * and the database refuses it anyway (`quote_transition_actor_not_allowed`).
 */
export const QuoteActions = () => {
  const quote = useRecordContext<QuoteSummary>();
  const translate = useTranslate();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { identity } = useGetIdentity();
  const { version, lines, isPending: isDraftPending } = useQuoteDraft(quote);

  const [pendingMove, setPendingMove] = useState<QuoteTransition | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [link, setLink] = useState<QuoteLink | null>(null);

  const { data: transitions } = useGetList<QuoteTransition>(
    "quote_transitions",
    { sort: { field: "id", order: "ASC" }, pagination: MACHINE_PAGE },
  );

  // Read only while the issue dialog is open. The gate is a five-table question
  // and the answer is only ever acted on here; asking it on every editor render
  // would be a request per keystroke on the lines below.
  const { data: gate, isPending: isGatePending } = useQuery({
    queryKey: ["quotes", "discountGate", quote?.id],
    queryFn: () => dataProvider.getQuoteDiscountGate(quote!.id),
    enabled: isIssuing && quote?.id != null,
  });

  const onError = (error: unknown) =>
    notify(quoteErrorMessage(error), { type: "error" });

  const onMoved = () => {
    setPendingMove(null);
    setIsIssuing(false);
    refresh();
  };

  const { mutate: transition, isPending: isTransitioning } = useMutation({
    mutationFn: ({
      toStatus,
      reason,
    }: {
      toStatus: QuoteStatusKey;
      /** The button's wording, echoed in the confirmation. */
      label: string;
      reason?: string;
    }) => dataProvider.transitionQuote(quote!.id, toStatus, { reason }),
    // A one-click move (Negotiate) otherwise changed only the badge, which
    // the audit found people did not notice.
    onSuccess: (_data, { label }) => {
      notify("resources.quotes.actions.moved", {
        type: "success",
        messageArgs: { action: label },
      });
      onMoved();
    },
    onError,
  });

  const { mutate: revise, isPending: isRevising } = useMutation({
    mutationFn: (reason: string) => dataProvider.reviseQuote(quote!.id, reason),
    onSuccess: onMoved,
    onError,
  });

  const { mutate: issue, isPending: isIssuePending } = useMutation({
    mutationFn: (input: IssueQuoteInput) =>
      dataProvider.issueQuoteVersion(quote!.id, {
        tokenDays: input.tokenDays,
        tokenLabel: input.tokenLabel,
        reason: input.reason,
        overrideReason: input.overrideReason,
      }),
    // The token is in this response and nowhere else, so it is put in front of
    // the user before anything else happens.
    onSuccess: (minted) => {
      setLink(minted);
      onMoved();
    },
    onError,
  });

  if (!quote) return null;

  const hasOpenDraft = version != null && version.issued_at == null;
  // Said on the button rather than by the server after the dialog: an empty
  // document is refused anyway (`quote_empty`), so the click led nowhere.
  const needsLines = hasOpenDraft && !isDraftPending && lines.length === 0;
  const isPending = isTransitioning || isRevising || isIssuePending;

  const moves = (transitions ?? []).filter(
    (edge) =>
      edge.from_status_key === quote.status_key &&
      edge.allowed_actor === "internal",
  );

  /**
   * The button's wording.
   *
   * Translated by key where the module knows the status, exactly as
   * `QuoteStatusBadge` does with colours; a status an installation ADDED falls
   * through to the label the database carries, which is the only thing anybody
   * here can know about it.
   */
  const labelOf = (edge: QuoteTransition, kind: MoveKind) => {
    const key =
      kind === "transition"
        ? `resources.quotes.transitions.${edge.to_status_key}`
        : `resources.quotes.transitions.${kind}`;
    const translated = translate(key, { _: "" });
    return translated || edge.label || edge.to_status_key;
  };

  const start = (edge: QuoteTransition, kind: MoveKind) => {
    if (kind === "issue") {
      setIsIssuing(true);
      return;
    }
    // A move that needs a reason asks for it; one that does not is a click.
    // Which is which comes from the row, never from this file.
    if (kind === "revise" || edge.requires_reason) {
      setPendingMove(edge);
      return;
    }
    transition({ toStatus: edge.to_status_key, label: labelOf(edge, kind) });
  };

  const pendingKind =
    pendingMove == null ? null : kindOf(pendingMove, hasOpenDraft);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuoteStatusBadge
        statusKey={quote.status_key}
        label={quote.status_label}
      />

      {moves.map((edge) => {
        const kind = kindOf(edge, hasOpenDraft);
        return (
          <Button
            key={edge.id}
            type="button"
            size="sm"
            variant={kind === "issue" ? "default" : "outline"}
            disabled={isPending || (kind === "issue" && needsLines)}
            aria-describedby={
              kind === "issue" && needsLines ? "quote-needs-lines" : undefined
            }
            onClick={() => start(edge, kind)}
          >
            {labelOf(edge, kind)}
          </Button>
        );
      })}

      {needsLines &&
      moves.some((edge) => kindOf(edge, hasOpenDraft) === "issue") ? (
        <span id="quote-needs-lines" className="text-sm text-muted-foreground">
          {translate("resources.quotes.actions.needs_lines")}
        </span>
      ) : null}

      {moves.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          {translate("resources.quotes.actions.terminal")}
        </span>
      ) : null}

      <QuoteReasonDialog
        open={pendingMove != null}
        title={
          pendingMove == null || pendingKind == null
            ? ""
            : labelOf(pendingMove, pendingKind)
        }
        description={translate(
          pendingKind === "revise"
            ? "resources.quotes.dialog.revise_description"
            : "resources.quotes.dialog.transition_description",
          { number: quote.quote_number },
        )}
        isPending={isPending}
        onConfirm={(reason) => {
          if (pendingMove == null) return;
          if (pendingKind === "revise") {
            revise(reason);
            return;
          }
          transition({
            toStatus: pendingMove.to_status_key,
            label: labelOf(pendingMove, pendingKind ?? "transition"),
            reason,
          });
        }}
        onCancel={() => setPendingMove(null)}
      />

      <QuoteIssueDialog
        open={isIssuing}
        quoteNumber={quote.quote_number}
        versionNumber={version?.version_number}
        validUntil={version?.valid_until}
        gate={gate}
        isGatePending={isGatePending}
        canOverride={(identity?.role as CrmRole | undefined) === "admin"}
        isPending={isPending}
        onConfirm={(input) => issue(input)}
        onCancel={() => setIsIssuing(false)}
      />

      <QuoteLinkDialog link={link} onClose={() => setLink(null)} />
    </div>
  );
};
