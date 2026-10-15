import type { Locator, Page } from "@playwright/test";

import type { Director } from "../director";

/**
 * Keeps the promotional film on its storyboard's clock.
 *
 * A tutorial waits for its viewer: a caption stays up for as long as it takes
 * to read. A commercial does the opposite -- every shot ends at a second
 * fixed in advance (docs/video/guion-promocional.md), whatever the screen
 * took to load. So a shot is given the mark it must END on, and the wait is
 * whatever is left of it.
 *
 * It drives the manual's `Director` for what that already does (the pointer,
 * the ring, the zoom) and adds what a commercial needs: slates, a headline
 * per shot and a cover over every change of screen.
 */

interface PromoWindow {
  __promo: {
    headline: (content: { text: string; isTop: boolean } | null) => void;
    cover: (content: { kicker: string; line: string } | null) => void;
    slate: (content: { html: string; isInstant: boolean } | null) => void;
  };
}

/** One shot as it was actually recorded: what `produce.mjs` cuts by. */
export interface Mark {
  name: string;
  start: number;
  end: number;
  planned_end: number;
}

export interface Shot {
  /** Its name in the storyboard, and in `meta.json`. */
  name: string;
  /** The second of the film this shot ends on. */
  until: number;
  /** The line on screen. */
  headline?: string;
  /** Where the headline docks; "top" when the subject is at the bottom. */
  headlineAt?: "top" | "bottom";
  /** What a voice would say over it: the caption of the shot. */
  narration: string;
  /** The screen the shot opens on, and what proves it has loaded. */
  screen?: { url: string; ready: (page: Page) => Locator };
  /**
   * What is prepared on that screen while the cover is still up: a form is
   * shown filled in, never being filled in.
   */
  backstage?: () => Promise<void>;
  /** The line above the headline on the cover; the film's own by default. */
  kicker?: string;
}

/** `PROMO_REHEARSAL=1` runs the film at a fraction of its length. */
const PACE = process.env.PROMO_REHEARSAL ? 0.08 : 1;

/** How long a cover stays up at the very least: long enough to be a cut. */
const COVER_MIN_MS = 750;
/** Past this, a shot that ran over its mark is reported. */
const OVERRUN_TOLERANCE_S = 0.5;

export class PromoDirector {
  readonly marks: Mark[] = [];
  readonly overruns: string[] = [];
  private zero = Date.now();
  private readonly createdAt = Date.now();

  constructor(
    readonly page: Page,
    private readonly director: Director,
    private readonly kicker: string,
  ) {}

  /** Seconds of film since `start()`. */
  now(): number {
    return (Date.now() - this.zero) / 1000 / PACE;
  }

  /** What was recorded before the film began, to be trimmed off its head. */
  headSeconds(): number {
    return (this.zero - this.createdAt) / 1000;
  }

  private call<K extends keyof PromoWindow["__promo"]>(
    method: K,
    argument: Parameters<PromoWindow["__promo"][K]>[0],
  ): Promise<void> {
    return this.page.evaluate(
      ([name, value]) => {
        const api = (window as unknown as PromoWindow).__promo;
        (api[name as K] as (input: unknown) => void)(value);
      },
      [method, argument] as const,
    );
  }

  pause(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms * PACE);
  }

  /** Waits for a second of the film; returns at once if it has passed. */
  async waitUntil(second: number): Promise<void> {
    const left = (second - this.now()) * 1000 * PACE;
    if (left > 0) await this.page.waitForTimeout(left);
  }

  /** Second zero: everything recorded before this is cut off. */
  start(): void {
    this.zero = Date.now();
  }

  /** A full-screen slate, replacing whatever slate was up. */
  slate(html: string, { isInstant = false } = {}): Promise<void> {
    return this.call("slate", { html, isInstant });
  }

  clearSlate(): Promise<void> {
    return this.call("slate", null);
  }

  /** Opens a screen behind the cover, without lifting it. */
  async load(screen: NonNullable<Shot["screen"]>): Promise<void> {
    await this.page.goto(screen.url);
    await screen.ready(this.page).first().waitFor({ state: "visible" });
  }

  /**
   * Magnifies the screen around a point of the viewport. The manual's
   * `zoomTo` centres an element, which near an edge drags the page out of
   * the picture; a commercial is framed by eye instead.
   */
  async zoomAt(x: number, y: number, scale: number): Promise<void> {
    await this.page.evaluate(
      (target) => {
        (
          window as unknown as {
            __tutorial: { zoom: (to: typeof target) => void };
          }
        ).__tutorial.zoom(target);
      },
      { x, y, scale },
    );
    await this.pause(850);
  }

  /** Takes the ring and the zoom down: before a screen changes. */
  async reset(): Promise<void> {
    await this.page.evaluate(() => {
      const api = (
        window as unknown as {
          __tutorial: { ring: (b: null) => void; zoom: (t: null) => void };
        }
      ).__tutorial;
      api.ring(null);
      api.zoom(null);
    });
  }

  /**
   * One shot of the storyboard. A shot with a `screen` cuts to it through a
   * cover that carries the headline; the headline then docks while the
   * actions point at what justifies it.
   */
  async shot(shot: Shot, actions?: () => Promise<void>): Promise<void> {
    const start = this.now();
    const headline = shot.headline
      ? { text: shot.headline, isTop: shot.headlineAt === "top" }
      : null;

    if (shot.screen) {
      const coveredAt = Date.now();
      await this.call("headline", null);
      await this.call("cover", {
        kicker: shot.kicker ?? this.kicker,
        line: shot.headline ?? "",
      });
      await this.pause(260);
      // Anything left open (a dialog) goes with the screen it belonged to.
      await this.page.keyboard.press("Escape");
      await this.reset();
      await this.load(shot.screen);
      if (shot.backstage) await shot.backstage();
      const shown = Date.now() - coveredAt;
      await this.pause(Math.max(0, COVER_MIN_MS - shown / PACE));
      await this.call("headline", headline);
      await this.call("cover", null);
      await this.pause(300);
    } else {
      await this.call("headline", headline);
    }

    if (actions) await actions();

    const overrun = this.now() - shot.until;
    if (overrun > OVERRUN_TOLERANCE_S) {
      this.overruns.push(`${shot.name}: ${overrun.toFixed(1)} s over its mark`);
    }
    await this.waitUntil(shot.until);

    const end = this.now();
    this.marks.push({ name: shot.name, start, end, planned_end: shot.until });
    this.director.cues.push({ start, end, text: shot.narration });
  }

  /** The end of the film: everything down, so the last frame is the slate. */
  async finish(): Promise<void> {
    await this.call("headline", null);
  }
}
