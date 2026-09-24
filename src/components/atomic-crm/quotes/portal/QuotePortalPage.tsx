import { useTranslate } from "ra-core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatMoneyExact } from "../../misc/reporting";
import {
  defaultLightModeLogo,
  defaultTitle,
} from "../../root/defaultConfiguration";
import { QuoteDocument } from "../QuoteDocument";
import { fromPortalPayload } from "../quoteDocumentData";
import "../quotePrint.css";
import { QuotePortalAcceptDialog } from "./QuotePortalAcceptDialog";
import { QuotePortalAnswerBar } from "./QuotePortalAnswerBar";
import {
  QuotePortalFloatingActions,
  QuotePortalMiniNav,
  QuotePortalProgress,
  QuotePortalTopbar,
} from "./QuotePortalChrome";
import { QuotePortalComments } from "./QuotePortalComments";
import { QuotePortalHero } from "./QuotePortalHero";
import { QuotePortalNotice } from "./QuotePortalNotice";
import { QuotePortalReveal } from "./QuotePortalReveal";
import { QuotePortalSlide } from "./QuotePortalSlide";
import { QuotePortalRejectDialog } from "./QuotePortalRejectDialog";
import {
  portalErrorKeyOf,
  useQuotePortalClient,
  type QuotePortalComment,
  type QuotePortalErrorKey,
  type QuotePortalPayload,
} from "./quotePortalClient";
import { QUOTE_PORTAL_PATH, tokenFromHash } from "./quotePortalPaths";
import {
  DEFAULT_QUOTE_PRESENTATION,
  personalizePresentation,
  slideNumber,
  slideSectionId,
} from "./quotePortalPresentation";
import { useQuotePortalPoll } from "./useQuotePortalPoll";
import { useQuotePortalScroll } from "./useQuotePortalScroll";

const IS_DEMO = import.meta.env.VITE_IS_DEMO === "true";

/**
 * The build's own letterhead, for an installation that never set one. Paper is
 * a light surface, so the light logo — the same choice the rep's print makes.
 */
const FALLBACK_BRANDING = {
  title: defaultTitle,
  logo_url: defaultLightModeLogo,
};

/** What a link that stopped working still offers: nothing to answer or say. */
const DEAD_LINK_ACTIONS: QuotePortalPayload["actions"] = {
  can_accept: false,
  can_reject: false,
  can_comment: false,
};

/** The failures a second attempt can cure. A dead link stays dead. */
const RETRYABLE = new Set<QuotePortalErrorKey>([
  "quote_portal_unavailable",
  "quote_portal_throttled",
]);

type Answer = "accepted" | "rejected";

/**
 * The page's sections, in reading order: the cover, the presentation's slides,
 * then the quotation. The deck is the installation's static one until the
 * per-company editor stores it (`quotePortalPresentation.ts`).
 */
const PRESENTATION = DEFAULT_QUOTE_PRESENTATION;
const COVER_ID = "quote-portal-cover";
const QUOTATION_ID = "quote-portal-quotation";
const SLIDE_IDS = PRESENTATION.slides.map(slideSectionId);
const SECTION_IDS = [COVER_ID, ...SLIDE_IDS, QUOTATION_ID];

/**
 * The sheet as the portal presents it: a larger card, the total set apart.
 * Classes on the shared `QuoteDocument`, never a copy of it — the customer's
 * copy and the rep's PDF must stay one document.
 */
const PORTAL_SHEET_CLASS =
  "gap-8 rounded-3xl p-6 shadow-2xl shadow-foreground/5 sm:p-10 [&>header]:-mx-6 [&>header]:border-b [&>header]:px-6 [&>header]:pb-8 sm:[&>header]:-mx-10 sm:[&>header]:px-10 print:shadow-none print:[&>header]:mx-0 print:[&>header]:px-0 [&>h3]:rounded-2xl [&>h3]:border [&>h3]:border-brand/25 [&>h3]:bg-brand-tint [&>h3]:px-5 [&>h3]:py-4 [&>h3]:text-sm [&>h3]:text-brand-strong [&_.quote-total]:mt-3 [&_.quote-total]:rounded-xl [&_.quote-total]:border-0 [&_.quote-total]:bg-brand-tint [&_.quote-total]:p-4 [&_.quote-total]:text-lg [&_.quote-total]:font-extrabold [&_dl]:max-w-sm [&_table]:text-[13px] [&_td]:py-4 [&_th]:py-3";

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
 *
 * KEPT CURRENT WHILE OPEN (§6.5). `useQuotePortalPoll` asks every ten seconds
 * whether the document changed, and opens it again only when it did — so the
 * team's answer, a revision or a withdrawal reaches a page nobody reloads. The
 * page has no socket: Realtime honours row level security, and no policy
 * grants `anon`.
 *
 * A PROPOSAL, NOT A FORM. The quotation is presented the way a sales deck is:
 * a cover naming both parties, then the document with the conversation beside
 * it. Everything around the document is `quote-print-hide`, so "Print / PDF"
 * still produces the sheet and nothing else.
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

  // A document opened again replaces the one on screen. An answer given in
  // this tab stays said, and the customer's unsent words live in the
  // composer's own state, which a new payload does not reset.
  const onRefreshed = useCallback(
    (payload: QuotePortalPayload) =>
      setState((previous) =>
        previous.status === "loaded" ? { ...previous, payload } : previous,
      ),
    [],
  );
  const scroll = useQuotePortalScroll(SECTION_IDS, current.status === "loaded");
  const poll = useQuotePortalPoll({
    client,
    token: current.status === "loaded" ? token : null,
    etag: current.status === "loaded" ? current.payload.etag : null,
    onRefreshed,
  });

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
  const actions = poll.isLinkClosed ? DEAD_LINK_ACTIONS : payload.actions;
  const isOpen = actions.can_accept || actions.can_reject;
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

  const brand = data.branding.title;
  const companyName = data.parties.company?.name ?? null;
  const hasThread = actions.can_comment || payload.comments.length > 0;
  const hasSlides = PRESENTATION.slides.length > 0;
  // The deck as written for THIS customer (the company, the addressee, the
  // quotation's own title), recomputed with the payload it reads from.
  const deck = personalizePresentation(PRESENTATION, {
    company:
      companyName ??
      translate("resources.quotes.portal.landing.company_fallback"),
    contact: data.parties.contact?.name ?? "",
    quote: data.quote.title ?? "",
    brand,
  });

  return (
    <div className="quote-print-root min-h-screen bg-background">
      <QuotePortalProgress />
      <QuotePortalTopbar
        brand={brand}
        number={data.quote.number}
        versionNumber={data.quote.version_number}
      />
      <QuotePortalMiniNav
        activeId={scroll.activeId}
        sections={[
          { id: COVER_ID, label: deck.cover.navLabel },
          ...deck.slides.map((slide, index) => ({
            id: SLIDE_IDS[index],
            label: slide.navLabel,
          })),
          {
            id: QUOTATION_ID,
            label: translate("resources.quotes.portal.landing.quote_heading"),
          },
        ]}
      />

      <main>
        <QuotePortalHero
          id={COVER_ID}
          cover={deck.cover}
          nextId={SLIDE_IDS[0] ?? QUOTATION_ID}
          quoteId={QUOTATION_ID}
        />

        {deck.slides.map((slide, index) => (
          <QuotePortalSlide
            key={slide.key}
            id={SLIDE_IDS[index]}
            slide={slide}
            number={slideNumber(index)}
          />
        ))}

        <section
          id={QUOTATION_ID}
          aria-labelledby={`${QUOTATION_ID}-title`}
          className="scroll-mt-4 pt-20 pb-24 min-[1000px]:pt-[110px] min-[1000px]:pb-[140px] print:py-0"
        >
          <div className="mx-auto flex w-[min(1280px,calc(100%-28px))] flex-col gap-7.5 min-[641px]:w-[min(1280px,calc(100%-40px))]">
            <QuotePortalReveal className="quote-print-hide">
              <p className="mb-4.5 text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
                {hasSlides
                  ? `${slideNumber(PRESENTATION.slides.length)} · `
                  : null}
                {translate("resources.quotes.portal.landing.quote_eyebrow")}
              </p>
              <h2
                id={`${QUOTATION_ID}-title`}
                className="mb-2.5 text-[clamp(2.375rem,5vw,3.875rem)] leading-none font-bold tracking-[-0.05em]"
              >
                {translate("resources.quotes.portal.landing.quote_heading")}
              </h2>
              <p className="max-w-[650px] leading-relaxed text-muted-foreground">
                {companyName
                  ? translate(
                      hasSlides
                        ? "resources.quotes.portal.landing.quote_intro_after_slides"
                        : "resources.quotes.portal.landing.quote_intro",
                      { company: companyName },
                    )
                  : translate(
                      "resources.quotes.portal.landing.quote_intro_anonymous",
                    )}
              </p>
            </QuotePortalReveal>

            <div
              className={cn(
                "grid items-start gap-7",
                hasThread && "min-[1000px]:grid-cols-[minmax(0,1fr)_330px]",
              )}
            >
              <div className="flex min-w-0 flex-col gap-4">
                <QuotePortalNotice
                  isLinkClosed={poll.isLinkClosed}
                  answered={answered}
                  isUnanswerable={!isOpen && !isSettled}
                  ownerName={data.parties.owner_name}
                />
                {poll.isFailing && !poll.isLinkClosed ? (
                  <div
                    role="status"
                    className="quote-print-hide flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground"
                  >
                    <span>
                      {translate("resources.quotes.portal.live.check_failed")}
                    </span>
                    <Button size="sm" variant="outline" onClick={poll.checkNow}>
                      {translate("resources.quotes.portal.live.check_now")}
                    </Button>
                  </div>
                ) : null}

                <QuoteDocument
                  data={data}
                  className={PORTAL_SHEET_CLASS}
                  footer={
                    <QuotePortalAnswerBar
                      canAccept={actions.can_accept}
                      canReject={actions.can_reject}
                      onAccept={() => setDialog("accept")}
                      onReject={() => setDialog("reject")}
                    />
                  }
                />
              </div>

              {hasThread ? (
                <aside className="min-[1000px]:sticky min-[1000px]:top-[92px]">
                  <QuotePortalComments
                    comments={payload.comments}
                    canComment={actions.can_comment}
                    defaultName={data.parties.contact?.name ?? ""}
                    defaultEmail={data.parties.contact?.email ?? ""}
                    onSubmit={comment}
                  />
                </aside>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <QuotePortalFloatingActions
        topId={COVER_ID}
        quoteId={QUOTATION_ID}
        isPastFold={scroll.isPastFold}
        isReadingQuote={scroll.activeId === QUOTATION_ID}
      />

      <QuotePortalAcceptDialog
        // An offer withdrawn while the dialog was open closes it.
        open={dialog === "accept" && actions.can_accept}
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
        open={dialog === "reject" && actions.can_reject}
        number={data.quote.number}
        onCancel={() => setDialog(null)}
        onSubmit={(rejection) =>
          settle(client.reject(token, rejection), "rejected")
        }
      />
    </div>
  );
};

QuotePortalPage.path = QUOTE_PORTAL_PATH;
