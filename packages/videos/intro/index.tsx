// Remotion entry point (bundled by render.ts; `pnpm --filter @vaultysclaw/videos studio` to preview).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { FPS, Intro, introFrames, IntroProps, Outro, OUTRO_DURATION } from "./Intro";

const defaults: IntroProps = {
  tagline: ["Simple", "Sécurisé", "Souverain"],
  title: "Chaque agent, chaque appareil, une identité vérifiable",
  cta: "vaultys.com",
  vaultysLogo: "",
  clawLogo: "",
};

registerRoot(() => (
  <>
    <Composition
      id="Intro"
      component={Intro}
      durationInFrames={introFrames(defaults.title)}
      // As long as its title takes to read (introFrames).
      calculateMetadata={({ props }) => ({ durationInFrames: introFrames(props.title) })}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaults}
    />
    <Composition id="Outro" component={Outro} durationInFrames={OUTRO_DURATION} fps={FPS} width={1920} height={1080} defaultProps={defaults} />
  </>
));
