import fs from "fs";
import path from "path";
import { OUTPUT } from "../stack";
import type { Lang } from "../tts";
import type { SceneList } from "./kit";

/** What a video folder's video.ts exports by default, for explainer/render.ts. */
export type ExplainerVideo = {
  scenes: SceneList;
  /** The composition's props in `lang`, given the voice clips' lengths. */
  props: (lang: Lang, durations: Record<string, number>) => Record<string, unknown>;
  /**
   * The screen recordings a scene plays (files of .generated-videos/screens/, written by
   * `pnpm generate:videos`), served as the bundle's public dir (staticFile). Checked before rendering.
   */
  screens?: (lang: Lang) => string[];
};

export const SCREENS = path.join(OUTPUT, "screens");

/** A PNG as a data URI. */
export function pngUri(file: string) {
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
}

/** The marks (`demo.mark`) of a screen recording: seconds into it. */
export function marksOf(video: string, lang: Lang): Record<string, number> {
  return JSON.parse(fs.readFileSync(path.join(SCREENS, `${video}.${lang}.marks.json`), "utf8"));
}
