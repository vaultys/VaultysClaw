/**
 * Renders a narrated, animated explainer (kit.tsx) → .generated-videos/<name>.<lang>.mp4 + .srt.
 *
 *   tsx explainer/render.ts <name>             # fr and en
 *   tsx explainer/render.ts <name> en
 *   tsx explainer/render.ts <name> --check     # → .generated-videos/<name>-check.jpg: 4 frames per line, no render
 *   tsx explainer/render.ts <name> fr --voice  # → .generated-videos/<name>-voice.fr.mp3: the narration alone, to listen to first
 *
 * <name> is a folder of packages/videos with <name>.narration.json, index.tsx (the Remotion entry, one
 * "Explainer" composition) and video.ts (its scenes, and the props for a language). No screen
 * recording, so no app, database nor browser: the voice is synthesized first (tts.ts, same cache
 * and providers as the other videos), the scenes are laid on the clips' lengths, then the same
 * render as every video (render.ts) puts the intro and outro bumpers around them and mixes the voice.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { FPS } from "../intro/Intro";
import { renderIntro, renderOutro } from "../intro/render";
import { render } from "../render";
import { OUTPUT, parseEnv } from "../stack";
import { Lang, localize, Narration, synthesize } from "../tts";
import { timeline } from "./kit";
import { ExplainerVideo, SCREENS } from "./video";

const OUT = OUTPUT;
// Optional, as for the other videos (mind the licence): VIDEO_MUSIC, or packages/videos/music.mp3.
const MUSIC = [process.env.VIDEO_MUSIC, path.join(__dirname, "..", "music.mp3")].find((f) => f && fs.existsSync(f));

// ELEVENLABS_API_KEY lives there, as for `pnpm generate:videos`.
const LOCAL_ENV = path.join(__dirname, "..", ".env");
if (fs.existsSync(LOCAL_ENV)) for (const [k, v] of Object.entries(parseEnv(LOCAL_ENV))) process.env[k] ??= v;

async function main() {
  const [name, ...args] = process.argv.slice(2);
  if (!name) throw new Error("Usage: tsx explainer/render.ts <name> [fr|en…] [--check]");
  const dir = path.join(__dirname, "..", name);
  const video: ExplainerVideo = (await import(path.join(dir, "video"))).default;
  const narration: Narration = JSON.parse(fs.readFileSync(path.join(dir, `${name}.narration.json`), "utf8"));
  const check = args.includes("--check");
  const voiceOnly = args.includes("--voice");
  const asked = args.filter((a) => !a.startsWith("--")) as Lang[];
  const langs: Lang[] = asked.length ? asked : check ? ["fr"] : ["fr", "en"];
  const work = path.join(OUT, `.${name}`);
  fs.mkdirSync(work, { recursive: true });
  for (const lang of langs)
    for (const file of video.screens?.(lang) ?? [])
      if (!fs.existsSync(path.join(SCREENS, file))) throw new Error(`${path.join(SCREENS, file)} is missing: record it first (pnpm generate:videos)`);

  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");
  const serveUrl = await bundle({ entryPoint: path.join(dir, "index.tsx"), publicDir: video.screens ? SCREENS : undefined });

  for (const lang of langs) {
    const clips = await synthesize(narration, lang, path.join(OUT, ".tts-cache"));

    if (voiceOnly) {
      // A voice proof: every line in turn, a second apart, to listen to before the picture is rendered.
      const out = path.join(OUT, `${name}-voice.${lang}.mp3`);
      const voiced = clips.filter((c) => c.file);
      execFileSync("ffmpeg", ["-y", ...voiced.flatMap((c) => ["-i", c.file!]), "-filter_complex", `${voiced.map((_, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=mono,apad=pad_dur=1[a${i}]`).join(";")};${voiced.map((_, i) => `[a${i}]`).join("")}concat=n=${voiced.length}:v=0:a=1`, "-b:a", "160k", out], { stdio: "pipe" });
      let t = 0;
      for (const [i, c] of voiced.entries()) {
        const m = Math.floor(t / 60);
        console.log(`  ${String(i + 1).padStart(2)}  ${m}:${(t - m * 60).toFixed(0).padStart(2, "0")}  ${c.id.padEnd(12)} ${c.text}`);
        t += c.duration + 1;
      }
      console.log(`→ ${path.relative(process.cwd(), out)}`);
      continue;
    }
    const durations = Object.fromEntries(clips.map((c) => [c.id, c.duration]));
    const tl = timeline(video.scenes, durations);
    const props = video.props(lang, durations);
    const composition = await selectComposition({ serveUrl, id: "Explainer", inputProps: props });

    if (check) {
      // A contact sheet: each line at its start, a third, two thirds and its end.
      const stills: string[] = [];
      for (const line of Object.values(tl.lines))
        for (const k of [0.05, 0.35, 0.7, 1]) {
          const frame = Math.min(composition.durationInFrames - 1, Math.round((line.start + k * line.duration) * FPS));
          const file = path.join(work, `check-${stills.length}.png`);
          await renderStill({ composition, serveUrl, inputProps: props, frame, output: file, scale: 0.25 });
          stills.push(file);
        }
      const rows: string[][] = [];
      for (let i = 0; i < stills.length; i += 4) rows.push(stills.slice(i, i + 4));
      const out = path.join(OUT, `${name}-check.jpg`);
      execFileSync(
        "ffmpeg",
        ["-y", ...stills.flatMap((f) => ["-i", f]), "-filter_complex", `${rows.map((r, j) => `${r.map((_, k) => `[${j * 4 + k}:v]`).join("")}hstack=inputs=${r.length}[r${j}]`).join(";")};${rows.map((_, j) => `[r${j}]`).join("")}vstack=inputs=${rows.length}`, "-q:v", "3", out],
        { stdio: "pipe" },
      );
      stills.forEach((f) => fs.rmSync(f));
      console.log(`→ ${path.relative(process.cwd(), out)}`);
      continue;
    }

    console.log(`${name}.${lang}: rendering ${tl.total.toFixed(1)} s…`);
    const scenes = path.join(work, `${lang}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      crf: 16,
      outputLocation: scenes,
      inputProps: props,
      muted: true,
      onProgress: ({ progress }) => process.stdout.write(`\r  ${Math.round(progress * 100)} %`),
    });
    process.stdout.write("\n");

    // render() reads its picture through ffmpeg's concat demuxer (made for the screencast's frames).
    const list = path.join(work, `${lang}.txt`);
    fs.writeFileSync(list, `file '${scenes}'\n`);
    const intro = await renderIntro(localize(narration.title, lang, "title"), lang);
    const outro = await renderOutro(narration.outro?.[lang] ?? "", lang);
    const file = render({
      frames: list,
      intro: intro.file,
      introDuration: intro.duration,
      outro: outro.file,
      outroDuration: outro.duration,
      outDir: OUT,
      name: `${name}.${lang}`,
      cues: clips.map((c) => ({ ...c, start: tl.lines[c.id].start })),
      duration: tl.total,
      music: MUSIC,
    });
    console.log(`→ ${path.relative(process.cwd(), file)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
