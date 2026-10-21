import React from "react";
import { AbsoluteFill, Easing, Freeze, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { FPS } from "../intro/Intro";

/**
 * The kit of the narrated, animated explainers (no live recording; console footage comes from
 * `.generated-videos/screens/`). Ported from VaultysHub's `e2e/videos/explainer/kit.tsx`, restyled
 * in VaultysClaw's colours: deep navy, the logo's orange as the accent, teal for what is safe, red
 * for the attacker.
 *
 * Each video lists its scenes, each bound to lines of its .narration.json; `timeline()` lays the
 * lines end to end on the voice clips' lengths, and `ExplainerFrame` plays the scenes over a shared
 * backdrop, with the chapter's name and a progress row on top. A scene places its animations on its
 * lines (`at(line, fraction)`), so the pictures follow the voice in every language.
 */

export const { fontFamily: DISPLAY } = loadAnton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });
const montserrat = loadMontserrat("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin", "latin-ext"] });
export const FONT = montserrat.fontFamily;

// ── Palette (VaultysClaw's brand: its logo's orange and navy) ───────────────
export const NAVY = "#16323d";
export const ORANGE = "#d35400";
/** The brand orange, lifted for text and strokes on the navy backdrop. */
export const ORANGE_LIGHT = "#f07a2a";
export const MIST = "#b9d0d9";
export const MIST_DIM = "#7f9ba6";
export const TEAL = "#2ee6b6";
export const RED = "#ff4d6d";
export const AMBER = "#f2a93b";
export const GOLD = "#f5c451";
export const INK = "#f1ecfa";

export type SceneList = readonly { readonly id: string; readonly lines: readonly string[] }[];

/** Seconds: before a scene's first line, between two lines, after a scene's last line. */
const LEAD = 0.8;
const GAP = 0.45;
const TAIL = 1.0;
/** Frames two scenes overlap while one fades into the next. */
export const CROSS = 14;

export type Timeline = {
  lines: Record<string, { start: number; duration: number }>;
  scenes: { id: string; start: number; end: number }[];
  total: number;
};

/** Where each line and each scene falls, in seconds from the start, given the clips' lengths. */
export function timeline(list: SceneList, durations: Record<string, number>): Timeline {
  let t = 0;
  const lines: Timeline["lines"] = {};
  const scenes: Timeline["scenes"] = [];
  for (const scene of list) {
    const start = t;
    t += LEAD;
    scene.lines.forEach((id, i) => {
      const duration = durations[id];
      if (duration === undefined) throw new Error(`No clip for line "${id}"`);
      lines[id] = { start: t, duration };
      t += duration + (i < scene.lines.length - 1 ? GAP : 0);
    });
    t += TAIL;
    scenes.push({ id: scene.id, start, end: t });
  }
  return { lines, scenes, total: t };
}

export const explainerFrames = (list: SceneList, durations: Record<string, number>) => Math.ceil(timeline(list, durations).total * FPS);

/** A scene's frame for a moment of one of its lines: `fraction` of the way through it. */
export type At = (line: string, fraction?: number) => number;

/** Seconds per line at a calm reader's pace (~2.6 words/s): the studio's estimate, with no voice clips. */
export const estimatedDurations = (lines: Record<string, { fr?: string }>) =>
  Object.fromEntries(Object.entries(lines).map(([id, text]) => [id, Math.max(1.5, (text.fr ?? "").split(/\s+/).length / 2.6)]));

// ── Helpers ────────────────────────────────────────────────────────────────

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = (frame: number, from: number, to: number, easing = Easing.out(Easing.cubic)) => interpolate(frame, [from, to], [0, 1], { ...CLAMP, easing });

export function usePop(from: number, config = { damping: 14, stiffness: 130 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - from, fps, config });
}

/** Hex colour blend, `t` from 0 (a) to 1 (b). */
export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join("")}`;
}

/** A deterministic pseudo-random in [0, 1) for an integer seed. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Centred on (x, y). */
export function Place({ x, y, children, style }: { x: number; y: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", ...style }}>{children}</div>;
}

/** Pops in at `from` (spring), centred on (x, y). */
export function Pop({ x, y, from, children, scale = 1, out }: { x: number; y: number; from: number; children: React.ReactNode; scale?: number; out?: number }) {
  const frame = useCurrentFrame();
  const p = usePop(from);
  const gone = out === undefined ? 0 : ease(frame, out, out + 10);
  return (
    <Place x={x} y={y} style={{ opacity: Math.min(1, p * 1.6) * (1 - gone), transform: `translate(-50%, -50%) scale(${(0.6 + p * 0.4) * scale * (1 - gone * 0.3)})` }}>
      {children}
    </Place>
  );
}

/** Fades and rises in at `from`. */
export function Rise({ from, children, distance = 30, style }: { from: number; children: React.ReactNode; distance?: number; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  const t = ease(frame, from, from + 16);
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * distance}px)`, ...style }}>{children}</div>;
}

/** Something travelling from one point to another between two frames, on an arc. */
export function Travel({
  from,
  to,
  start,
  end,
  arc = 0,
  stay = false,
  children,
}: {
  from: [number, number];
  to: [number, number];
  start: number;
  end: number;
  arc?: number;
  stay?: boolean;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const p = interpolate(frame, [start, end], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const x = from[0] + (to[0] - from[0]) * p;
  const y = from[1] + (to[1] - from[1]) * p - arc * Math.sin(Math.PI * p);
  const opacity = stay ? ease(frame, start, start + 6) : interpolate(frame, [start, start + 6, end, end + 8], [0, 1, 1, 0], CLAMP);
  return (
    <Place x={x} y={y} style={{ opacity }}>
      {children}
    </Place>
  );
}

/** A line between two points (optionally curved), drawn in from `from`, dashes flowing along it. */
export function Link({
  a,
  b,
  from,
  color = "rgba(255,255,255,0.3)",
  width = 3,
  flow = true,
  bend = 0,
  glow = false,
  opacity = 1,
}: {
  a: [number, number];
  b: [number, number];
  from: number;
  color?: string;
  width?: number;
  flow?: boolean;
  bend?: number;
  glow?: boolean;
  opacity?: number;
}) {
  const frame = useCurrentFrame();
  const p = ease(frame, from, from + 20);
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2 + bend;
  const d = `M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.abs(bend);
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible", opacity }} width={1920} height={1080}>
      {glow && <path d={d} fill="none" stroke={color} strokeWidth={width * 4} strokeOpacity={0.18 * p} strokeLinecap="round" style={{ filter: "blur(6px)" }} />}
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${length * p} ${length}`} />
      {flow && p > 0.99 && <path d={d} fill="none" stroke="white" strokeOpacity={0.5} strokeWidth={width} strokeLinecap="round" strokeDasharray="2 22" strokeDashoffset={-frame * 1.6} />}
    </svg>
  );
}

/** A rounded label: a capability, a property, a packet. */
export function Chip({ children, color = MIST, solid = false, size = 28, icon }: { children: React.ReactNode; color?: string; solid?: boolean; size?: number; icon?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.4,
        padding: `${size * 0.38}px ${size * 0.85}px`,
        borderRadius: 999,
        whiteSpace: "nowrap",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size,
        color: solid ? "#0b161b" : "white",
        background: solid ? color : `${color}22`,
        border: `2px solid ${color}`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.35), 0 0 24px ${color}44`,
      }}
    >
      {icon}
      {children}
    </div>
  );
}

/**
 * A headline, word by word: the scene's idea in a few words, as on the deck. `accent` words
 * (exact matches, punctuation aside) take the accent colour.
 */
export function Headline({
  text,
  from,
  size = 92,
  color = INK,
  accent = [],
  accentColor = ORANGE_LIGHT,
  align = "left",
  width = 1300,
  display = true,
  stagger = 3,
}: {
  text: string;
  from: number;
  size?: number;
  color?: string;
  accent?: string[];
  accentColor?: string;
  align?: "left" | "center";
  width?: number;
  display?: boolean;
  stagger?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width,
        textAlign: align,
        fontFamily: display ? DISPLAY : FONT,
        fontWeight: display ? 400 : 800,
        fontSize: size,
        lineHeight: display ? 1.04 : 1.12,
        letterSpacing: display ? 0.5 : -1,
        textTransform: display ? "uppercase" : "none",
        color,
        textWrap: "balance",
      }}
    >
      {text.split(" ").map((word, i) => {
        const t = ease(frame, from + i * stagger, from + i * stagger + 14);
        const isAccent = accent.includes(word.replace(/[.,:;!?»«]/g, ""));
        return (
          <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: t, transform: `translateY(${(1 - t) * 0.5}em)`, color: isAccent ? accentColor : undefined }}>
            {word}{" "}
          </span>
        );
      })}
    </div>
  );
}

// ── Pictograms ─────────────────────────────────────────────────────────────

/** An AI agent: a small robot head in a rounded tile. `state` tints it: 0 neutral, ok, danger or off. */
export function Bot({ size = 90, color = MIST, state = "neutral", glow = 0 }: { size?: number; color?: string; state?: "neutral" | "ok" | "danger" | "off" | "shadow"; glow?: number }) {
  const c = state === "ok" ? TEAL : state === "danger" ? RED : state === "off" ? "#5a6c74" : state === "shadow" ? "#2c3a40" : color;
  const eye = state === "shadow" ? RED : state === "off" ? "#3f4d54" : "#0b161b";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: "visible", filter: glow ? `drop-shadow(0 0 ${14 * glow}px ${c})` : undefined }}>
      <line x1={32} y1={6} x2={32} y2={14} stroke={c} strokeWidth={3} strokeLinecap="round" />
      <circle cx={32} cy={5} r={3.5} fill={c} />
      <rect x={10} y={14} width={44} height={38} rx={12} fill={state === "shadow" ? "#15232a" : `${c}`} />
      <rect x={16} y={22} width={32} height={18} rx={8} fill={state === "shadow" ? "#060d10" : "rgba(8,19,24,0.85)"} />
      <circle cx={25} cy={31} r={3.6} fill={state === "shadow" ? RED : c} opacity={state === "off" ? 0.4 : 1} />
      <circle cx={39} cy={31} r={3.6} fill={state === "shadow" ? RED : c} opacity={state === "off" ? 0.4 : 1} />
      <rect x={24} y={45} width={16} height={3} rx={1.5} fill={eye} opacity={0.6} />
      <rect x={4} y={26} width={6} height={14} rx={3} fill={c} opacity={0.7} />
      <rect x={54} y={26} width={6} height={14} rx={3} fill={c} opacity={0.7} />
    </svg>
  );
}

export function Person({ size = 90, color = MIST }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <circle cx={32} cy={32} r={31} fill="rgba(255,255,255,0.06)" stroke={color} strokeWidth={2} />
      <circle cx={32} cy={25} r={10} fill={color} />
      <path d="M13 53 C15 41 23 37 32 37 C41 37 49 41 51 53 Z" fill={color} />
    </svg>
  );
}

export function Hacker({ size = 150 }: { size?: number }) {
  const frame = useCurrentFrame();
  const glow = 0.6 + 0.4 * Math.sin(frame / 6);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ filter: `drop-shadow(0 0 ${14 * glow}px ${RED})` }}>
      <path d="M32 4 C18 4 10 15 10 28 L10 60 L54 60 L54 28 C54 15 46 4 32 4 Z" fill="#101c22" stroke={RED} strokeWidth={2} />
      <path d="M20 30 C20 21 25 15 32 15 C39 15 44 21 44 30 L44 40 C44 46 39 50 32 50 C25 50 20 46 20 40 Z" fill="#07050a" />
      <rect x={22} y={29} width={20} height={5} rx={2.5} fill={RED} opacity={glow} />
    </svg>
  );
}

export function Database({ size = 220, color = MIST, tint = 0, shake = 0 }: { size?: number; color?: string; tint?: number; shake?: number }) {
  const frame = useCurrentFrame();
  const stroke = tint ? mix(color, RED, tint) : color;
  const dx = shake ? Math.sin(frame * 2.3) * 6 * shake : 0;
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 100 110" style={{ transform: `translateX(${dx}px)`, overflow: "visible", filter: `drop-shadow(0 0 ${24 * tint}px ${RED})` }}>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M10 ${20 + i * 30} L10 ${46 + i * 30} C10 ${56 + i * 30} 90 ${56 + i * 30} 90 ${46 + i * 30} L90 ${20 + i * 30}`} fill={`${stroke}22`} stroke={stroke} strokeWidth={2.5} />
      ))}
      <ellipse cx={50} cy={20} rx={40} ry={11} fill={`${stroke}44`} stroke={stroke} strokeWidth={2.5} />
    </svg>
  );
}

export function KeyIcon({ size = 80, color = GOLD, rotate = 0 }: { size?: number; color?: string; rotate?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ transform: `rotate(${rotate}deg)`, filter: `drop-shadow(0 0 12px ${color}aa)`, overflow: "visible" }}>
      <circle cx={18} cy={32} r={12} fill="none" stroke={color} strokeWidth={6} />
      <path d="M30 32 H58 M48 32 V42 M56 32 V40" stroke={color} strokeWidth={6} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function IdIcon({ size = 80, color = TEAL }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: "visible" }}>
      <rect x={5} y={13} width={54} height={38} rx={6} fill={`${color}18`} stroke={color} strokeWidth={4} />
      <circle cx={21} cy={29} r={6} fill={color} />
      <path d="M11 44 C12 38 16 36 21 36 C26 36 30 38 31 44" fill={color} />
      <path d="M37 26 H52 M37 34 H52 M37 42 H47" stroke={color} strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ size = 40, color = TEAL }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: "visible" }}>
      <path d="M20 28 V20 C20 13 25 8 32 8 C39 8 44 13 44 20 V28" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
      <rect x={12} y={28} width={40} height={30} rx={7} fill={color} />
      <circle cx={32} cy={42} r={4.5} fill="#0b161b" />
    </svg>
  );
}

export function Shield({ size = 200, color = TEAL, fill = 0.15, children }: { size?: number; color?: string; fill?: number; children?: React.ReactNode }) {
  return (
    <div style={{ position: "relative", width: size, height: size * 1.15 }}>
      <svg width={size} height={size * 1.15} viewBox="0 0 100 115" style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 0 22px ${color}88)` }}>
        <path d="M50 4 L92 20 L92 56 C92 84 72 102 50 111 C28 102 8 84 8 56 L8 20 Z" fill={`${color}${Math.round(fill * 255).toString(16).padStart(2, "0")}`} stroke={color} strokeWidth={3.5} strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

export function Badge({ ok, size = 64 }: { ok: boolean; size?: number }) {
  const color = ok ? TEAL : RED;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ filter: `drop-shadow(0 0 14px ${color}aa)` }}>
      <circle cx={32} cy={32} r={29} fill={color} />
      {ok ? <path d="M19 33 L28 42 L46 23" stroke="#0d1a14" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M22 22 L42 42 M42 22 L22 42" stroke="#22070d" strokeWidth={7} strokeLinecap="round" />}
    </svg>
  );
}

/**
 * A browser window playing console footage: `clip` (a screens/ recording, served as the bundle's
 * public dir) from `at` seconds, held on its last frame after `hold` seconds. `from` is when the
 * window opens, in the scene's frames. Tilted a little in 3D and floating, so it reads as a product
 * shot rather than a screen share.
 */
export function BrowserWindow({
  clip,
  at,
  hold,
  from,
  width = 1100,
  tilt = -8,
  url = "vaultysclaw / admin",
  children,
}: {
  clip?: string;
  at?: number;
  hold?: number;
  from: number;
  width?: number;
  tilt?: number;
  url?: string;
  children?: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const p = usePop(from, { damping: 18, stiffness: 90 });
  const height = (width * 9) / 16;
  const float = Math.sin((frame - from) / 40) * 6;
  return (
    <div style={{ perspective: 2200 }}>
      <div
        style={{
          width,
          borderRadius: 18,
          overflow: "hidden",
          background: "#f6f5fb",
          boxShadow: `0 60px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.18), 0 0 90px ${ORANGE}33`,
          opacity: Math.min(1, p * 1.5),
          transform: `translateY(${(1 - p) * 80 + float}px) rotateY(${tilt * (0.6 + 0.4 * p)}deg) rotateX(${(1 - p) * 10 + 2}deg) scale(${0.9 + 0.1 * p})`,
        }}
      >
        <div style={{ height: 40, background: "linear-gradient(#ecebf3, #e1dfea)", display: "flex", alignItems: "center", gap: 9, padding: "0 16px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
          ))}
          <div style={{ marginLeft: 18, flex: 1, maxWidth: 420, height: 24, borderRadius: 8, background: "white", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#6b6380" }}>
            <LockIcon size={12} color="#8f86a3" />
            {url}
          </div>
        </div>
        <div style={{ position: "relative", width, height, background: "#f6f5fb" }}>
          {clip && at !== undefined && frame >= from && (
            <Sequence from={from} layout="none">
              <Freeze frame={Math.round((hold ?? 999) * FPS)} active={hold !== undefined && frame - from > Math.round(hold * FPS)}>
                <OffthreadVideo src={staticFile(clip)} trimBefore={Math.round(at * FPS)} muted style={{ width, height }} />
              </Freeze>
            </Sequence>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Frame ──────────────────────────────────────────────────────────────────

/** Deep navy, two slow glows (navy, the brand orange), drifting particles and a faint grid. */
export function Backdrop({ danger = 0, calm = 0 }: { danger?: number; calm?: number }) {
  const frame = useCurrentFrame();
  const a = frame / 140;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(140deg, #0c1b22 0%, #13303b 50%, #08131a 100%)", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1400, height: 1400, borderRadius: "50%", left: 100 + Math.sin(a) * 180, top: -620 + Math.cos(a * 0.8) * 140, background: "radial-gradient(circle, #2a5868 0%, transparent 64%)", filter: "blur(40px)", opacity: 0.9 }} />
      <div style={{ position: "absolute", width: 1200, height: 1200, borderRadius: "50%", left: 950 + Math.cos(a * 0.9) * 200, top: 320 + Math.sin(a * 1.1) * 130, background: `radial-gradient(circle, ${ORANGE}33 0%, transparent 65%)`, filter: "blur(50px)" }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, ${TEAL}22, transparent 70%)`, opacity: calm }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, ${RED}38, transparent 70%)`, opacity: danger }} />
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          backgroundPosition: `${(frame * 0.35) % 72}px ${(frame * 0.2) % 72}px`,
          maskImage: "radial-gradient(ellipse at 50% 50%, black 25%, transparent 80%)",
        }}
      />
      {Array.from({ length: 40 }, (_, i) => {
        const x = rand(i) * 1920;
        const y = (rand(i + 99) * 1180 - frame * (0.15 + rand(i + 7) * 0.35)) % 1180;
        return <div key={i} style={{ position: "absolute", left: x, top: y < 0 ? y + 1180 : y, width: 3, height: 3, borderRadius: 2, background: MIST, opacity: 0.12 + rand(i + 3) * 0.25 }} />;
      })}
    </AbsoluteFill>
  );
}

/** The chapter's name at the top left (spaced capitals), the progress row at the top right. */
function Chrome({ label, index, count, length }: { label: string; index: number; count: number; length: number }) {
  const frame = useCurrentFrame();
  const t = ease(frame, 2, 20);
  const leave = ease(frame, length - 6, length + CROSS - 4);
  if (!label) return null;
  return (
    <>
      <div style={{ position: "absolute", left: 110, top: 78, display: "flex", alignItems: "center", gap: 20, opacity: t * (1 - leave), fontFamily: FONT }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: MIST, letterSpacing: 7, textTransform: "uppercase" }}>{label}</span>
        <span style={{ height: 2, width: 160 * t, background: `linear-gradient(90deg, ${MIST}, transparent)` }} />
      </div>
      <div style={{ position: "absolute", right: 110, top: 86, display: "flex", gap: 10, opacity: t * (1 - leave) }}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} style={{ width: i === index ? 30 : 10, height: 10, borderRadius: 5, background: i === index ? ORANGE_LIGHT : i < index ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.16)" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 110, bottom: 60, fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: 6, color: "rgba(255,255,255,0.35)", opacity: t * (1 - leave) }}>VAULTYSCLAW</div>
    </>
  );
}

/**
 * The scenes of `list`, each in its window of the timeline, fading into one another over the
 * backdrop. `scene` draws one (with `at` placing its animations on its lines), `chapter` names it,
 * `mood` (per frame) reddens the backdrop behind an attack, or turns it teal once safe.
 */
export function ExplainerFrame({
  list,
  durations,
  scene,
  chapter,
  mood,
}: {
  list: SceneList;
  durations: Record<string, number>;
  scene: (id: string, at: At, length: number) => React.ReactNode;
  chapter: (id: string) => string;
  mood?: (frame: number, tl: Timeline, f: (seconds: number) => number) => { danger?: number; calm?: number };
}) {
  const frame = useCurrentFrame();
  const tl = timeline(list, durations);
  const f = (seconds: number) => Math.round(seconds * FPS);
  const m = mood?.(frame, tl, f) ?? {};
  return (
    <AbsoluteFill style={{ backgroundColor: "#0c1b22" }}>
      <Backdrop danger={m.danger} calm={m.calm} />
      {tl.scenes.map((s, i) => {
        const from = f(s.start);
        const length = f(s.end) - from;
        const at: At = (line, fraction = 0) => {
          const l = tl.lines[line];
          if (!l) throw new Error(`Scene "${s.id}" uses unknown line "${line}"`);
          return f(l.start + fraction * l.duration) - from;
        };
        return (
          <Sequence key={s.id} from={from} durationInFrames={length + CROSS}>
            <SceneFade length={length} first={i === 0} last={i === tl.scenes.length - 1}>
              {scene(s.id, at, length)}
            </SceneFade>
            <Chrome label={chapter(s.id)} index={i} count={tl.scenes.length} length={length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

/** Fades a scene in over the previous one's tail, and out as the next one comes in. */
function SceneFade({ length, first, last, children }: { length: number; first: boolean; last: boolean; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const enter = first ? 1 : ease(frame, CROSS / 3, CROSS + 4);
  const leave = last ? 0 : ease(frame, length - 6, length + CROSS / 2);
  return <AbsoluteFill style={{ opacity: enter * (1 - leave), transform: `scale(${1 + leave * 0.04}) translateY(${(1 - enter) * 20}px)`, fontFamily: FONT }}>{children}</AbsoluteFill>;
}

/** A slow push-in on the whole scene, for life in held shots. */
export function Cam({ length, push = 0.05, children }: { length: number; push?: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const s = 1 + push * interpolate(frame, [0, length], [0, 1], CLAMP);
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
}
