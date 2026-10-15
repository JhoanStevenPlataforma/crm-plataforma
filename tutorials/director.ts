import type { Locator, Page } from "@playwright/test";

/**
 * Drives one recording: moves the pointer the way a person would, rings what
 * is about to be pressed, keeps a caption on screen long enough to be read,
 * and remembers when each caption was shown so the captions file can be
 * written from the recording itself.
 *
 * A tutorial script reads as its own storyboard:
 *
 *   await director.intro("Create a product", "What you will learn");
 *   await director.step("Open Products in the Sales menu.", async () => {
 *     await director.click(page.getByRole("link", { name: "Productos" }));
 *   });
 *   await director.outro("The product is ready to be priced.");
 *
 * The fixed waits are deliberate. This is a film, not a test: a pause is what
 * gives the viewer time to see where the pointer went.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

interface TutorialWindow {
  __tutorial: {
    caption: (content: { text: string; isTop: boolean } | null) => void;
    card: (
      content: { eyebrow: string; title: string; subtitle: string } | null,
    ) => void;
    ring: (
      box: { x: number; y: number; width: number; height: number } | null,
    ) => void;
    zoom: (target: { x: number; y: number; scale: number } | null) => void;
  };
}

/** Reading time: long enough for a slow reader, never a dead screen. */
const readingTime = (text: string): number =>
  Math.min(6500, Math.max(2200, text.length * 62));

/**
 * `TUTORIAL_REHEARSAL=1` runs a script at a fraction of its pauses, to find
 * the locator that no longer matches without sitting through the film. What
 * it records is not watchable; record again without it.
 */
const PACE = process.env.TUTORIAL_REHEARSAL ? 0.04 : 1;

const POINTER_TRAVEL_MS = 560;
const BEFORE_CLICK_MS = 380;
const AFTER_CLICK_MS = 520;
const TYPING_DELAY_MS = 38;

export class Director {
  readonly cues: Cue[] = [];
  private readonly startedAt = Date.now();

  constructor(
    readonly page: Page,
    private readonly eyebrow: string,
  ) {}

  /** Seconds since the recording began. */
  private now(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  private overlay<K extends keyof TutorialWindow["__tutorial"]>(
    method: K,
    argument: Parameters<TutorialWindow["__tutorial"][K]>[0],
  ): Promise<void> {
    return this.page.evaluate(
      ([name, value]) => {
        const api = (window as unknown as TutorialWindow).__tutorial;
        (api[name as K] as (input: unknown) => void)(value);
      },
      [method, argument] as const,
    );
  }

  pause(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms * PACE);
  }

  /** The opening card: what the viewer is about to learn, in one line. */
  async intro(title: string, subtitle: string): Promise<void> {
    await this.overlay("card", { eyebrow: this.eyebrow, title, subtitle });
    this.cues.push({
      start: this.now(),
      end: this.now() + 3.2,
      text: `${title}. ${subtitle}`,
    });
    await this.pause(3200);
  }

  /**
   * A card in the middle of a film: the title of the part that begins. For a
   * film long enough to have parts; a tutorial has one subject and no need.
   */
  async chapter(title: string, subtitle: string): Promise<void> {
    await this.overlay("caption", null);
    await this.overlay("ring", null);
    await this.overlay("zoom", null);
    const start = this.now();
    await this.overlay("card", { eyebrow: this.eyebrow, title, subtitle });
    await this.pause(Math.max(3200, (title.length + subtitle.length) * 55));
    this.cues.push({ start, end: this.now(), text: `${title}. ${subtitle}` });
    await this.overlay("card", null);
    await this.pause(500);
  }

  /** Lifts the opening card once the screen behind it is ready. */
  async reveal(): Promise<void> {
    await this.overlay("card", null);
    await this.pause(500);
  }

  /** The closing card: what was achieved. */
  async outro(text: string): Promise<void> {
    await this.overlay("caption", null);
    await this.overlay("ring", null);
    await this.overlay("zoom", null);
    await this.overlay("card", {
      eyebrow: this.eyebrow,
      title: "Listo",
      subtitle: text,
    });
    this.cues.push({ start: this.now(), end: this.now() + 3, text });
    await this.pause(3000);
  }

  /**
   * One step of the storyboard: the caption goes up, the actions run under
   * it, and it stays until it has been on screen long enough to read.
   *
   * `captionAt: "top"` is for the step whose subject sits at the bottom of
   * the screen, where the caption would cover exactly what it talks about.
   */
  async step(
    text: string,
    actions?: () => Promise<void>,
    { captionAt = "bottom" }: { captionAt?: "top" | "bottom" } = {},
  ): Promise<void> {
    const start = this.now();
    await this.overlay("caption", { text, isTop: captionAt === "top" });
    await this.pause(650);
    if (actions) await actions();
    const shown = (this.now() - start) * 1000;
    await this.pause(Math.max(450, readingTime(text) - shown));
    await this.overlay("ring", null);
    this.cues.push({ start, end: this.now(), text });
  }

  /** Moves the pointer onto an element and rings it. */
  async pointAt(target: Locator): Promise<{ x: number; y: number }> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("The element to point at is not on screen.");
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await this.page.mouse.move(centre.x, centre.y);
    await this.overlay("ring", box);
    await this.pause(POINTER_TRAVEL_MS);
    return centre;
  }

  /** Rings an element without going to it: "look here". */
  async highlight(target: Locator, ms = 1400): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) await this.overlay("ring", box);
    await this.pause(ms);
    await this.overlay("ring", null);
  }

  async click(target: Locator): Promise<void> {
    const centre = await this.pointAt(target);
    await this.pause(BEFORE_CLICK_MS);
    await this.page.mouse.click(centre.x, centre.y);
    await this.overlay("ring", null);
    await this.pause(AFTER_CLICK_MS);
  }

  /** Clicks into a field and types the way a person does, key by key. */
  async type(target: Locator, text: string): Promise<void> {
    await this.click(target);
    await target.press("ControlOrMeta+a");
    await target.pressSequentially(text, { delay: TYPING_DELAY_MS * PACE });
    await this.pause(280);
  }

  /** Sets a field in one go: for a date, which nobody types key by key. */
  async fill(target: Locator, value: string): Promise<void> {
    await this.click(target);
    await target.fill(value);
    await this.pause(320);
  }

  /** Scrolls an element to the middle of the screen, smoothly. */
  async scrollTo(target: Locator): Promise<void> {
    await target.evaluate((element) =>
      element.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    await this.pause(900);
  }

  /** Magnifies the area around an element; `zoomOut()` puts it back. */
  async zoomTo(target: Locator, scale = 1.35): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) return;
    await this.overlay("zoom", {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      scale,
    });
    await this.pause(850);
  }

  async zoomOut(): Promise<void> {
    await this.overlay("zoom", null);
    await this.pause(750);
  }

  /** How long the recording ran, in whole seconds. */
  duration(): number {
    return Math.round(this.now());
  }

  /** The captions file, written from what was actually shown and when. */
  toVtt(): string {
    const stamp = (seconds: number) => {
      const ms = Math.max(0, Math.round(seconds * 1000));
      const part = (value: number, size = 2) =>
        String(value).padStart(size, "0");
      return `${part(Math.floor(ms / 3_600_000))}:${part(
        Math.floor(ms / 60_000) % 60,
      )}:${part(Math.floor(ms / 1000) % 60)}.${part(ms % 1000, 3)}`;
    };
    const body = this.cues
      .map(
        (cue, index) =>
          `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`,
      )
      .join("\n\n");
    return `WEBVTT\n\n${body}\n`;
  }
}
