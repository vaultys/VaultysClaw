import { APIRequestContext, BrowserContext, Locator, Page } from "@playwright/test";
import { Clip, Lang, Localized, localize } from "./tts";

export type Cue = { id: string; text: string; file: string | null; start: number; duration: number };
/** A caption pinned to the top of the image, e.g. whose screen this is. */
export type Label = { text: string; start: number; duration: number };

/**
 * Headless recordings have no visible pointer: draw one that follows the real
 * mouse events Playwright dispatches, plus a ripple on each click. Its position
 * survives navigations through sessionStorage.
 */
const CURSOR_SCRIPT = `(() => {
  const KEY = "__pw_video_cursor__";
  const install = () => {
    if (document.getElementById(KEY)) return;
    const saved = JSON.parse(sessionStorage.getItem(KEY) || '{"x":640,"y":360}');
    const cursor = document.createElement("div");
    cursor.id = KEY;
    cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.6L4 20z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, { position: "fixed", left: 0, top: 0, zIndex: 2147483647, pointerEvents: "none",
      transform: "translate(" + (saved.x - 4) + "px," + (saved.y - 2) + "px)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" });
    document.documentElement.appendChild(cursor);
    window.addEventListener("mousemove", (e) => {
      cursor.style.transform = "translate(" + (e.clientX - 4) + "px," + (e.clientY - 2) + "px)";
      sessionStorage.setItem(KEY, JSON.stringify({ x: e.clientX, y: e.clientY }));
    }, true);
    window.addEventListener("mousedown", (e) => {
      const ripple = document.createElement("div");
      Object.assign(ripple.style, { position: "fixed", left: e.clientX - 22 + "px", top: e.clientY - 22 + "px", width: "44px", height: "44px",
        borderRadius: "50%", background: "rgba(139,92,246,.45)", zIndex: 2147483646, pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out" });
      document.documentElement.appendChild(ripple);
      requestAnimationFrame(() => { ripple.style.transform = "scale(1.8)"; ripple.style.opacity = "0"; });
      setTimeout(() => ripple.remove(), 500);
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();`;

export async function installCursor(context: BrowserContext) {
  await context.addInitScript(CURSOR_SCRIPT);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the page at a human pace and keeps the narration timeline.
 *
 * `say(id)` returns when the line has finished being spoken, so a spec either
 * awaits it (talk, then act) or starts it and acts meanwhile:
 *
 *   const line = demo.say("share");
 *   await demo.click(button);
 *   await line;
 *
 * Lines never overlap: a `say` waits for the previous one to end.
 */
export class VideoDirector {
  readonly cues: Cue[] = [];
  readonly labels: Label[] = [];
  /** Named moments (seconds from `start()`), for a montage to cut from (`mark`). */
  readonly marks: Record<string, number> = {};
  /** Wall-clock times (epoch ms) the video starts and ends at. */
  startedAt = 0;
  endedAt = 0;
  private speaking: Promise<void> = Promise.resolve();
  private mouse = { x: 640, y: 360 };

  constructor(
    public page: Page,
    /** The admin's API session, for setup before `start()`: it survives a sign-out the scenario films. */
    readonly admin: APIRequestContext,
    readonly lang: Lang,
    private readonly clips: Map<string, Clip>,
    private readonly onFollow: (page: Page) => Promise<void>,
    private readonly onOpenBrowser: () => Promise<Page>,
  ) {}

  /**
   * A page in a browser of its own — another computer: same framing, cursor and
   * language, but no session and nothing in its storage. Not filmed until `follow(page)`.
   */
  openBrowser() {
    return this.onOpenBrowser();
  }

  /** Films `page` from now on, e.g. the tab an app opens in: `await demo.follow(await popup)`. */
  async follow(page: Page) {
    await this.onFollow(page);
    this.page = page;
    // A new tab has its own pointer: the overlay starts it at the center.
    this.mouse = { x: 640, y: 360 };
  }

  /** UI text for the language being recorded, for the rare selector that needs one: `demo.t({ fr: "Créer", en: "Create" })`. */
  t(text: Localized) {
    return localize(text, this.lang, JSON.stringify(text));
  }

  /**
   * Everything before this (setup requests, first load) is cut from the video.
   * Then holds the screen still while the intro card fades out, so the first
   * line does not start under it.
   */
  async start() {
    this.startedAt = Date.now();
    await sleep(1000);
  }

  /**
   * Names this moment of the recording: a montage starts its shots from
   * these marks rather than from seconds, which shift with each language and each run.
   */
  mark(name: string) {
    this.marks[name] = (Date.now() - this.startedAt) / 1000;
  }

  end() {
    this.endedAt = Date.now();
    this.label(null);
  }

  /**
   * Pins `text` to the top of the video from now on (until the next
   * label, or `null`). Use it to tell the viewer whose screen this is.
   */
  label(text: string | null) {
    // Before start(), the label is the opening one: it shows from the first frame.
    const now = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    const open = this.labels[this.labels.length - 1];
    if (open && open.duration < 0) open.duration = now - open.start;
    if (text) this.labels.push({ text, start: now, duration: -1 });
  }

  say(id: string, { gapAfter = 400 }: { gapAfter?: number } = {}): Promise<void> {
    const clip = this.clips.get(id);
    if (!clip) throw new Error(`No narration line "${id}" in the .narration.json`);
    if (!this.startedAt) throw new Error("await demo.start() must come before demo.say()");
    this.speaking = this.speaking.then(async () => {
      this.cues.push({ id, text: clip.text, file: clip.file, start: (Date.now() - this.startedAt) / 1000, duration: clip.duration });
      await sleep(clip.duration * 1000 + gapAfter);
    });
    return this.speaking;
  }

  pause(ms = 600) {
    return sleep(ms);
  }

  /** Glides the cursor to the element's center (ease-in-out), at roughly 1.2 px/ms. */
  async moveTo(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Cannot move to an element without a box: ${locator}`);
    await this.glide({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }

  /** Glides the cursor to a point of the viewport. */
  async moveAt(x: number, y: number) {
    await this.glide({ x, y });
  }

  private async glide(to: { x: number; y: number }) {
    const from = this.mouse;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(8, Math.round(distance / 20));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await this.page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      await sleep(Math.min(16, distance / steps / 1.2));
    }
    this.mouse = to;
  }

  /** Clicks a point of the viewport, for screens with no DOM to aim at (a remote desktop's canvas). */
  async clickAt(x: number, y: number) {
    await this.glide({ x, y });
    await sleep(250);
    await this.page.mouse.click(x, y);
    await sleep(350);
  }

  async click(locator: Locator) {
    await this.moveTo(locator);
    await sleep(250);
    await locator.click();
    await sleep(350);
  }

  async hover(locator: Locator) {
    await this.moveTo(locator);
    await locator.hover();
  }

  async type(locator: Locator, text: string) {
    await this.click(locator);
    await locator.pressSequentially(text, { delay: 90 });
    await sleep(300);
  }
}
