/**
 * What the promotional film draws over the CRM, on top of the manual's own
 * overlay (`../overlay.ts`, which keeps the pointer, the ring and the zoom):
 * the full-screen slates, the short headline of each shot and the cover that
 * hides a screen while it loads.
 *
 * It runs INSIDE the page (through `addInitScript`), so it must be
 * self-contained: no imports, no closure over anything in this file.
 *
 * The cover's state lives in `sessionStorage`, because the customer's page is
 * another document: a cover that was up before the navigation has to be up
 * on the first paint after it, or the film shows a page loading.
 */
export const installPromoOverlay = (): void => {
  const INK = "#0b1020";
  const AMBER = "#f5a524";
  const COVER_FLAG = "promo-cover";

  const mount = () => {
    if (document.getElementById("promo-overlay")) return;

    const style = document.createElement("style");
    style.textContent = `
      #promo-overlay, #promo-overlay * { box-sizing: border-box; }
      #promo-overlay {
        position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
        font-family: Inter, "Segoe UI", system-ui, sans-serif; color: #fff;
      }
      html.promo-covered #tutorial-pointer, html.promo-covered #tutorial-ring { display: none; }

      #promo-headline {
        position: absolute; left: 56px; bottom: 52px; max-width: 72%;
        background: ${INK}; border-left: 8px solid ${AMBER}; border-radius: 16px;
        padding: 16px 28px; font-size: 36px; line-height: 1.15; font-weight: 700;
        letter-spacing: -.01em; box-shadow: 0 18px 60px rgba(0,0,0,.45);
        opacity: 0; transform: translateY(26px);
        transition: opacity 260ms ease, transform 320ms cubic-bezier(.22,.8,.3,1);
      }
      #promo-headline.is-on { opacity: 1; transform: none; }
      #promo-headline.is-top { bottom: auto; top: 52px; }

      #promo-cover {
        position: absolute; inset: 0; display: flex; align-items: center;
        padding: 0 10%; opacity: 0; transition: opacity 240ms ease;
        background: radial-gradient(1400px 800px at 85% 10%, rgba(245,165,36,.20), transparent 60%), ${INK};
      }
      #promo-cover.is-on { opacity: 1; }
      #promo-cover.is-instant { transition: none; }
      #promo-cover .kicker {
        font-size: 20px; letter-spacing: .18em; text-transform: uppercase;
        color: ${AMBER}; font-weight: 600; margin-bottom: 22px;
      }
      #promo-cover .line { font-size: 70px; line-height: 1.06; font-weight: 800; letter-spacing: -.02em; max-width: 20ch; }
      #promo-cover.is-on .rise { animation: promo-rise 520ms cubic-bezier(.22,.8,.3,1) both; }

      #promo-slate {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        justify-content: center; padding: 0 11%; opacity: 0;
        transition: opacity 300ms ease;
        background: radial-gradient(1400px 800px at 85% 10%, rgba(245,165,36,.22), transparent 60%), ${INK};
      }
      #promo-slate.is-on { opacity: 1; }
      #promo-slate.is-instant { transition: none; }
      #promo-slate .kicker {
        font-size: 21px; letter-spacing: .18em; text-transform: uppercase;
        color: ${AMBER}; font-weight: 600; margin-bottom: 26px;
      }
      #promo-slate h1 { margin: 0; font-size: 86px; line-height: 1.03; font-weight: 800; letter-spacing: -.025em; max-width: 17ch; }
      #promo-slate h2 { margin: 0; font-size: 56px; line-height: 1.1; font-weight: 750; letter-spacing: -.02em; max-width: 24ch; }
      #promo-slate p { margin: 24px 0 0; font-size: 30px; line-height: 1.35; color: rgba(255,255,255,.78); max-width: 34ch; }
      #promo-slate .rule { width: 96px; height: 7px; border-radius: 999px; background: ${AMBER}; margin: 34px 0 0; }
      #promo-slate .amber { color: ${AMBER}; }
      #promo-slate .rise { animation: promo-rise 620ms cubic-bezier(.22,.8,.3,1) both; animation-delay: var(--at, 0ms); }
      #promo-slate .fade { animation: promo-fade 500ms ease both; animation-delay: var(--at, 0ms); }

      /* Scene 1: the places a sale is scattered across, drifting apart. */
      #promo-slate .chips { position: absolute; inset: 0; }
      #promo-slate .chip {
        position: absolute; left: var(--x); top: var(--y);
        padding: 13px 24px; border-radius: 14px; font-size: 26px; font-weight: 600;
        background: rgba(255,255,255,.07); border: 1.5px solid rgba(255,255,255,.2);
        color: rgba(255,255,255,.86); white-space: nowrap;
        animation: promo-chip 7s cubic-bezier(.3,.6,.3,1) both; animation-delay: var(--at, 0ms);
      }
      #promo-slate .chip::before {
        content: ""; display: inline-block; width: 12px; height: 12px;
        border-radius: 999px; background: ${AMBER}; margin-right: 14px; vertical-align: middle;
      }
      @keyframes promo-chip {
        0% { opacity: 0; transform: translate(var(--fx), var(--fy)) scale(.7) rotate(0deg); }
        14% { opacity: 1; transform: translate(0, 0) scale(1) rotate(var(--r)); }
        100% { opacity: .55; transform: translate(var(--dx), var(--dy)) scale(.96) rotate(var(--r)); }
      }

      /* Scene 2: one difficulty at a time, each struck out as the next comes. */
      #promo-slate .pain { position: relative; display: inline-block; margin: 0 0 26px; font-size: 52px; line-height: 1.14; font-weight: 750; letter-spacing: -.02em; max-width: 26ch; }
      #promo-slate .pain.rise { animation: promo-rise 560ms cubic-bezier(.22,.8,.3,1) both, promo-dim 500ms ease forwards; animation-delay: var(--at), var(--dim, 99s); }
      #promo-slate .pain i {
        position: absolute; left: -10px; top: 52%; height: 6px; width: 0;
        background: ${AMBER}; border-radius: 999px;
        animation: promo-strike 420ms ease forwards; animation-delay: var(--dim, 99s);
      }
      @keyframes promo-strike { to { width: calc(100% + 20px); } }
      @keyframes promo-dim { to { color: rgba(255,255,255,.38); } }

      /* Scene 5: what the viewer keeps. */
      #promo-slate .benefit { display: flex; align-items: center; gap: 30px; margin: 0 0 28px; font-size: 52px; font-weight: 750; letter-spacing: -.02em; }
      #promo-slate .benefit b {
        flex: none; width: 54px; height: 54px; border-radius: 15px; background: ${AMBER};
        color: ${INK}; display: grid; place-items: center; font-size: 32px; font-weight: 800;
      }

      #promo-slate .brand { display: flex; align-items: center; gap: 28px; margin-bottom: 38px; }
      #promo-slate .brand img { height: 64px; width: auto; }

      @keyframes promo-rise { from { opacity: 0; transform: translateY(42px); } to { opacity: 1; transform: none; } }
      @keyframes promo-fade { from { opacity: 0; } to { opacity: 1; } }
    `;

    const root = document.createElement("div");
    root.id = "promo-overlay";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div id="promo-headline"></div>
      <div id="promo-cover"><div><div class="kicker"></div><div class="line"></div></div></div>
      <div id="promo-slate"></div>
    `;
    document.documentElement.append(style, root);

    // A cover that was up before this document loaded is up from its first
    // paint, with what it said.
    const stored = sessionStorage.getItem(COVER_FLAG);
    if (stored !== null) paintCover(JSON.parse(stored), true);
  };

  const byId = (id: string) => document.getElementById(id);

  const paintCover = (
    content: { kicker: string; line: string } | null,
    isInstant: boolean,
  ) => {
    const cover = byId("promo-cover");
    if (!cover) return;
    cover.classList.toggle("is-instant", isInstant);
    if (content) {
      cover.querySelector(".kicker")!.textContent = content.kicker;
      const line = cover.querySelector(".line")!;
      line.textContent = content.line;
      line.classList.toggle("rise", !isInstant);
    }
    cover.classList.toggle("is-on", Boolean(content));
    document.documentElement.classList.toggle(
      "promo-covered",
      Boolean(content) ||
        Boolean(byId("promo-slate")?.classList.contains("is-on")),
    );
  };

  // The very first document opens covered: the film starts on ink, never on
  // a page loading.
  if (sessionStorage.getItem("promo-started") === null) {
    sessionStorage.setItem("promo-started", "1");
    sessionStorage.setItem(
      COVER_FLAG,
      JSON.stringify({ kicker: "", line: "" }),
    );
  }

  if (document.documentElement) mount();
  document.addEventListener("DOMContentLoaded", mount);

  (window as unknown as { __promo: unknown }).__promo = {
    /** The short line of a shot, docked in a corner of the screen. */
    headline(content: { text: string; isTop: boolean } | null) {
      mount();
      const headline = byId("promo-headline");
      if (!headline) return;
      if (content) {
        headline.textContent = content.text;
        headline.classList.toggle("is-top", content.isTop);
      }
      headline.classList.toggle("is-on", Boolean(content));
    },
    /** Ink over the whole screen while the next one loads behind it. */
    cover(content: { kicker: string; line: string } | null) {
      mount();
      if (content) sessionStorage.setItem(COVER_FLAG, JSON.stringify(content));
      else sessionStorage.removeItem(COVER_FLAG);
      paintCover(content, false);
    },
    /**
     * A full-screen slate. The markup is the storyboard's own, written in the
     * film's script: nothing a user typed ever reaches it.
     */
    slate(content: { html: string; isInstant: boolean } | null) {
      mount();
      const slate = byId("promo-slate");
      if (!slate) return;
      slate.classList.toggle("is-instant", Boolean(content?.isInstant));
      if (content) slate.innerHTML = content.html;
      slate.classList.toggle("is-on", Boolean(content));
      document.documentElement.classList.toggle(
        "promo-covered",
        Boolean(content) ||
          Boolean(byId("promo-cover")?.classList.contains("is-on")),
      );
    },
  };
};
