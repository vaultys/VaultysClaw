import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp, useScaleIn } from "../helpers";

const TOTAL = 300;

const STATS = [
  { label: "Realm", value: "Research" },
  { label: "Model", value: "claude-sonnet" },
  { label: "Role", value: "Analyst" },
  { label: "Intents", value: "2,841 today" },
];

// Fewer tags, appear earlier so they're readable for ~4 s before fade-out
const TAGS = ["direct comms", "cite sources", "concise", "EMEA-aware"];

export const SceneIdentity: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);

  const titleSlide = useSlideUp(5, 22);
  const card = useScaleIn(30);

  const cardX = interpolate(
    spring({ frame: frame - 30, fps, config: { damping: 16, stiffness: 80 } }),
    [0, 1], [120, 0]
  );

  const pulse = interpolate(Math.sin((frame / 15) * Math.PI), [-1, 1], [0.7, 1.0]);

  // Tags appear at frame 70 — visible for ~140 frames = 4.7 s before fade
  const tagOp = (i: number) =>
    interpolate(frame, [70 + i * 12, 85 + i * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: "linear-gradient(135deg,#0d1117 0%,#0f172a 60%,#150d2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "absolute", right: 240, top: "50%", transform: "translateY(-50%)", width: 540, height: 540, background: "radial-gradient(ellipse,rgba(124,58,237,0.18) 0%,transparent 70%)", pointerEvents: "none" }} />

      <div style={{ padding: "0 80px", display: "flex", alignItems: "center", gap: 100 }}>
        {/* Left copy */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: BRAND.blue400, marginBottom: 20, opacity: titleSlide.opacity, transform: `translateY(${titleSlide.y}px)`, fontFamily: MONO }}>
            VaultysId
          </div>
          <div style={{ fontSize: 100, fontWeight: 900, color: BRAND.text, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 20, opacity: titleSlide.opacity, transform: `translateY(${titleSlide.y}px)` }}>
            Every agent.<br />A unique identity.
          </div>
          {/* Punchy three-word descriptor instead of long sentence */}
          <div style={{ fontSize: 40, color: BRAND.muted, lineHeight: 1.5, opacity: titleSlide.opacity, transform: `translateY(${titleSlide.y}px)` }}>
            Cryptographic. Non-transferable. Auditable.
          </div>
        </div>

        {/* Right card */}
        <div style={{ width: 800, flexShrink: 0, opacity: card.opacity, transform: `translateX(${cardX}px) scale(${card.scale})` }}>
          <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: "28px 32px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50 }}>🧠</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 40, color: BRAND.text }}>alice-research</div>
                  <div style={{ fontSize: 25, color: BRAND.muted, fontFamily: MONO, marginTop: 4 }}>did:vaultys:z6Mkf9x3TQ…</div>
                </div>
              </div>
              <div style={{ background: "rgba(16,185,129,0.12)", color: BRAND.green, padding: "4px 14px", borderRadius: 100, fontSize: 30, fontWeight: 700, border: "1px solid rgba(16,185,129,0.22)", opacity: pulse }}>
                ● online
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {STATS.map(({ label, value }) => (
                <div key={label} style={{ background: "#1c2128", border: "1px solid #21262d", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 20, color: BRAND.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 30, fontWeight: 600, color: BRAND.text }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid #21262d", paddingTop: 16 }}>
              <div style={{ fontSize: 20, color: BRAND.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 12 }}>Culture profile</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TAGS.map((tag, i) => (
                  <span key={tag} style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)", color: BRAND.blue400, padding: "3px 10px", borderRadius: 6, fontSize: 24, fontWeight: 600, fontFamily: MONO, opacity: tagOp(i) }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: "20px 28px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🛡</div>
            <div>
              <div style={{ fontSize: 25, fontWeight: 700, color: BRAND.purple400, textTransform: "uppercase", letterSpacing: "0.08em" }}>Signed Policy v4</div>
              <div style={{ fontSize: 25, color: BRAND.muted, fontFamily: MONO, marginTop: 4 }}>sig: a3f9b2…d04c ✓</div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
