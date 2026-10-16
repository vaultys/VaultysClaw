import type { At } from "../explainer/kit";
import type { Texts } from "./texts";

/** The console footage (marketing-screens/), one recording, cut by its marks. */
export type Footage = { file: string; marks: Record<string, number> };

export type MarketingProps = {
  texts: Texts;
  durations: Record<string, number>;
  /** VaultysClaw's logo, a data URI (docs-site/static/img/logo.svg). */
  clawLogo: string;
  /** Empty in the studio, where there are no screens to serve. */
  footage: Footage | null;
};

export type SceneProps = { t: Texts; at: At; length: number; logo: string; footage: Footage | null };
