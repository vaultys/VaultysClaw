import path from "path";
import { ExplainerVideo, marksOf, pngUri } from "../explainer/video";
import { SCENES } from "./Marketing";
import { TEXTS } from "./texts";
import type { MarketingProps } from "./types";

/**
 * For explainer/render.ts: `pnpm generate:marketing`. The console footage is the English recording
 * whatever the voice's language — the console is English-only (marketing-screens/).
 */
const FOOTAGE = "marketing-screens.en";

const video: ExplainerVideo = {
  scenes: SCENES,
  screens: () => [`${FOOTAGE}.mp4`, `${FOOTAGE}.marks.json`],
  props: (lang, durations): MarketingProps => ({
    texts: TEXTS[lang as keyof typeof TEXTS],
    durations,
    clawLogo: pngUri(path.resolve(__dirname, "../intro/assets/claw-wordmark-light.png")),
    footage: { file: `${FOOTAGE}.mp4`, marks: marksOf("marketing-screens", "en") },
  }),
};
export default video;
