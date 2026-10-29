import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { DISPLAY, FONT, NAVY, ORANGE, ORANGE_LIGHT } from "../explainer/kit";

/**
 * A video's thumbnail (YouTube, LinkedIn…), 1920×1080, rendered as a still — ported from
 * VaultysHub's `e2e/videos/thumbnail/`, in VaultysClaw's colours: a short hook in very large type
 * on the left (the marketing video's display face), one part of it in colour; a frame of the video
 * on the right, zoomed on what matters, in a tilted window; a sticker across them; the wordmark.
 * Made to be read at the size of a phone's thumbnail: few words, big, high contrast.
 */

export type Tone = "green" | "red" | "gold" | "orange";

export type ThumbnailProps = {
  /** Small, above the hook: the video's theme. */
  eyebrow: string;
  /** The hook, 2 to 6 words; `highlight` (a part of it) is drawn in the tone's colour. */
  hook: string;
  highlight: string;
  /** The sticker across the picture, e.g. "Accès refusé", "1 minute". */
  sticker: string;
  tone: Tone;
  /** The highlight's colour, if not the tone's. */
  accent?: Tone;
  /** The frame (data URI), its natural size, and what to zoom on: focus as fractions of the frame. */
  image: string;
  imageSize: [number, number];
  focus: [number, number];
  zoom: number;
  /** VaultysClaw's wordmark for a dark background (intro/assets/claw-wordmark-light.png). */
  logo: string;
};

export const COLORS: Record<Tone, string> = { green: "#2ee6b6", red: "#ff4d6d", gold: "#f5c451", orange: ORANGE_LIGHT };
const ICONS: Record<Tone, string> = { green: "✓", red: "✕", gold: "!", orange: "⚡" };

const CARD = { left: 930, top: 150, width: 1100, height: 790 };

/** The frame, cover-fitted to the card, zoomed around `focus`, never showing past its edges. */
function Frame({ image, imageSize: [w0, h0], focus: [fx, fy], zoom }: Pick<ThumbnailProps, "image" | "imageSize" | "focus" | "zoom">) {
  const s = Math.max(CARD.width / w0, CARD.height / h0) * zoom;
  const w = w0 * s;
  const h = h0 * s;
  const left = Math.min(0, Math.max(CARD.width - w, CARD.width / 2 - fx * w));
  const top = Math.min(0, Math.max(CARD.height - h, CARD.height / 2 - fy * h));
  return <Img src={image} style={{ position: "absolute", left, top, width: w, height: h }} />;
}

/** The hook, with `highlight` coloured and underlined by a marker stroke. */
function Hook({ hook, highlight, color }: { hook: string; highlight: string; color: string }) {
  // French typography: a no-break space before ? : ! so they never start a line on their own.
  // And a number stays with the word it counts ("1 minute", "0 mot de passe").
  const nb = (t: string) => t.replace(/ ([?:!])/g, " $1").replace(/(\d) /g, "$1 ");
  hook = nb(hook);
  highlight = nb(highlight);
  const at = highlight ? hook.indexOf(highlight) : -1;
  const parts = at < 0 ? [hook] : [hook.slice(0, at), highlight, hook.slice(at + highlight.length)];
  // Anton is condensed: it takes larger sizes than VaultysHub's Montserrat for the same length.
  const size = hook.length <= 16 ? 190 : hook.length <= 24 ? 160 : hook.length <= 32 ? 140 : 124;
  return (
    <div style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 1.0, letterSpacing: 1, textTransform: "uppercase", color: "white", textShadow: "0 10px 40px rgba(0,0,0,0.55)" }}>
      {parts.map((part, i) =>
        i === 1 ? (
          <span key={i} style={{ color, backgroundImage: `linear-gradient(transparent 80%, ${color}55 80%, ${color}55 94%, transparent 94%)` }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

export const Thumbnail: React.FC<ThumbnailProps> = ({ eyebrow, hook, highlight, sticker, tone, accent, image, imageSize, focus, zoom, logo }) => {
  const color = COLORS[tone];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 20% 15%, #2a5868 0%, ${NAVY} 38%, #08131a 85%)`, overflow: "hidden" }}>
      {/* Glows and a faint grid, as in the marketing video's backdrop. */}
      <div style={{ position: "absolute", right: -260, bottom: -320, width: 1100, height: 1100, borderRadius: "50%", background: `radial-gradient(circle, ${ORANGE}66, transparent 65%)` }} />
      <div style={{ position: "absolute", left: 300, top: -380, width: 900, height: 900, borderRadius: "50%", background: `radial-gradient(circle, ${color}22, transparent 65%)` }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />

      {/* The video, in a tilted window bleeding off the right edge. */}
      <div style={{ position: "absolute", ...CARD, perspective: 2200 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 30,
            overflow: "hidden",
            background: "#111",
            transform: "rotateY(-14deg) rotateZ(-3deg)",
            transformOrigin: "0% 50%",
            border: "3px solid rgba(255,255,255,0.22)",
            boxShadow: `0 60px 120px rgba(0,0,0,0.6), 0 0 90px ${ORANGE}55`,
          }}
        >
          <Frame image={image} imageSize={imageSize} focus={focus} zoom={zoom} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(8,19,26,0.35), transparent 30%)" }} />
        </div>
      </div>

      {/* The text, on the left. */}
      <div style={{ position: "absolute", left: 90, top: 120, width: 800, display: "flex", flexDirection: "column", gap: 34 }}>
        <div style={{ alignSelf: "flex-start", padding: "12px 26px", borderRadius: 999, background: ORANGE, fontFamily: FONT, fontWeight: 800, fontSize: 34, letterSpacing: 3, textTransform: "uppercase", color: "white" }}>
          {eyebrow}
        </div>
        <Hook hook={hook} highlight={highlight} color={COLORS[accent ?? tone]} />
      </div>

      {/* The sticker, across the window's lower-left corner. */}
      <div
        style={{
          position: "absolute",
          left: 840,
          top: 810,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "20px 38px 20px 22px",
          borderRadius: 999,
          background: color,
          transform: "rotate(-5deg)",
          boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 50px ${color}88`,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 54,
          color: "#08131a",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 72, height: 72, borderRadius: "50%", background: "#08131a", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>{ICONS[tone]}</span>
        {sticker}
      </div>

      {logo ? <Img src={logo} style={{ position: "absolute", left: 90, bottom: 80, height: 92 }} /> : null}
    </AbsoluteFill>
  );
};
