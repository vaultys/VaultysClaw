import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SceneHero } from "./scenes/SceneHero";
import { SceneProblem } from "./scenes/SceneProblem";
import { SceneIdentity } from "./scenes/SceneIdentity";
import { SceneCulture } from "./scenes/SceneCulture";
import { SceneCTA } from "./scenes/SceneCTA";

// 30 seconds @ 30fps = 900 frames
// Scene timing (frames):
//  0–210  (0–7s)   : Hero        "Give your company a soul."
//  180–390 (6–13s) : Problem     "Most AI tools are blank slates."
//  360–570 (12–19s): Identity    "Every agent has a unique identity."
//  540–720 (18–24s): Culture     "Encode your culture as policy."
//  690–900 (23–30s): CTA         Logo + deploy message

const SCENE_HERO_START     = 0;
const SCENE_PROBLEM_START  = 180;
const SCENE_IDENTITY_START = 360;
const SCENE_CULTURE_START  = 540;
const SCENE_CTA_START      = 690;

export const VaultysClawPromo: React.FC = () => (
  <AbsoluteFill style={{ background: "#0d1117", fontFamily: "Inter, -apple-system, sans-serif" }}>
    <Sequence from={SCENE_HERO_START} durationInFrames={240}>
      <SceneHero />
    </Sequence>

    <Sequence from={SCENE_PROBLEM_START} durationInFrames={240}>
      <SceneProblem />
    </Sequence>

    <Sequence from={SCENE_IDENTITY_START} durationInFrames={240}>
      <SceneIdentity />
    </Sequence>

    <Sequence from={SCENE_CULTURE_START} durationInFrames={240}>
      <SceneCulture />
    </Sequence>

    <Sequence from={SCENE_CTA_START} durationInFrames={210}>
      <SceneCTA />
    </Sequence>
  </AbsoluteFill>
);
