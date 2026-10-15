/**
 * The recording overlay: everything a tutorial shows that is not the CRM
 * itself -- the pointer, the click ripple, the highlight ring, the caption bar
 * and the opening / closing cards.
 *
 * It runs INSIDE the page (through `addInitScript`), so it must be
 * self-contained: no imports, no closure over anything in this file. A
 * headless browser draws no pointer, which is why one is drawn here.
 *
 * This file is the visual standard of the manual. Change a colour or a size
 * here and every tutorial takes it on its next recording.
 */
export const installOverlay = (): void => {
  const INK = "#0b1020";
  const AMBER = "#f5a524";

  const mount = () => {
    if (document.getElementById("tutorial-overlay")) return;

    const style = document.createElement("style");
    style.textContent = `
      #tutorial-overlay, #tutorial-overlay * { box-sizing: border-box; }
      #tutorial-overlay {
        position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
        font-family: Inter, "Segoe UI", system-ui, sans-serif;
      }
      #tutorial-pointer {
        position: absolute; left: 0; top: 0; width: 28px; height: 28px;
        transform: translate(-100px, -100px);
        transition: transform 520ms cubic-bezier(.22,.8,.3,1);
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.45));
      }
      #tutorial-ring {
        position: absolute; border: 3px solid ${AMBER}; border-radius: 12px;
        box-shadow: 0 0 0 6px rgba(245,165,36,.22), 0 0 28px rgba(245,165,36,.45);
        opacity: 0; transition: opacity 180ms ease, left 260ms ease, top 260ms ease,
          width 260ms ease, height 260ms ease;
      }
      .tutorial-ripple {
        position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px;
        border-radius: 999px; border: 3px solid ${AMBER};
        animation: tutorial-ripple 520ms ease-out forwards;
      }
      @keyframes tutorial-ripple {
        from { transform: scale(.6); opacity: .95; }
        to { transform: scale(4); opacity: 0; }
      }
      #tutorial-caption {
        position: absolute; left: 50%; bottom: 36px; max-width: 76%;
        transform: translate(-50%, 16px); opacity: 0;
        transition: opacity 220ms ease, transform 220ms ease;
        background: ${INK}; color: #fff; border-radius: 14px;
        border-left: 5px solid ${AMBER};
        padding: 14px 22px; font-size: 22px; line-height: 1.35; font-weight: 500;
        box-shadow: 0 12px 40px rgba(0,0,0,.4); text-align: left;
      }
      #tutorial-caption.is-on { opacity: 1; transform: translate(-50%, 0); }
      #tutorial-caption.is-top { bottom: auto; top: 36px; }
      #tutorial-card {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: flex-start; justify-content: center; gap: 18px;
        padding: 0 12%; color: #fff; opacity: 0; transition: opacity 320ms ease;
        background: radial-gradient(1200px 700px at 85% 10%, rgba(245,165,36,.20), transparent 60%), ${INK};
      }
      #tutorial-card.is-on { opacity: 1; }
      #tutorial-card .eyebrow {
        font-size: 18px; letter-spacing: .16em; text-transform: uppercase;
        color: ${AMBER}; font-weight: 600;
      }
      #tutorial-card .title { font-size: 60px; line-height: 1.08; font-weight: 700; max-width: 18ch; }
      #tutorial-card .subtitle { font-size: 26px; line-height: 1.4; color: rgba(255,255,255,.78); max-width: 36ch; }
      #tutorial-card .rule { width: 72px; height: 5px; border-radius: 999px; background: ${AMBER}; }
    `;

    const root = document.createElement("div");
    root.id = "tutorial-overlay";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div id="tutorial-ring"></div>
      <div id="tutorial-caption"></div>
      <svg id="tutorial-pointer" viewBox="0 0 28 28">
        <path d="M5 3l17 9.5-7.4 1.9L11 22z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
      <div id="tutorial-card"><div class="eyebrow"></div><div class="title"></div><div class="rule"></div><div class="subtitle"></div></div>
    `;
    document.documentElement.append(style, root);

    const pointer = root.querySelector<SVGElement>("#tutorial-pointer")!;
    document.addEventListener(
      "mousemove",
      (event) => {
        pointer.style.transform = `translate(${event.clientX - 5}px, ${event.clientY - 3}px)`;
      },
      true,
    );
    document.addEventListener(
      "mousedown",
      (event) => {
        const ripple = document.createElement("div");
        ripple.className = "tutorial-ripple";
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        root.append(ripple);
        setTimeout(() => ripple.remove(), 600);
      },
      true,
    );
  };

  if (document.documentElement) mount();
  document.addEventListener("DOMContentLoaded", mount);

  const byId = (id: string) => document.getElementById(id);

  (window as unknown as { __tutorial: unknown }).__tutorial = {
    caption(content: { text: string; isTop: boolean } | null) {
      mount();
      const caption = byId("tutorial-caption");
      if (!caption) return;
      const text = content?.text;
      if (content) {
        caption.textContent = content.text;
        caption.classList.toggle("is-top", content.isTop);
      }
      caption.classList.toggle("is-on", Boolean(text));
    },
    card(content: { eyebrow: string; title: string; subtitle: string } | null) {
      mount();
      const card = byId("tutorial-card");
      if (!card) return;
      if (content) {
        card.querySelector(".eyebrow")!.textContent = content.eyebrow;
        card.querySelector(".title")!.textContent = content.title;
        card.querySelector(".subtitle")!.textContent = content.subtitle;
      }
      card.classList.toggle("is-on", Boolean(content));
    },
    ring(box: { x: number; y: number; width: number; height: number } | null) {
      mount();
      const ring = byId("tutorial-ring");
      if (!ring) return;
      if (box) {
        const pad = 6;
        ring.style.left = `${box.x - pad}px`;
        ring.style.top = `${box.y - pad}px`;
        ring.style.width = `${box.width + pad * 2}px`;
        ring.style.height = `${box.height + pad * 2}px`;
      }
      ring.style.opacity = box ? "1" : "0";
    },
    zoom(target: { x: number; y: number; scale: number } | null) {
      const body = document.body;
      body.style.transition = "transform 700ms cubic-bezier(.22,.8,.3,1)";
      if (!target) {
        body.style.transform = "none";
        return;
      }
      // Scaled around the target AND carried to the middle of the screen:
      // scaling alone pushes a target near an edge out of the picture.
      const shiftX = window.innerWidth / 2 - target.x;
      const shiftY = window.innerHeight / 2 - target.y;
      body.style.transformOrigin = `${target.x + window.scrollX}px ${target.y + window.scrollY}px`;
      body.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${target.scale})`;
    },
  };
};
