import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Lang } from "../tts";
import { FPS, introFrames, OUTRO_DURATION, OUTRO_SWITCH, SWITCH } from "./Intro";
import { writeJingle } from "./jingle";

/** Vaultys' shield (copied from VaultysHub), and VaultysClaw's wordmark, all white (assets/README). */
const VAULTYS_LOGO = path.join(__dirname, "assets/vaultys.svg");
const CLAW_LOGO = path.join(__dirname, "assets/claw-wordmark-white.png");
const CACHE = path.resolve(__dirname, "../.generated-videos/.intro-cache");
const TAGLINE: Partial<Record<Lang, string[]>> = {
  fr: ["Simple", "Sécurisé", "Souverain"],
  en: ["Simple", "Secure", "Sovereign"],
};
/** The outro's call to action, under the tagline. */
const CTA = "vaultys.com";

/** Seconds the music goes on after the second scene opens, its 1.5 s fade-out included. */
const MUSIC_AFTER_SWITCH = 3.3;

/** Seconds, for a bumper's text: the intro lasts as long as its title takes to read. */
const BUMPERS = {
  Intro: { duration: (text: string) => introFrames(text) / FPS, switchAt: SWITCH / FPS, music: "music" },
  Outro: { duration: () => OUTRO_DURATION / FPS, switchAt: OUTRO_SWITCH / FPS, music: "outro-music" },
} as const;

/** An SVG as a data URI, optionally recoloured (white, for a coloured background). */
function logo(file: string, recolour?: RegExp) {
  const source = fs.readFileSync(file, "utf8");
  const svg = recolour ? source.replace(recolour, "#ffffff") : source;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** A licensed track to use instead of the synthesized jingle, if there is one. */
function customMusic(kind: keyof typeof BUMPERS) {
  const base = BUMPERS[kind].music;
  const env = kind === "Intro" ? process.env.VIDEO_INTRO_MUSIC : process.env.VIDEO_OUTRO_MUSIC;
  return [env, path.join(__dirname, `${base}.mp3`), path.join(__dirname, `${base}.wav`)].find((f) => f && fs.existsSync(f));
}

let bundled: Promise<string> | undefined;

/**
 * An animated bumper (Intro.tsx, rendered by Remotion) with its music: an mp4 of the
 * composition's length. Cached by everything that shapes it, so a video only pays the
 * ~20 s render when its text, its language or the bumper itself changed.
 */
async function renderBumper(kind: keyof typeof BUMPERS, text: string, lang: Lang) {
  const { switchAt } = BUMPERS[kind];
  const duration = BUMPERS[kind].duration(text);
  // The music does not last as long as the bumper (the intro holds its title 5 s): it rings
  // on a little after the second scene opens, then fades out to nothing.
  const musicEnd = Math.min(duration, switchAt + MUSIC_AFTER_SWITCH);
  const props = {
    tagline: TAGLINE[lang] ?? TAGLINE.en!,
    title: text,
    cta: CTA,
    vaultysLogo: logo(VAULTYS_LOGO, /#4F386E/gi),
    clawLogo: `data:image/png;base64,${fs.readFileSync(CLAW_LOGO).toString("base64")}`,
  };
  const music = customMusic(kind);
  const sources = ["Intro.tsx", "index.tsx", "jingle.ts", "render.ts"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"));
  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify([kind, props, sources, music && fs.statSync(music).mtimeMs]))
    .digest("hex")
    .slice(0, 16);
  fs.mkdirSync(CACHE, { recursive: true });
  const out = path.join(CACHE, `${kind.toLowerCase()}-${hash}.mp4`);
  if (fs.existsSync(out)) return { file: out, duration };

  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  bundled ??= bundle({ entryPoint: path.join(__dirname, "index.tsx") });
  const serveUrl = await bundled;
  const composition = await selectComposition({ serveUrl, id: kind, inputProps: props });
  const silent = path.join(CACHE, `${hash}.silent.mp4`);
  await renderMedia({ composition, serveUrl, codec: "h264", crf: 14, outputLocation: silent, inputProps: props, muted: true });

  let audio = music;
  if (!audio) {
    audio = path.join(CACHE, `${hash}.wav`);
    writeJingle(audio, musicEnd, switchAt);
  }
  // A licensed track is cut to the bumper's length and faded out.
  // The music fades out at musicEnd, then silence until the end of the bumper.
  const fade = `afade=t=out:st=${(musicEnd - 1.5).toFixed(3)}:d=1.5`;
  execFileSync(
    "ffmpeg",
    ["-y", "-i", silent, "-i", audio, "-filter_complex", `[1:a]atrim=0:${musicEnd},${fade},apad=whole_dur=${duration}[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(duration), out],
    { stdio: "pipe" },
  );
  fs.rmSync(silent, { force: true });
  if (!music) fs.rmSync(audio, { force: true });
  return { file: out, duration };
}

/**
 * Renders in a process of its own (this file run by tsx): inside a Playwright worker,
 * Remotion's webpack bundle fails ("Cannot read properties of undefined (reading
 * '…/esbuild-loader/index.js')"), Playwright's own module hooks getting in its way. A
 * cached bumper costs nothing either way.
 */
function renderApart(kind: keyof typeof BUMPERS, text: string, lang: Lang): { file: string; duration: number } {
  const out = execFileSync("npx", ["tsx", __filename, kind, lang, text], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out.trim().split("\n").pop()!);
}

/** Vaultys, then VaultysClaw and the video's title: its file and its length in seconds. */
export const renderIntro = async (title: string, lang: Lang) => renderApart("Intro", title, lang);
/** VaultysClaw and the video's closing line, then Vaultys and its call to action. */
export const renderOutro = async (line: string, lang: Lang) => renderApart("Outro", line, lang);

// tsx intro/render.ts <Intro|Outro> <lang> <text>: renders (or finds in the cache), prints { file, duration }.
if (require.main === module) {
  const [kind, lang, text] = process.argv.slice(2) as [keyof typeof BUMPERS, Lang, string];
  renderBumper(kind, text ?? "", lang).then(
    (result) => console.log(JSON.stringify(result)),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
