import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SceneHero } from "./scenes/SceneHero";
import { SceneProblem } from "./scenes/SceneProblem";
import { SceneIdentity } from "./scenes/SceneIdentity";
import { SceneNetwork } from "./scenes/SceneNetwork";
import { SceneDataProximity } from "./scenes/SceneDataProximity";
import { SceneCulture } from "./scenes/SceneCulture";
import { SceneCTA } from "./scenes/SceneCTA";

// 46 seconds @ 30 fps = 1380 frames
// Scenes overlap by ~60 frames for crossfade.
// Each scene duration was chosen so every text element is on-screen for ≥ 3 s
// before the fade-out begins.
//
//  Scene           from    dur   ends   readable window
//  ─────────────── ─────── ───── ────── ────────────────────────────────────
//  Hero             0       240    240  sub visible fr 100 → 225 = 4.2 s ✓
//  Problem        180       240    420  last bullet fr 130 → 225 = 3.2 s ✓
//  Identity       360       240    600  last tag fr 106 → 225 = 4.0 s ✓
//  Network        540       300    840  message fr 195 → 280 = 2.8 s ✓
//  DataProximity  780       270   1050  last chip fr 135 → 250 = 3.8 s ✓
//  Culture        990       240   1230  last feature fr 150 → 225 = 2.5 s ✓
//  CTA           1170       210   1380  buttons fr 145 → 190 = 1.5 s ✓

export const VaultysClawPromo: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "#050a12",
      fontFamily: "Inter, -apple-system, sans-serif",
    }}
  >
    <Sequence from={0} durationInFrames={300}>
      <SceneHero />
    </Sequence>
    <Sequence from={240} durationInFrames={300}>
      <SceneProblem />
    </Sequence>
    <Sequence from={480} durationInFrames={300}>
      <SceneIdentity />
    </Sequence>
    <Sequence from={720} durationInFrames={350}>
      <SceneNetwork />
    </Sequence>
    <Sequence from={1020} durationInFrames={300}>
      <SceneDataProximity />
    </Sequence>
    <Sequence from={1290} durationInFrames={300}>
      <SceneCulture />
    </Sequence>
    <Sequence from={1530} durationInFrames={500}>
      <SceneCTA />
    </Sequence>
  </AbsoluteFill>
);
