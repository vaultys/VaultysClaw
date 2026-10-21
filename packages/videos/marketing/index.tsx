// Remotion entry point (bundled by explainer/render.ts; `pnpm --filter @vaultysclaw/videos studio:marketing` to preview).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { estimatedDurations } from "../explainer/kit";
import { FPS } from "../intro/Intro";
import { Marketing, marketingFrames } from "./Marketing";
import narration from "./marketing.narration.json";
import { TEXTS } from "./texts";
import type { MarketingProps } from "./types";

// The studio has no voice clips (a calm reader's pace instead) and no footage to serve.
const defaults: MarketingProps = { texts: TEXTS.fr, durations: estimatedDurations(narration.lines), clawLogo: "", footage: null };

registerRoot(() => (
  <Composition
    id="Explainer"
    component={Marketing}
    durationInFrames={marketingFrames(defaults.durations)}
    calculateMetadata={({ props }) => ({ durationInFrames: marketingFrames(props.durations) })}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={defaults}
  />
));
