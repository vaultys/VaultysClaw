import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, MONO, useSceneOpacity, useFadeIn } from "../helpers";

const TOTAL = 500;

const BULLETS = [
  "Open Source  ·  MIT License  ·  Self-hosted",
];

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneOpacity = useSceneOpacity(TOTAL, 20, 30);

  // Logo mark
  const logoScale = spring({ frame: frame - 5, fps, config: { damping: 14, stiffness: 80 } });
  const logoOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Headline words stagger
  const word = (start: number) => ({
    opacity: interpolate(frame, [start, start + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    y: interpolate(
      spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 90 } }),
      [0, 1], [30, 0]
    ),
  });

  const line1a = word(30);
  const line1b = word(50);
  const line2a = word(70);
  const line2b = word(90);
  const line2c = word(110);

  // Subtitle
  const subOpacity = interpolate(frame, [120, 145], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Buttons
  const btn1Opacity = interpolate(frame, [145, 165], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const btn2Opacity = interpolate(frame, [160, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // URL badge
  const urlOpacity = interpolate(frame, [175, 195], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Radial pulse behind logo
  const pulse = Math.sin((frame / 40) * Math.PI) * 0.5 + 0.5;
  const glowR = interpolate(pulse, [0, 1], [200, 280]);

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: "linear-gradient(135deg, #0f172a 0%, #150d2e 60%, #0f172a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      {/* Animated background glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${glowR}px ${glowR * 0.7}px at 50% 50%, rgba(124,58,237,0.14) 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Dot grid */}
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <div
        style={{
          marginBottom: 32,
          opacity: logoOpacity,
          transform: `scale(${interpolate(logoScale, [0, 1], [0.6, 1])})`,
        }}
      >
        <Img
          src={staticFile("vaultys-logo.svg")}
          style={{ height: 72, filter: "drop-shadow(0 0 24px rgba(124,58,237,0.5))" }}
        />
      </div>

      {/* Meta tag */}
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: BRAND.blue400,
          textTransform: "uppercase",
          marginBottom: 32,
          opacity: line1a.opacity,
          fontFamily: MONO,
        }}
      >
        Open Source · MIT License · Self-hosted
      </div>

      {/* Headline — word by word */}
      <div
        style={{
          fontSize: 88,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          marginBottom: 28,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginBottom: 10 }}>
          {[
            { text: "Your", style: line1a },
            { text: "culture", style: line1b },
          ].map(({ text, style }) => (
            <span
              key={text}
              style={{
                color: BRAND.text,
                opacity: style.opacity,
                display: "inline-block",
                transform: `translateY(${style.y}px)`,
              }}
            >
              {text}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap" }}>
          {[
            { text: "deserves", style: line2a, color: BRAND.text },
            { text: "agents", style: line2b, color: "#a78bfa" },
          ].map(({ text, style, color }) => (
            <span
              key={text}
              style={{
                color,
                opacity: style.opacity,
                display: "inline-block",
                transform: `translateY(${style.y}px)`,
              }}
            >
              {text}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span
            style={{
              color: BRAND.text,
              opacity: line2c.opacity,
              display: "inline-block",
              transform: `translateY(${line2c.y}px)`,
            }}
          >
            that carry it faithfully.
          </span>
        </div>
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 40,
          color: BRAND.muted,
          lineHeight: 1.65,
          marginBottom: 56,
          opacity: subOpacity,
        }}
      >
        On your infra. Your policies. No lock-in. Five minutes.
      </div>

      {/* URL */}
      <div
        style={{
          fontSize: 35,
          color: BRAND.muted,
          fontFamily: MONO,
          opacity: urlOpacity,
          letterSpacing: "0.04em",
        }}
      >
        vaultys.com
      </div>
    </AbsoluteFill>
  );
};
