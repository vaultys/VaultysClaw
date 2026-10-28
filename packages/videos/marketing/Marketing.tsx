import React from "react";
import { ExplainerFrame, explainerFrames as frames } from "../explainer/kit";
import { FPS } from "../intro/Intro";
import { CentralScene, HookScene, QuestionsScene } from "./problem";
import { ClosingScene, DomainsScene, FrugalScene, KillswitchScene, QuantumScene, VisibilityScene } from "./product";
import { ArchitectureScene, IdentityScene, ImmunityScene, RightsScene, SolutionScene } from "./solution";
import type { MarketingProps, SceneProps } from "./types";

/**
 * The VaultysClaw marketing video: how it works and why it is better, narrated
 * (marketing.narration.json), animated after the investor deck's look, with real console footage
 * (marketing-screens/) in its browser windows. The argument follows vaultys.com's product page and
 * the deck, without the deck's financials: the problem (agents everywhere, Shadow AI, one directory
 * holding every identity), the model (an agent is an employee: an identity, rights), how it works
 * (identity, certificate, control plane + peer to peer), and what that buys (no single target, the
 * kill switch, visibility and a signed log, post-quantum, frugal and sovereign, the access domains).
 */

export const SCENES = [
  { id: "hook", lines: ["hook1", "hook2"] },
  { id: "questions", lines: ["questions", "shadow"] },
  { id: "central", lines: ["central", "spread"] },
  { id: "solution", lines: ["solution", "control"] },
  { id: "identity", lines: ["identity", "nopassword"] },
  { id: "rights", lines: ["rights", "certificate"] },
  { id: "architecture", lines: ["plane", "p2p"] },
  { id: "immunity", lines: ["notarget", "contained"] },
  { id: "killswitch", lines: ["killswitch", "restore"] },
  { id: "visibility", lines: ["visibility", "audit"] },
  { id: "quantum", lines: ["harvest", "pqc"] },
  { id: "frugal", lines: ["frugal", "sovereign"] },
  { id: "domains", lines: ["domains", "coverage"] },
  { id: "closing", lines: ["closing"] },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

const RENDER: Record<SceneId, (p: SceneProps) => React.ReactNode> = {
  hook: HookScene,
  questions: QuestionsScene,
  central: CentralScene,
  solution: SolutionScene,
  identity: IdentityScene,
  rights: RightsScene,
  architecture: ArchitectureScene,
  immunity: ImmunityScene,
  killswitch: KillswitchScene,
  visibility: VisibilityScene,
  quantum: QuantumScene,
  frugal: FrugalScene,
  domains: DomainsScene,
  closing: ClosingScene,
};

export const marketingFrames = (durations: Record<string, number>) => frames(SCENES, durations);

export const Marketing: React.FC<MarketingProps> = ({ texts, durations, clawLogo, footage }) => (
  <ExplainerFrame
    list={SCENES}
    durations={durations}
    chapter={(id) => texts.chapters[id as SceneId]}
    scene={(id, at, length) => {
      const Scene = RENDER[id as SceneId];
      return <Scene t={texts} at={at} length={length} logo={clawLogo} footage={footage} />;
    }}
    // Red behind the attacks, a teal calm once they are contained.
    mood={(frame, tl) => {
      const span = (line: string, a: number, b: number) => {
        const l = tl.lines[line];
        const x = (frame / FPS - l.start) / l.duration;
        return x < a ? 0 : x > b ? 1 : (x - a) / (b - a);
      };
      const spread = span("spread", 0.1, 0.5) * (1 - span("solution", -0.3, 0));
      const shadow = span("shadow", 0.1, 0.5) * 0.5 * (1 - span("central", -0.2, 0.1));
      const struck = span("notarget", 0.6, 0.8) * 0.6 * (1 - span("contained", 0.3, 0.7));
      const calm = span("contained", 0.5, 0.9) * (1 - span("killswitch", -0.2, 0));
      return { danger: Math.max(spread, shadow, struck), calm };
    }}
  />
);

