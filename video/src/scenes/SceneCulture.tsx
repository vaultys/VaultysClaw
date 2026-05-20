import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp } from "../helpers";

const TOTAL = 300;

const FEATURES = [
  {
    icon: "🧠",
    color: "#a78bfa",
    bg: "rgba(124,58,237,0.12)",
    border: "rgba(124,58,237,0.25)",
    title: "Encode your culture as policy",
    frame: 30,
  },
  {
    icon: "👥",
    color: "#60a5fa",
    bg: "rgba(29,78,216,0.12)",
    border: "rgba(29,78,216,0.25)",
    title: "Your org chart, reflected in AI",
    frame: 90,
  },
  {
    icon: "⚡",
    color: "#34d399",
    bg: "rgba(16,185,129,0.1)",
    border: "rgba(16,185,129,0.22)",
    title: "Real-time coordination",
    frame: 150,
  },
];

const CODE = `const response = await fetch("/api/intents", {
  method: "POST",
  body: JSON.stringify({
    agentId: "did:vaultys:z6Mkf9x3T...",
    action: "brief_ceo",
    params: {
      tone: "direct",        // your company voice
      format: "3-bullet-max", // your style
      cite_sources: true,     // your quality bar
    },
  }),
});`;

export const SceneCulture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);
  const titleSlide = useSlideUp(5, 22);

  // Code panel slides in from right
  const codePanelX = interpolate(
    spring({ frame: frame - 40, fps, config: { damping: 16, stiffness: 80 } }),
    [0, 1], [80, 0]
  );
  const codePanelOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: "linear-gradient(135deg, #0d1117 0%, #0f172a 60%, #0d1117 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(circle, rgba(167,139,250,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          pointerEvents: "none",
        }}
      />

      <div style={{ padding: "0 80px", display: "flex", gap: 80, alignItems: "flex-start" }}>
        {/* Left: features */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
            What you get
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: BRAND.text,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: 48,
              opacity: titleSlide.opacity,
              transform: `translateY(${titleSlide.y}px)`,
            }}
          >
            Your culture,<br />deployed as policy.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {FEATURES.map(({ icon, color, bg, border, title, desc, frame: startFrame }, i) => {
              const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const x = interpolate(frame, [startFrame, startFrame + 25], [-30, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div key={i} style={{ display: "flex", gap: 100, alignItems: "flex-start", opacity, transform: `translateX(${x}px)` }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: bg,
                      border: `1px solid ${border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 45,
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 40, fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>{title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: code panel */}
        <div
          style={{
            width: 820,
            flexShrink: 0,
            opacity: codePanelOpacity,
            transform: `translateX(${codePanelX}px)`,
          }}
        >
          <div
            style={{
              background: "#0d1117",
              border: `1px solid ${BRAND.border}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 20px",
                background: BRAND.surface,
                borderBottom: `1px solid #21262d`,
              }}
            >
              <span
                style={{
                  background: "#238636",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 25,
                  fontWeight: 700,
                }}
              >
                POST
              </span>
              <span style={{ fontSize: 30, color: BRAND.muted, fontFamily: MONO }}>/api/intents</span>
            </div>
            <pre
              style={{
                margin: 0,
                padding: "24px",
                fontFamily: MONO,
                fontSize: 25,
                lineHeight: 1.7,
                color: "#c9d1d9",
                overflowX: "auto",
              }}
            >
              {CODE.split("\n").map((line, i) => {
                const lineOpacity = interpolate(frame, [55 + i * 6, 70 + i * 6], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const highlight = line.includes("tone") || line.includes("format") || line.includes("cite_sources");
                return (
                  <div
                    key={i}
                    style={{
                      opacity: lineOpacity,
                      color: highlight ? "#79c0ff" : undefined,
                    }}
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
