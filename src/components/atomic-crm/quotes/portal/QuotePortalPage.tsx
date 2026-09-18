import { useTranslate } from "ra-core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { formatMoneyExact } from "../../misc/reporting";
import {
  defaultLightModeLogo,
  defaultTitle,
} from "../../root/defaultConfiguration";
import { QuoteDocument } from "../QuoteDocument";
import { fromPortalPayload } from "../quoteDocumentData";
import "../quotePrint.css";
import { QuotePortalAcceptDialog } from "./QuotePortalAcceptDialog";
import { QuotePortalComments } from "./QuotePortalComments";
import { QuotePortalRejectDialog } from "./QuotePortalRejectDialog";
import {
  portalErrorKeyOf,
  useQuotePortalClient,
  type QuotePortalComment,
  type QuotePortalErrorKey,
  type QuotePortalPayload,
} from "./quotePortalClient";
import { QUOTE_PORTAL_PATH, tokenFromHash } from "./quotePortalPaths";

const IS_DEMO = import.meta.env.VITE_IS_DEMO === "true";

/**
 * The build's own letterhead, for an installation that never set one. Paper is
 * a light surface, so the light logo — the same choice the rep's print makes.
 */
const FALLBACK_BRANDING = {
  title: defaultTitle,
  logo_url: defaultLightModeLogo,
};

/** The failures a second attempt can cure. A dead link stays dead. */
const RETRYABLE = new Set<QuotePortalErrorKey>([
  "quote_portal_unavailable",
  "quote_portal_throttled",
]);

type Answer = "accepted" | "rejected";

type PortalState =
  | { key: string | null; status: "loading" }
  | {
      key: string;
      status: "loaded";
      payload: QuotePortalPayload;
      answered: Answer | null;
    }
  | { key: string; status: "failed"; error: QuotePortalErrorKey };

const PortalShell = ({ children }: { children: ReactNode }) => (
  <main className="quote-print-root mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-6">
    {children}
  </main>
);

/**
 * The quotation as a customer opens it from a link (quotes §6) —
 * `/quote#<token>`.
 *
 * A PAGE WITH NO CRM BEHIND IT. It is a `noLayout` route the auth provider lets
 * through without a session, and it reads nothing from the data provider or
 * the configuration context: the document, the branding and the currency all
 * arrive in the edge function's payload (F3). What it renders is
 * `QuoteDocument`, the component the rep's page and the print route render, fed
 * by `fromPortalPayload` — so the customer's copy and the rep's PDF cannot
 * differ.
 *
 * ONE OPEN, ONE VIEW. The server records a view for every load, and React's
 * StrictMode runs this effect twice on mount. The request is kept in a ref,
 * which survives that, so both runs wait on the same call: the rep's timeline
 * must not show a customer opening the quote twice in the same second.
 */
export const QuotePortalPage = () => {
  const translate = useTranslate();
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const client = useQuotePortalClient();

  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<"accept" | "reject" | null>(null);
  const [state, setState] = useState<PortalState>({
    key: null,
    status: "loading",
  });
  const request = useRef<{
    key: string;
    promise: Promise<QuotePortalPayload>;
  } | null>(null);

  const requestKey = token ? `${token}:${attempt}` : null;

  useEffect(() => {
    if (IS_DEMO || !token || !requestKey) return;
    if (request.current?.key !== requestKey) {
      request.current = { key: requestKey, promise: client.view(token) };
    }
    let isActive = true;
    request.current.promise.then(
      (payload) => {
        if (isActive) {
          setState({
            key: requestKey,
            status: "loaded",
            payload,
            answered: null,
          });
        }
      },
      (error: unknown) => {
        if (isActive) {
          setState({
            key: requestKey,
            status: "failed",
            error: portalErrorKeyOf(error),
          });
        }
      },
    );
    return () => {
      isActive = false;
    };
  }, [client, token, requestKey]);

  // A state left over from another link, or from the attempt before a retry,
  // is not this page's: it reads as loading until its own answer arrives.
  const current: PortalState =
    state.key === requestKey ? state : { key: requestKey, status: "loading" };
  const number =
    current.status === "loaded" ? current.payload.quote.number : null;

  // The name "Save as PDF" proposes. A customer's downloads folder should say
  // what the file is, not "Plataforma Software (3).pdf".
  useEffect(() => {
    if (!number) return;
    const previous = window.document.title;
    window.document.title = translate("resources.quotes.document.label", {
      number,
    });
    return () => {
      window.document.title = previous;
    };
  }, [number, translate]);

  if (IS_DEMO) {
    return (
      <PortalShell>
        <p role="status" className="text-sm text-muted-foreground">
          {translate("resources.quotes.portal.demo_unavailable")}
        </p>
      </PortalShell>
    );
  }

  if (!token) {
    return (
      <PortalShell>
        <p role="alert" className="text-sm text-destructive">
          {translate("resources.quotes.portal.errors.quote_link_invalid")}
        </p>
      </PortalShell>
    );
  }

  if (current.status === "loading") {
    return (
      <PortalShell>
        <p role="status" className="sr-only">
          {translate("resources.quotes.portal.loading")}
        </p>
        <Skeleton className="h-96 w-full rounded-xl" />
      </PortalShell>
    );
  }

  if (current.status === "failed") {
    return (
      <PortalShell>
        <p role="alert" className="text-sm text-destructive">
          {translate(`resources.quotes.portal.errors.${current.error}`)}
        </p>
        {RETRYABLE.has(current.error) ? (
          <div>
            <Button
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {translate("resources.quotes.portal.retry")}
            </Button>
          </div>
        ) : null}
      </PortalShell>
    );
  }

  const { payload, answered } = current;
  const data = fromPortalPayload(payload, FALLBACK_BRANDING);
  const isOpen = payload.actions.can_accept || payload.actions.can_reject;
  // These three already say so on the paper itself (`QuoteDocument`).
  const isSettled =
    payload.acceptance.accepted_at != null ||
    payload.acceptance.rejected_at != null ||
    payload.quote.is_superseded;

  /** The answer replaces the document: the server returns it as it now stands. */
  const settle = async (
    recorded: Promise<QuotePortalPayload>,
    outcome: Answer,
  ) => {
    const next = await recorded;
    setState({
      key: current.key,
      status: "loaded",
      payload: next,
      answered: outcome,
    });
    setDialog(null);
  };

  /** A comment answers with the document too: its thread now carries it. */
  const comment = async (message: QuotePortalComment) => {
    const next = await client.comment(token, message);
    setState({ key: current.key, status: "loaded", payload: next, answered });
  };

  return (
    <PortalShell>
      <div className="quote-print-hide flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          {translate("resources.quotes.portal.print")}
        </Button>
        {payload.actions.can_reject ? (
          <Button variant="outline" onClick={() => setDialog("reject")}>
            {translate("resources.quotes.portal.reject")}
          </Button>
        ) : null}
        {payload.actions.can_accept ? (
          <Button onClick={() => setDialog("accept")}>
            {translate("resources.quotes.portal.accept")}
          </Button>
        ) : null}
      </div>

      {answered ? (
        <p
          role="status"
          className="quote-print-hide rounded-md border border-success bg-success/10 px-3 py-2 text-sm"
        >
          {translate(
            answered === "accepted"
              ? "resources.quotes.portal.accepted_notice"
              : "resources.quotes.portal.rejected_notice",
          )}
        </p>
      ) : !isOpen && !isSettled ? (
        <p
          role="status"
          className="quote-print-hide rounded-md border px-3 py-2 text-sm text-muted-foreground"
        >
          {data.parties.owner_name
            ? translate("resources.quotes.portal.closed", {
                name: data.parties.owner_name,
              })
            : translate("resources.quotes.portal.closed_anonymous")}
        </p>
      ) : null}

      <QuoteDocument data={data} />

      <QuotePortalComments
        comments={payload.comments}
        canComment={payload.actions.can_comment}
        defaultName={data.parties.contact?.name ?? ""}
        defaultEmail={data.parties.contact?.email ?? ""}
        onSubmit={comment}
      />

      <QuotePortalAcceptDialog
        open={dialog === "accept"}
        number={data.quote.number}
        versionNumber={data.quote.version_number}
        total={formatMoneyExact(data.totals.total, data.quote.currency)}
        defaultName={data.parties.contact?.name ?? ""}
        defaultEmail={data.parties.contact?.email ?? ""}
        onCancel={() => setDialog(null)}
        onSubmit={(acceptance) =>
          settle(client.accept(token, acceptance), "accepted")
        }
      />
      <QuotePortalRejectDialog
        open={dialog === "reject"}
        number={data.quote.number}
        onCancel={() => setDialog(null)}
        onSubmit={(rejection) =>
          settle(client.reject(token, rejection), "rejected")
        }
      />
    </PortalShell>
  );
};

QuotePortalPage.path = QUOTE_PORTAL_PATH;
