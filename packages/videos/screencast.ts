import { CDPSession, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Records the page through CDP's screencast instead of Playwright's `recordVideo`.
 *
 * `recordVideo` comes out shorter than the wall-clock time it covers (a couple of
 * seconds over a minute), so narration placed by wall-clock time drifted out of
 * sync, and it keeps CSS-pixel frames whatever the deviceScaleFactor. Screencast
 * frames carry their own timestamp and come at device pixels: the video is cut on
 * the same clock as the narration, at full resolution.
 *
 * Chromium only emits a frame when something changes on screen, so each frame is
 * held until the next one (concat demuxer `duration`). `start` again on another
 * page (a tab the scenario opened) switches the capture to it on the same timeline.
 */
export class Screencast {
  private readonly frames: { file: string; t: number }[] = [];
  private writes: Promise<void>[] = [];
  private stopFn: () => Promise<void> = async () => {};
  private readonly sessions = new Map<Page, Promise<CDPSession>>();
  private target: Page | undefined;

  constructor(private readonly dir: string) {}

  async start(page: Page, size: { width: number; height: number }) {
    await this.stopFn();
    fs.mkdirSync(this.dir, { recursive: true });
    const cdp = await this.session(page);
    this.target = page;
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
    this.stopFn = async () => {
      this.target = undefined;
      await cdp.send("Page.stopScreencast").catch(() => {});
    };
  }

  /**
   * One CDP session per page, kept for the whole recording. Chromium sends the next frame
   * only once the last one is acknowledged: a session detached with a frame still in flight
   * (switching tabs back and forth) left that page waiting forever, and it stopped rendering.
   */
  private session(page: Page) {
    let cdp = this.sessions.get(page);
    if (!cdp) {
      cdp = page.context().newCDPSession(page);
      cdp.then((session) =>
        session.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
          session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
          if (this.target !== page) return;
          // metadata.timestamp is epoch seconds; trust it only if it agrees with our clock.
          const stamp = metadata.timestamp ? metadata.timestamp * 1000 : NaN;
          const t = Math.abs(stamp - Date.now()) < 5000 ? stamp : Date.now();
          const file = path.join(this.dir, `${String(this.frames.length).padStart(6, "0")}.jpg`);
          this.frames.push({ file, t });
          this.writes.push(fs.promises.writeFile(file, Buffer.from(data, "base64")));
        }),
      );
      this.sessions.set(page, cdp);
    }
    return cdp;
  }

  async stop() {
    await this.stopFn();
    await Promise.all(this.writes);
  }

  /** An ffmpeg concat list covering [from, to] (epoch ms), starting on the frame on screen at `from`. */
  concatList(from: number, to: number): string {
    const firstIndex = Math.max(0, this.frames.findLastIndex((f) => f.t <= from));
    const kept = this.frames.slice(firstIndex).filter((f) => f.t < to);
    if (!kept.length) throw new Error("The screencast captured no frame");
    const lines = ["ffconcat version 1.0"];
    kept.forEach((f, i) => {
      const start = Math.max(f.t, from);
      const end = i + 1 < kept.length ? kept[i + 1].t : to;
      lines.push(`file '${f.file}'`, `duration ${((end - start) / 1000).toFixed(4)}`);
    });
    // The demuxer ignores the last entry's duration unless the file is repeated.
    lines.push(`file '${kept[kept.length - 1].file}'`);
    const list = path.join(this.dir, "frames.ffconcat");
    fs.writeFileSync(list, lines.join("\n"));
    return list;
  }
}
