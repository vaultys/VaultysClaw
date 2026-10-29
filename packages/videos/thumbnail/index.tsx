// Remotion entry point (bundled by render.ts; `pnpm --filter @vaultysclaw/videos studio:thumbnail` to preview).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { Thumbnail, ThumbnailProps } from "./Thumbnail";

const defaults: ThumbnailProps = {
  eyebrow: "Zero Trust",
  hook: "Chaque agent IA, une identité",
  highlight: "une identité",
  sticker: "Certificat signé",
  tone: "green",
  accent: "orange",
  image: "",
  imageSize: [1920, 1080],
  focus: [0.5, 0.5],
  zoom: 1,
  logo: "",
};

registerRoot(() => <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={30} width={1920} height={1080} defaultProps={defaults} />);
