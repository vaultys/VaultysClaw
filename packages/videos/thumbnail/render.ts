/**
 * The thumbnails of every video (thumbnails.ts), rendered by Remotion as stills — ported from
 * VaultysHub's `e2e/videos/thumbnail/render.ts`:
 *
 *   pnpm generate:thumbnails                    # → .generated-videos/<name>.<lang>.thumb.jpg, 1280×720
 *   pnpm generate:thumbnails marketing fr
 *   pnpm generate:thumbnails --check            # → .generated-videos/thumbnails-check.jpg, all of them, FR | EN
 *
 * Each one needs its video: the screen recording (screens/<name>.<lang>.mp4) or, for the
 * animated videos, the final .mp4.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { pngUri, SCREENS } from "../explainer/video";
import { OUTPUT as OUT } from "../stack";
import type { ThumbnailProps } from "./Thumbnail";
import { THUMBNAILS } from "./thumbnails";

type Lang = "fr" | "en";
const LANGS: Lang[] = ["fr", "en"];
const WORK = path.join(OUT, ".thumb-cache");

const duration = (file: string) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

/** The frame of the video the thumbnail shows, as a JPEG data URI. */
function frame(name: string, lang: Lang) {
  const { at, atEn, final, video: other, mark } = THUMBNAILS[name].frame;
  const source = (l: Lang) => {
    if (final) return path.join(OUT, `${name}.${l}.mp4`);
    const own = path.join(SCREENS, `${other ?? name}.${l}.mp4`);
    // A recording made in English only (the console is English) serves both languages.
    return fs.existsSync(own) ? own : path.join(SCREENS, `${other ?? name}.en.mp4`);
  };
  const video = source(lang);
  if (!fs.existsSync(video)) throw new Error(`${video} is missing: generate the video first`);
  // A mark is the same moment in every language; otherwise English is taken at the same
  // fraction of the video, unless it has its own time.
  const time = mark
    ? JSON.parse(fs.readFileSync(video.replace(/\.mp4$/, ".marks.json"), "utf8"))[mark] + at
    : lang === "fr"
      ? at
      : (atEn ?? (at * duration(video)) / duration(source("fr")));
  const out = path.join(WORK, `${name}.${lang}.jpg`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", time.toFixed(3), "-i", video, "-frames:v", "1", "-q:v", "2", out]);
  return `data:image/jpeg;base64,${fs.readFileSync(out).toString("base64")}`;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const names = args.filter((a) => a in THUMBNAILS);
  const langs = args.filter((a): a is Lang => (LANGS as string[]).includes(a));
  fs.mkdirSync(WORK, { recursive: true });

  const { bundle } = await import("@remotion/bundler");
  const { renderStill, selectComposition } = await import("@remotion/renderer");
  const serveUrl = await bundle({ entryPoint: path.join(__dirname, "index.tsx") });
  const logo = pngUri(path.join(__dirname, "../intro/assets/claw-wordmark-light.png"));

  const written: string[] = [];
  for (const name of names.length ? names : Object.keys(THUMBNAILS)) {
    const spec = THUMBNAILS[name];
    for (const lang of langs.length ? langs : LANGS) {
      const props: ThumbnailProps = {
        eyebrow: spec.eyebrow[lang],
        hook: spec.hook[lang],
        highlight: spec.highlight[lang],
        sticker: spec.sticker[lang],
        tone: spec.tone,
        accent: spec.accent,
        image: frame(name, lang),
        imageSize: [1920, 1080],
        focus: spec.frame.focus,
        zoom: spec.frame.zoom,
        logo,
      };
      if (!props.hook.includes(props.highlight)) throw new Error(`${name} (${lang}): "${props.highlight}" is not in "${props.hook}"`);
      const composition = await selectComposition({ serveUrl, id: "Thumbnail", inputProps: props });
      const still = path.join(WORK, `${name}.${lang}.png`);
      await renderStill({ composition, serveUrl, output: still, inputProps: props, imageFormat: "png" });
      // 1280×720 JPEG: YouTube's size, under its 2 MB limit.
      const out = path.join(OUT, `${name}.${lang}.thumb.jpg`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", still, "-vf", "scale=1280:720:flags=lanczos", "-q:v", "2", out]);
      written.push(out);
      console.log(`→ ${path.relative(process.cwd(), out)}`);
    }
  }

  if (check) {
    // Every thumbnail, small, FR on the left and EN on the right: to review them at a glance.
    const inputs = written.flatMap((f) => ["-i", f]);
    const cols = langs.length === 1 ? 1 : 2;
    const tiles = written.map((_, i) => `[${i}:v]scale=640:360[t${i}]`).join(";");
    const layout = written.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join("|");
    const out = path.join(OUT, "thumbnails-check.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", `${tiles};${written.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${written.length}:layout=${layout}`, "-q:v", "3", out]);
    console.log(`→ ${path.relative(process.cwd(), out)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
