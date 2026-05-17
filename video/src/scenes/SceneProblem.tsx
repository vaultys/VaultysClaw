import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp } from "../helpers";

const TOTAL = 240;

const PROBLEMS = [
  { frame: 30,  icon: "⬡", color: "#ef4444", text: "No memory of who you are" },
  { frame: 75,  icon: "⬡", color: "#f59e0b", text: "No stake in your outcomes" },
  { frame: 120, icon: "⬡", color: "#ef4444", text: "No accountability when things go wrong" },
];

export const SceneProblem: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);

  const titleSlide = useSlideUp(5, 22);
  const subtitleSlide = useSlideUp(18, 22);

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: "linear-gradient(160deg, #0d1117 0%, #0f172a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Grid */}
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(96,165,250,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: 1100, padding: "0 80px" }}>
        {/* Label */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: BRAND.purple400,
            marginBottom: 20,
            opacity: titleSlide.opacity,
            transform: `translateY(${titleSlide.y}px)`,
            fontFamily: MONO,
          }}
        >
          The problem
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 900,
            color: BRAND.text,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginBottom: 16,
            opacity: titleSlide.opacity,
            transform: `translateY(${titleSlide.y}px)`,
          }}
        >
          Most AI tools are blank slates.
        </div>

        <div
          style={{
            fontSize: 26,
            color: BRAND.muted,
            marginBottom: 72,
            opacity: subtitleSlide.opacity,
            transform: `translateY(${subtitleSlide.y}px)`,
          }}
        >
          You rent them from a cloud provider. They have no stake in your outcomes.
        </div>

        {/* Problem items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {PROBLEMS.map(({ frame: startFrame, icon, color, text }, i) => {
            const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const x = interpolate(frame, [startFrame, startFrame + 25], [-40, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  opacity,
                  transform: `translateX(${x}px)`,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: `rgba(239,68,68,0.12)`,
                    border: `1px solid rgba(239,68,68,0.25)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 22,
                    color,
                  }}
                >
                  ✕
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: BRAND.text }}>
                  {text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
