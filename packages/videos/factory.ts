import { BrowserContext, test as base } from "@playwright/test";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { renderIntro, renderOutro } from "./intro/render";
import { installCursor, VideoDirector } from "./director";
import { render } from "./render";
import { Screencast } from "./screencast";
import { AUTH } from "./setup/auth";
import { OUTPUT } from "./stack";
import { Lang, loadNarration, localize, synthesize } from "./tts";

// Optional, not in git (mind the licence of the track): VIDEO_MUSIC, or packages/videos/music.mp3.
const MUSIC = [process.env.VIDEO_MUSIC, path.join(__dirname, "music.mp3")].find((f) => f && fs.existsSync(f));
// Laid out at 1280×720 so the UI stays legible on a phone or in a small embed (at a
// true 1920×1080 viewport the text is tiny), and drawn at ×1.5 for a sharp 1080p.
const VIEWPORT = { width: 1280, height: 720 };
const VIDEO = { width: 1920, height: 1080 };
const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-US", de: "de-DE", es: "es-ES", zh: "zh-CN" };

type VideoOptions = { specFile: string; language: Lang; screensOnly: boolean; signedIn: boolean };

/**
 * The `demo` fixture records its own context (cursor overlay, 1280×720 layout at 1080p, see
 * screencast.ts), signed in as the filmed admin (setup/), in `language` — browser locale, voice
 * and subtitles; the console itself is English-only — and, once the scenario is over, renders
 * `.generated-videos/<spec name>.<language>.mp4` from the narration of `<spec name>.narration.json`,
 * between the animated intro and outro.
 */
const videoTest = base.extend<VideoOptions & { demo: VideoDirector }>({
  specFile: ["", { option: true }],
  language: ["fr", { option: true }],
  screensOnly: [false, { option: true }],
  signedIn: [true, { option: true }],

  demo: async ({ browser, playwright, specFile, language, screensOnly, signedIn }, use, testInfo) => {
    const name = `${path.basename(specFile, ".spec.ts")}.${language}`;
    const narration = screensOnly ? undefined : loadNarration(specFile);
    const clips = narration ? await synthesize(narration, language, path.join(OUTPUT, ".tts-cache")) : [];

    const baseURL = testInfo.project.use.baseURL;
    // A video of something other than the console (the ECW demonstrator) films no session.
    const auth = signedIn ? AUTH : undefined;
    const admin = await playwright.request.newContext({ baseURL, storageState: auth });
    const contexts: BrowserContext[] = [];
    const newContext = async (storageState?: string) => {
      const context = await browser.newContext({
        baseURL,
        storageState,
        viewport: VIEWPORT,
        deviceScaleFactor: VIDEO.width / VIEWPORT.width,
        locale: LOCALES[language],
        // The console follows the system theme: pin it, so a video never depends on the machine it was recorded on.
        colorScheme: "light",
      });
      await installCursor(context);
      contexts.push(context);
      return context;
    };
    const page = await (await newContext(auth)).newPage();
    page.setDefaultTimeout(30_000);
    const screencast = new Screencast(testInfo.outputPath("frames"));
    await screencast.start(page, VIDEO);
    const director = new VideoDirector(
      page,
      admin,
      language,
      new Map(clips.map((c) => [c.id, c])),
      (next) => screencast.start(next, VIDEO),
      async () => (await newContext()).newPage(),
    );

    await use(director);

    if (!director.endedAt) director.end();
    await screencast.stop();
    for (const context of contexts) await context.close();
    await admin.dispose();
    if (testInfo.status !== testInfo.expectedStatus) return;

    // The screens alone (no bumpers, labels nor sound) and their marks, for a later montage to cut from.
    fs.mkdirSync(path.join(OUTPUT, "screens"), { recursive: true });
    const frames = screencast.concatList(director.startedAt, director.endedAt);
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", frames, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", path.join(OUTPUT, "screens", `${name}.mp4`)], { stdio: "pipe" });
    fs.writeFileSync(path.join(OUTPUT, "screens", `${name}.marks.json`), JSON.stringify(director.marks, null, 2));
    if (!narration) {
      console.log(`Screens: ${path.relative(process.cwd(), path.join(OUTPUT, "screens", `${name}.mp4`))}`);
      return;
    }

    const intro = await renderIntro(localize(narration.title, language, "title"), language);
    const outro = await renderOutro(narration.outro?.[language] ?? "", language);
    const file = render({
      frames,
      intro: intro.file,
      introDuration: intro.duration,
      outro: outro.file,
      outroDuration: outro.duration,
      outDir: OUTPUT,
      name,
      cues: director.cues,
      labels: director.labels,
      duration: (director.endedAt - director.startedAt) / 1000,
      music: MUSIC,
    });
    console.log(`Video: ${path.relative(process.cwd(), file)}`);
  },
});

/**
 * Declares one video per language. `specFile` is the spec's `__filename`: the tests
 * are declared here, so Playwright would otherwise report this file as theirs and
 * the narration could not be found. The console's copy is English in every language,
 * so selecting by role and accessible name is stable across them.
 */
export function defineVideo(
  specFile: string,
  title: string,
  scenario: (demo: VideoDirector) => Promise<void>,
  {
    languages = ["fr", "en"],
    screensOnly = false,
    signedIn = true,
  }: {
    languages?: Lang[];
    /** No narration nor render: only the screens and their marks (.generated-videos/screens/). */
    screensOnly?: boolean;
    /** Film as the signed-in admin (setup/). False for a page that is not the console. */
    signedIn?: boolean;
  } = {},
) {
  for (const language of languages) {
    videoTest.describe(`lang:${language}`, () => {
      videoTest.use({ specFile, language, screensOnly, signedIn });
      videoTest(title, ({ demo }) => scenario(demo));
    });
  }
}
