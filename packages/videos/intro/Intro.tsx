import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * The animated bumpers around every video, in two scenes:
 * - Vaultys: violet, the shield, "Vaultys" and its tagline ("Simple, Sécurisé, Souverain");
 * - VaultysClaw: the brand orange, its wordmark in white, and a line of text.
 * The intro goes Vaultys → VaultysClaw (the video's subject); the outro mirrors it,
 * VaultysClaw (the video's closing line) → Vaultys, with a call to action.
 * The second scene of each opens over the first as a circle growing from the centre.
 */

export type IntroProps = {
  /** Vaultys' tagline, one word per beat: ["Simple", "Sécurisé", "Souverain"]. */
  tagline: string[];
  /** The line under the VaultysClaw logo: the video's subject (intro) or closing line (outro). */
  title: string;
  /** Under the tagline at the end of the outro, e.g. "vaultys.com". Not shown by the intro. */
  cta?: string;
  /** Data URIs of the two logos, both white for the coloured backgrounds: Vaultys' shield, VaultysClaw's wordmark. */
  vaultysLogo: string;
  clawLogo: string;
};

export const VAULTYS = "#4f386e";
/** VaultysClaw's orange, its logo's. */
export const CLAW = "#d35400";
export const FPS = 30;
/** Intro: the VaultysClaw scene opens at SWITCH; the intro's length depends on its title (introFrames). */
export const SWITCH = 96;
/** Frames the whole title stays on screen, once its last word is in: 5 s to read it. */
const READ = 150;
/** The cross-fade into the recording (render.ts FADE): the title must be readable before it. */
const FADE_OUT = 18;

/**
 * The intro's length for a title: the VaultysClaw scene's words come in one every 3 frames from
 * SWITCH + 28, each rising over 12 frames; then READ frames with the whole title, then the fade.
 */
export function introFrames(title: string) {
  const words = title.split(" ").length;
  return SWITCH + 28 + 3 * (words - 1) + 12 + READ + FADE_OUT;
}
/** Outro: the Vaultys scene opens at OUTRO_SWITCH; the outro ends at OUTRO_DURATION. */
export const OUTRO_SWITCH = 108;
export const OUTRO_DURATION = 240;
/** Frames the circle takes to open. */
const REVEAL = 20;

export const FONT = "Montserrat, Inter, sans-serif";

/** Fade + rise from `from`, over `frames`. */
export function useRise(from: number, frames = 14, distance = 36) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, from + frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return { opacity: t, transform: `translateY(${(1 - t) * distance}px)` };
}

/** Slow drifting rings: depth behind the logos, never drawing the eye. */
export function Rings() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {[0, 1, 2, 3].map((i) => {
        const size = 520 + i * 360;
        const scale = 1 + Math.sin((frame + i * 25) / 40) * 0.02 + frame / 3000;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 960 - size / 2,
              top: 470 - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              border: "2px solid #ffffff",
              opacity: 0.1 - i * 0.02,
              transform: `scale(${scale})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/** Its children, inside a circle that opens from the centre over what lies beneath. */
export function CircleReveal({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, REVEAL], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return <AbsoluteFill style={{ clipPath: `circle(${t * 120}% at 50% 45%)` }}>{children}</AbsoluteFill>;
}

/** Recedes from `exitAt` (in the scene's own frames) while the next scene opens over it. */
function useExit(exitAt?: number) {
  const frame = useCurrentFrame();
  if (exitAt === undefined) return 1;
  return interpolate(frame, [exitAt - 6, exitAt + 14], [1, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
}

/** The Vaultys scene; its animations start at its own frame 0. */
export function VaultysScene({ tagline, logo, cta, exitAt }: { tagline: string[]; logo: string; cta?: string; exitAt?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 110, mass: 0.8 } });
  const glow = interpolate(frame, [10, 40, 90], [0, 1, 0.6], { extrapolateRight: "clamp" });
  const exit = useExit(exitAt);
  const name = useRise(18, 16, 30);
  const action = useRise(40 + tagline.length * 11 + 6, 16, 24);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, #6d5394 0%, ${VAULTYS} 42%, #24182f 100%)` }}>
      <Rings />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${exit})` }}>
        <Img
          src={logo}
          style={{
            height: 250,
            transform: `scale(${0.55 + pop * 0.45}) rotate(${(1 - pop) * -8}deg)`,
            opacity: Math.min(1, pop * 1.4),
            filter: `drop-shadow(0 0 ${30 * glow}px rgba(255,255,255,${0.35 * glow}))`,
          }}
        />
        <div style={{ ...name, marginTop: 34, fontFamily: FONT, fontWeight: 700, fontSize: 112, color: "white", letterSpacing: 4 }}>Vaultys</div>
        <div style={{ display: "flex", gap: 22, marginTop: 26, fontFamily: FONT, fontWeight: 500, fontSize: 46, color: "#e8def5", letterSpacing: 1 }}>
          {tagline.map((word, i) => (
            <TaglineWord key={word} word={word} from={40 + i * 11} last={i === tagline.length - 1} />
          ))}
        </div>
        {cta && (
          <div
            style={{
              ...action,
              marginTop: 54,
              padding: "16px 44px",
              borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.1)",
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 40,
              color: "white",
              letterSpacing: 2,
            }}
          >
            {cta}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function TaglineWord({ word, from, last }: { word: string; from: number; last: boolean }) {
  const style = useRise(from, 12, 24);
  return (
    <span style={style}>
      {word}
      {last ? "" : ","}
    </span>
  );
}

/**
 * The VaultysClaw scene; its animations start at its own frame 0. On the brand orange, the
 * wordmark in white (intro/assets/claw-wordmark-white.png): the shield pops, then the name is wiped
 * in from behind it.
 */
export function ClawScene({ text, logo, logoAt = 8, exitAt }: { text: string; logo: string; logoAt?: number; exitAt?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - logoAt, fps, config: { damping: 14, stiffness: 120 } });
  const exit = useExit(exitAt);
  // The shield is the first ~15 % of the wordmark's width.
  const wipe = interpolate(frame, [logoAt + 6, logoAt + 28], [15, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  // A soft band of light crossing the scene once the logo has landed.
  const sweep = interpolate(frame, [logoAt + 26, logoAt + 54], [-0.4, 1.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, #ec6a12 0%, ${CLAW} 45%, #9c3d00 100%)` }}>
      <Rings />
      <AbsoluteFill
        style={{
          background: "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
          width: 700,
          left: `${sweep * 100}%`,
          transform: "translateX(-50%) skewX(-12deg)",
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${exit})` }}>
        <div style={{ opacity: Math.min(1, pop * 1.5), transform: `scale(${0.8 + pop * 0.2})`, filter: "drop-shadow(0 14px 34px rgba(60,20,0,0.35))" }}>
          <Img src={logo} style={{ width: 1240, clipPath: `inset(0 ${100 - wipe}% 0 0)` }} />
        </div>
        <div
          style={{
            marginTop: 72,
            maxWidth: 1460,
            textAlign: "center",
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: 62,
            lineHeight: 1.25,
            color: "white",
            textWrap: "balance",
            textShadow: "0 4px 18px rgba(60,20,0,0.3)",
          }}
        >
          {text.split(" ").map((word, i) => (
            <TitleWord key={i} word={word} from={logoAt + 20 + i * 3} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function TitleWord({ word, from }: { word: string; from: number }) {
  const style = useRise(from, 12, 28);
  return <span style={{ ...style, display: "inline-block", whiteSpace: "pre" }}>{word} </span>;
}

/** Vaultys, then VaultysClaw and the video's subject. */
export const Intro: React.FC<IntroProps> = ({ tagline, title, vaultysLogo, clawLogo }) => (
  <AbsoluteFill style={{ backgroundColor: VAULTYS }}>
    <VaultysScene tagline={tagline} logo={vaultysLogo} exitAt={SWITCH} />
    <Sequence from={SWITCH}>
      <CircleReveal>
        <ClawScene text={title} logo={clawLogo} />
      </CircleReveal>
    </Sequence>
  </AbsoluteFill>
);

/** VaultysClaw and the closing line, then Vaultys and the call to action, fading out. */
export const Outro: React.FC<IntroProps> = ({ tagline, title, cta, vaultysLogo, clawLogo }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [OUTRO_DURATION - 16, OUTRO_DURATION - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: CLAW }}>
      <ClawScene text={title} logo={clawLogo} logoAt={2} exitAt={OUTRO_SWITCH} />
      <Sequence from={OUTRO_SWITCH}>
        <CircleReveal>
          <VaultysScene tagline={tagline} logo={vaultysLogo} cta={cta} />
        </CircleReveal>
      </Sequence>
      <AbsoluteFill style={{ backgroundColor: "#140d1c", opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
