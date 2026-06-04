import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp } from "../helpers";

const TOTAL = 300;

// Shorter bullets — punchy, early enough to read for 4+ s each
const PROBLEMS = [
  { frame: 40, text: "No memory of who you are." },
  { frame: 85, text: "No ownership of the outcome." },
  { frame: 130, text: "No accountability when it fails." },
];

export const SceneProblem: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);
  const titleSlide = useSlideUp(5, 22);

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
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(96,165,250,0.03) 1px,transparent 1px)," +
            "linear-gradient(90deg,rgba(96,165,250,0.03) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      />

      <div style={{ padding: "0 80px" }}>
        <div
          style={{
            fontSize: 30,
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

        {/* Punchy headline — no redundant subtitle */}
        <div
          style={{
            fontSize: 100,
            fontWeight: 900,
            color: BRAND.text,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginBottom: 64,
            opacity: titleSlide.opacity,
            transform: `translateY(${titleSlide.y}px)`,
          }}
        >
          AI agents are strangers.
        </div>

        {/* Three bullets — appear early, readable for 3–4 s each */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {PROBLEMS.map(({ frame: sf, text }, i) => {
            const op = interpolate(frame, [sf, sf + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const x = interpolate(frame, [sf, sf + 22], [-40, 0], {
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
                  opacity: op,
                  transform: `translateX(${x}px)`,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 50,
                    fontWeight: 1000,
                    color: "#ef4444",
                  }}
                >
                  ✕
                </div>
                <div
                  style={{ fontSize: 80, fontWeight: 600, color: BRAND.text }}
                >
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
