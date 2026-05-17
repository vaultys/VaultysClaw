import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp, useScaleIn } from "../helpers";

const TOTAL = 240;

const STATS = [
  { label: "Realm",   value: "Research" },
  { label: "Model",   value: "claude-sonnet" },
  { label: "Role",    value: "Analyst" },
  { label: "Intents", value: "2,841 today" },
];

const TAGS = ["direct comms", "data-driven", "cite sources", "concise", "EMEA-aware"];

export const SceneIdentity: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);

  const titleSlide = useSlideUp(5, 22);
  const card = useScaleIn(35);

  // Card slide from right
  const cardX = interpolate(
    spring({ frame: frame - 35, fps, config: { damping: 16, stiffness: 80 } }),
    [0, 1], [120, 0]
  );

  // "online" badge pulse
  const pulse = interpolate(Math.sin((frame / 15) * Math.PI), [-1, 1], [0.7, 1.0]);

  // Tag reveal
  const tagOpacity = (i: number) =>
    interpolate(frame, [110 + i * 15, 130 + i * 15], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: "linear-gradient(135deg, #0d1117 0%, #0f172a 60%, #150d2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Glow behind card */}
      <div
        style={{
          position: "absolute",
          right: 240,
          top: "50%",
          transform: "translateY(-50%)",
          width: 540,
          height: 540,
          background: "radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: 1300,
          padding: "0 80px",
          display: "flex",
          alignItems: "center",
          gap: 100,
        }}
      >
        {/* Left: copy */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: BRAND.blue400,
              marginBottom: 20,
              opacity: titleSlide.opacity,
              transform: `translateY(${titleSlide.y}px)`,
              fontFamily: MONO,
            }}
          >
            VaultysId — The soul of your agents
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 900,
              color: BRAND.text,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: 24,
              opacity: titleSlide.opacity,
              transform: `translateY(${titleSlide.y}px)`,
            }}
          >
            Every agent has a unique, non-transferable identity.
          </div>
          <div
            style={{
              fontSize: 22,
              color: BRAND.muted,
              lineHeight: 1.65,
              opacity: titleSlide.opacity,
              transform: `translateY(${titleSlide.y}px)`,
            }}
          >
            A cryptographic fingerprint that is yours, governed by your
            policies, and auditable to any action it ever took.
          </div>
        </div>

        {/* Right: agent card */}
        <div
          style={{
            width: 460,
            flexShrink: 0,
            opacity: card.opacity,
            transform: `translateX(${cardX}px) scale(${card.scale})`,
          }}
        >
          {/* Identity card */}
          <div
            style={{
              background: BRAND.surface,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 16,
              padding: "28px 32px",
              marginBottom: 16,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  🧠
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: BRAND.text }}>alice-research</div>
                  <div style={{ fontSize: 12, color: BRAND.muted, fontFamily: MONO, marginTop: 4 }}>
                    did:vaultys:z6Mkf9x3TQ…
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: "rgba(16,185,129,0.12)",
                  color: BRAND.green,
                  padding: "4px 14px",
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 700,
                  border: "1px solid rgba(16,185,129,0.22)",
                  opacity: pulse,
                }}
              >
                ● online
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {STATS.map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    background: "#1c2128",
                    border: `1px solid #21262d`,
                    borderRadius: 10,
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontSize: 10, color: BRAND.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: BRAND.text }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Culture tags */}
            <div style={{ borderTop: `1px solid #21262d`, paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: BRAND.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 12 }}>
                Culture profile
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TAGS.map((tag, i) => (
                  <span
                    key={tag}
                    style={{
                      background: "rgba(96,165,250,0.08)",
                      border: "1px solid rgba(96,165,250,0.18)",
                      color: BRAND.blue400,
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: MONO,
                      opacity: tagOpacity(i),
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Policy card */}
          <div
            style={{
              background: BRAND.surface,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 16,
              padding: "20px 28px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              🛡
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.purple400, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Signed Policy v4
              </div>
              <div style={{ fontSize: 12, color: BRAND.muted, fontFamily: MONO, marginTop: 4 }}>
                sig: a3f9b2…d04c ✓
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
