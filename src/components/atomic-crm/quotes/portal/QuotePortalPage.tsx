import { useTranslate } from "ra-core";
import {
  useCallback,
  useEffect,
  useMemo,
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
import "./quotePortal.css";
import { QuotePortalAcceptDialog } from "./QuotePortalAcceptDialog";
import { QuotePortalAnswerBar } from "./QuotePortalAnswerBar";
import {
  QuotePortalFloatingActions,
  QuotePortalMiniNav,
  QuotePortalProgress,
  QuotePortalTopbar,
} from "./QuotePortalChrome";
import { QuotePortalComments } from "./QuotePortalComments";
import { QuotePortalCursor } from "./QuotePortalCursor";
import { QuotePortalHero } from "./QuotePortalHero";
import { QuotePortalNotice } from "./QuotePortalNotice";
import {
  QuotePortalQuotationIntro,
  QuotePortalStageFade,
} from "./QuotePortalQuotationIntro";

import { QuotePortalCanvasSlide } from "./QuotePortalCanvasSlide";
import { QuotePortalSlide } from "./QuotePortalSlide";
import {
  DEFAULT_QUOTE_PRESENTATION,
  personalizePresentation,
  slideNumber,
  slideSectionId as standardSectionId,
  type QuotePortalCover,
} from "./quotePortalPresentation";
import { fillSlidePlaceholders } from "./portalSlides";
import { QuotePortalStamp } from "./QuotePortalStamp";
import { QuotePortalVersionPicker } from "./QuotePortalVersionPicker";
import { fx } from "./quotePortalFx";
import { QuotePortalRejectDialog } from "./QuotePortalRejectDialog";
import {
  portalErrorKeyOf,
  useQuotePortalClient,
  type QuotePortalComment,
  type QuotePortalErrorKey,
  type QuotePortalPayload,
} from "./quotePortalClient";
import { QUOTE_PORTAL_PATH, tokenFromHash } from "./quotePortalPaths";
import { portalSheetClass } from "./quotePortalSheet";
import { useQuotePortalDisplayFont } from "./useQuotePortalDisplayFont";
import { useQuotePortalKeyboard } from "./useQuotePortalKeyboard";
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

/**
 * The statuses a quotation has while the team prepares a new version of it:
 * `revise_quote()` puts it in `draft`, and a revision may go through approval
 * before it is sent. The customer still reads the last version they were sent.
 */
const REVISION_STATUSES = new Set(["draft", "pending_approval", "approved"]);

type Answer = "accepted" | "rejected";

/**
 * The page's sections, in reading order, then the quotation — always last,
 * because it is not a slide. What comes before it is what the version was
 * issued with (quote-portal-presentation.md §7):
 *
 * - `standard`: the default template, which IS the original designed
 *   presentation (`DEFAULT_QUOTE_PRESENTATION`: the cover, then its slides);
 * - `custom`: a template of the company's own free-form slides;
 * - `plain`: nothing active when it was issued — a plain cover.
 */
type Presentation = "standard" | "custom" | "plain";

const presentationOf = (payload: QuotePortalPayload): Presentation =>
  payload.standard_presentation
    ? "standard"
    : payload.slides.length > 0
      ? "custom"
      : "plain";

const STANDARD_SECTION_IDS =
  DEFAULT_QUOTE_PRESENTATION.slides.map(standardSectionId);
const COVER_ID = "quote-portal-cover";
const QUOTATION_ID = "quote-portal-quotation";
const slideSectionId = (index: number) => `quote-portal-slide-${index + 1}`;

/** "01", "02"…: the number the quotation's eyebrow carries after the slides. */
const sectionNumber = (count: number) => String(count).padStart(2, "0");

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
  // The version the customer chose in the selector; null follows the one on
  // offer, so a version issued while the page is open replaces it.
  const [chosenVersion, setChosenVersion] = useState<number | null>(null);
  const [switchingTo, setSwitchingTo] = useState<number | null>(null);
  const [switchError, setSwitchError] = useState<QuotePortalErrorKey | null>(
    null,
  );
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
  const presentation =
    current.status === "loaded" ? presentationOf(current.payload) : "plain";
  const slideCount =
    current.status === "loaded" ? current.payload.slides.length : 0;
  const sectionIds = useMemo(
    () =>
      presentation === "standard"
        ? [COVER_ID, ...STANDARD_SECTION_IDS, QUOTATION_ID]
        : presentation === "custom"
          ? [
              ...Array.from({ length: slideCount }, (_, index) =>
                slideSectionId(index),
              ),
              QUOTATION_ID,
            ]
          : [COVER_ID, QUOTATION_ID],
    [presentation, slideCount],
  );

  useQuotePortalDisplayFont();
  const scroll = useQuotePortalScroll(sectionIds, current.status === "loaded");
  useQuotePortalKeyboard({
    sectionIds,
    activeId: scroll.activeId,
    quotationId: QUOTATION_ID,
    isReady: current.status === "loaded",
  });
  const poll = useQuotePortalPoll({
    client,
    token: current.status === "loaded" ? token : null,
    versionNumber: chosenVersion,
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
  const currentVersion = payload.versions.find((version) => version.is_current);

  /**
   * Shows another version in place. The address does not change — the link is
   * the quotation's — and the page does not reload: the document below is
   * replaced when it arrives, and a failure leaves the one on screen.
   */
  const showVersion = async (versionNumber: number) => {
    const follows = currentVersion?.number === versionNumber;
    setSwitchingTo(versionNumber);
    setSwitchError(null);
    try {
      const next = await client.view(token, follows ? null : versionNumber);
      setChosenVersion(
        next.quote.is_superseded ? next.quote.version_number : null,
      );
      setState({
        key: current.key,
        status: "loaded",
        payload: next,
        answered: null,
      });
    } catch (error) {
      setSwitchError(portalErrorKeyOf(error));
    } finally {
      setSwitchingTo(null);
    }
  };
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
  const customerName =
    companyName ??
    translate("resources.quotes.portal.landing.company_fallback");
  // Written for THIS customer: `{company}` and friends filled from the
  // payload, recomputed with it.
  const values = {
    company: customerName,
    contact: data.parties.contact?.name ?? "",
    quote: data.quote.title ?? "",
    brand,
  };
  const deck = personalizePresentation(DEFAULT_QUOTE_PRESENTATION, values);
  const slides = fillSlidePlaceholders(payload.slides, values);
  const plainCover: QuotePortalCover = {
    navLabel: brand,
    eyebrow: brand,
    title: translate("resources.quotes.portal.landing.plain_cover_title", {
      company: customerName,
    }),
    titleAccent: null,
    body: translate("resources.quotes.portal.landing.plain_cover_body"),
    image: null,
  };
  // How many numbered slides come before the quotation (the cover has none).
  const numberedSlides =
    presentation === "standard"
      ? deck.slides.length
      : presentation === "custom"
        ? slideCount
        : 0;
  const slideLabel = (index: number) =>
    translate("resources.quotes.portal.landing.slide_label", {
      number: index + 1,
      total: slideCount,
    });
  const topId = sectionIds[0];

  return (
    <div className="quote-print-root min-h-screen bg-background">
      <QuotePortalProgress />
      <QuotePortalCursor />
      <QuotePortalTopbar
        isCompact={scroll.isScrolled}
        brand={brand}
        number={data.quote.number}
        version={
          <QuotePortalVersionPicker
            versions={payload.versions}
            shownNumber={payload.quote.version_number}
            isSwitching={switchingTo != null}
            onSelect={showVersion}
          />
        }
      />
      <QuotePortalMiniNav
        activeId={scroll.activeId}
        sections={[
          ...(presentation === "standard"
            ? [
                { id: COVER_ID, label: deck.cover.navLabel },
                ...deck.slides.map((slide, index) => ({
                  id: STANDARD_SECTION_IDS[index],
                  label: slide.navLabel,
                })),
              ]
            : presentation === "custom"
              ? slides.map((_, index) => ({
                  id: sectionIds[index],
                  label: slideLabel(index),
                }))
              : [{ id: COVER_ID, label: brand }]),
          {
            id: QUOTATION_ID,
            label: translate("resources.quotes.portal.landing.quote_heading"),
          },
        ]}
      />

      <main>
        {presentation === "standard" ? (
          <>
            <QuotePortalHero
              id={COVER_ID}
              cover={deck.cover}
              nextId={STANDARD_SECTION_IDS[0] ?? QUOTATION_ID}
              quoteId={QUOTATION_ID}
            />
            {deck.slides.map((slide, index) => (
              <QuotePortalSlide
                key={slide.key}
                id={STANDARD_SECTION_IDS[index]}
                slide={slide}
                number={slideNumber(index)}
              />
            ))}
          </>
        ) : presentation === "custom" ? (
          slides.map((slide, index) => (
            <QuotePortalCanvasSlide
              key={sectionIds[index]}
              id={sectionIds[index]}
              label={slideLabel(index)}
              slide={slide}
              nextId={sectionIds[index + 1] ?? QUOTATION_ID}
              quoteId={QUOTATION_ID}
            />
          ))
        ) : (
          // No slides: a plain cover naming the two parties.
          <QuotePortalHero
            id={COVER_ID}
            cover={plainCover}
            nextId={QUOTATION_ID}
            quoteId={QUOTATION_ID}
          />
        )}

        <QuotePortalStageFade />

        <section
          id={QUOTATION_ID}
          aria-labelledby={`${QUOTATION_ID}-title`}
          className="scroll-mt-4 pt-20 pb-24 min-[1000px]:pt-[110px] min-[1000px]:pb-[140px] print:py-0"
        >
          <div className="mx-auto flex w-[min(1280px,calc(100%-28px))] flex-col gap-7.5 min-[641px]:w-[min(1280px,calc(100%-40px))]">
            <QuotePortalQuotationIntro
              titleId={`${QUOTATION_ID}-title`}
              number={data.quote.number}
              eyebrow={`${
                numberedSlides > 0
                  ? `${sectionNumber(numberedSlides + 1)} · `
                  : ""
              }${translate("resources.quotes.portal.landing.quote_eyebrow")}`}
              heading={translate(
                "resources.quotes.portal.landing.quote_heading",
              )}
              intro={
                companyName
                  ? translate(
                      numberedSlides > 0
                        ? "resources.quotes.portal.landing.quote_intro_after_slides"
                        : "resources.quotes.portal.landing.quote_intro",
                      { company: companyName },
                    )
                  : translate(
                      "resources.quotes.portal.landing.quote_intro_anonymous",
                    )
              }
            />

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
                  olderVersion={
                    payload.quote.is_superseded && currentVersion
                      ? {
                          shown: payload.quote.version_number,
                          current: currentVersion.number,
                        }
                      : null
                  }
                  isBeingRevised={
                    !payload.quote.is_superseded &&
                    REVISION_STATUSES.has(payload.quote.status)
                  }
                  isUnanswerable={!isOpen && !isSettled}
                  ownerName={data.parties.owner_name}
                  onShowCurrent={() => {
                    if (currentVersion) void showVersion(currentVersion.number);
                  }}
                />
                {switchError ? (
                  <p
                    role="alert"
                    className="quote-print-hide rounded-xl border border-destructive/40 px-4 py-3 text-sm text-destructive"
                  >
                    {translate(`resources.quotes.portal.errors.${switchError}`)}
                  </p>
                ) : null}
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

                <div className="relative">
                  {fx(19) ? <QuotePortalStamp payload={payload} /> : null}
                  <QuoteDocument
                    data={data}
                    className={portalSheetClass()}
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
        topId={topId}
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
          settle(
            client.accept(token, payload.quote.version_number, acceptance),
            "accepted",
          )
        }
      />
      <QuotePortalRejectDialog
        open={dialog === "reject" && actions.can_reject}
        number={data.quote.number}
        onCancel={() => setDialog(null)}
        onSubmit={(rejection) =>
          settle(
            client.reject(token, payload.quote.version_number, rejection),
            "rejected",
          )
        }
      />
    </div>
  );
};

QuotePortalPage.path = QUOTE_PORTAL_PATH;
