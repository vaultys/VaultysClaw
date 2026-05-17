import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp } from "../helpers";

const TOTAL = 240;

export const SceneHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);

  // Badge
  const badge = useSlideUp(5, 20);
  // "Give your company"
  const line1 = useSlideUp(25, 25);
  // "a soul."
  const line2Spring = spring({ frame: frame - 60, fps, config: { damping: 12, stiffness: 70 } });
  const line2Opacity = interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line2Scale = interpolate(line2Spring, [0, 1], [0.9, 1]);
  // Subtitle
  const sub = useSlideUp(100, 25);
  // Accent line
  const accentWidth = interpolate(frame, [130, 180], [0, 340], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: "linear-gradient(135deg, #0d1117 0%, #0f172a 55%, #1a0533 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Dot-grid background */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(96,165,250,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />

      {/* Radial glow */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 30% 45%, rgba(29,78,216,0.18) 0%, transparent 65%)," +
            "radial-gradient(ellipse 55% 45% at 75% 60%, rgba(124,58,237,0.14) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ textAlign: "center", maxWidth: 1100, padding: "0 80px", position: "relative" }}>
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.35)",
            borderRadius: 100,
            padding: "8px 20px",
            marginBottom: 40,
            opacity: badge.opacity,
            transform: `translateY(${badge.y}px)`,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Enterprise AI Orchestration
          </span>
        </div>

        {/* "Give your company" */}
        <div
          style={{
            fontSize: 108,
            fontWeight: 900,
            lineHeight: 1.0,
            color: BRAND.text,
            opacity: line1.opacity,
            transform: `translateY(${line1.y}px)`,
            marginBottom: 8,
            letterSpacing: "-0.03em",
          }}
        >
          Give your company
        </div>

        {/* "a soul." */}
        <div
          style={{
            fontSize: 108,
            fontWeight: 900,
            lineHeight: 1.0,
            opacity: line2Opacity,
            transform: `scale(${line2Scale})`,
            marginBottom: 56,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          a soul.
        </div>

        {/* Accent line */}
        <div
          style={{
            height: 3,
            width: accentWidth,
            margin: "0 auto 48px",
            background: "linear-gradient(90deg, #1d4ed8, #7c3aed, #f472b6)",
            borderRadius: 2,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            color: BRAND.muted,
            lineHeight: 1.6,
            maxWidth: 720,
            margin: "0 auto",
            opacity: sub.opacity,
            transform: `translateY(${sub.y}px)`,
          }}
        >
          Your culture, your processes, your values — deployed as
          professional AI agents that work the way <em style={{ color: BRAND.text }}>you</em> do.
        </div>
      </div>
    </AbsoluteFill>
  );
};
