import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp } from "../helpers";

const TOTAL = 350;

// Layout constants (SVG coordinate space 960×1080 for the left diagram panel)
const CX = 480; // diagram center x
const STORE_Y = 780;
const AGENT_Y = 570;
const USER_Y = 220;

const DATA_STORES = [
  { x: 180, label: "PostgreSQL", icon: "🗄" },
  { x: 480, label: "S3 / Files", icon: "📦" },
  { x: 780, label: "Internal API", icon: "⚙" },
];

const AGENTS = [
  { x: 180, linkedStore: 0 },
  { x: 480, linkedStore: 1 },
  { x: 780, linkedStore: 2 },
];

const USERS = [
  { x: 300, label: "Alice" },
  { x: 660, label: "Bob" },
];

// Agent-to-agent P2P edges
const AA_EDGES = [
  [0, 1],
  [1, 2],
];

// Agent-to-user edges
const AU_EDGES = [
  [0, 0],
  [1, 0],
  [2, 1],
];

// Animated particle along a line segment
function Particle({
  x1,
  y1,
  x2,
  y2,
  frame,
  offset = 0,
  color = "#10b981",
  speed = 0.012,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  frame: number;
  offset?: number;
  color?: string;
  speed?: number;
}) {
  const t = (((frame * speed + offset) % 1) + 1) % 1;
  const px = x1 + (x2 - x1) * t;
  const py = y1 + (y2 - y1) * t;
  return <circle cx={px} cy={py} r={4} fill={color} opacity={0.9} />;
}

// Animated line that draws itself
function DrawLine({
  x1,
  y1,
  x2,
  y2,
  startFrame,
  duration,
  frame,
  stroke = "#10b981",
  strokeWidth = 2,
  dashed = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  startFrame: number;
  duration: number;
  frame: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}) {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const progress = interpolate(
    frame,
    [startFrame, startFrame + duration],
    [0, 1],
    {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const drawn = len * progress;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashed ? "8 5" : `${len}`}
      strokeDashoffset={dashed ? undefined : len - drawn}
      strokeOpacity={0.75}
      strokeLinecap="round"
    />
  );
}

// Shield lock icon at midpoint
function LockBadge({
  x1,
  y1,
  x2,
  y2,
  opacity,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g opacity={opacity}>
      <text x={mx} y={my + 6} textAnchor="middle" fontSize={40} fill="#10b981">
        🔒
      </text>
    </g>
  );
}

const CHIPS = [
  {
    icon: "⇄",
    color: "#60a5fa",
    bg: "rgba(29,78,216,0.12)",
    border: "rgba(29,78,216,0.3)",
    label: "P2P — no central server",
  },
  {
    icon: "💾",
    color: "#a78bfa",
    bg: "rgba(124,58,237,0.12)",
    border: "rgba(124,58,237,0.3)",
    label: "Runs on 512 MB RAM",
  },
  {
    icon: "⚡",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.10)",
    border: "rgba(251,191,36,0.28)",
    label: "< 1 W idle power",
  },
  {
    icon: "🌱",
    color: "#34d399",
    bg: "rgba(52,211,153,0.10)",
    border: "rgba(52,211,153,0.28)",
    label: "Meets your CSR & carbon goals",
  },
];

export const SceneDataProximity: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);
  const titleSlide = useSlideUp(5, 22);
  const headlineSlide = useSlideUp(15, 22);
  const subSlide = useSlideUp(28, 22);

  // Diagram element appearance timings
  const storeOpacity = interpolate(frame, [20, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const agentOpacity = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Store→agent connections drawn frame 60-80
  // Agent→agent P2P drawn frame 90-115
  // Agent→user drawn frame 115-145

  // Lock badges appear after lines are drawn
  const storeLockOpacity = interpolate(frame, [82, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const aaLockOpacity = interpolate(frame, [118, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const auLockOpacity = interpolate(frame, [148, 160], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const userOpacity = interpolate(frame, [110, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Chips appear at frame 90 — last chip visible at 140, readable for ~4.5 s
  const chipOpacity = (i: number) =>
    interpolate(frame, [90 + i * 15, 105 + i * 15], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  // Agent pulse
  const agentPulse = 0.85 + 0.15 * Math.sin(frame * 0.2);

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background:
          "linear-gradient(155deg, #060c14 0%, #090f1e 60%, #060b12 100%)",
      }}
    >
      {/* Grid background */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(96,165,250,0.025) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(96,165,250,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          pointerEvents: "none",
        }}
      />

      {/* Left panel: 960 × 1080 — explicitly sized so the SVG doesn't collapse */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 960,
          height: 1080,
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 60% at 50% 55%, rgba(16,185,129,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <svg
          width="960"
          height="1080"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <radialGradient id="dp_agent" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="100%" stopColor="#4c1d95" />
            </radialGradient>
            <radialGradient id="dp_user" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="100%" stopColor="#1e3a5f" />
            </radialGradient>
            <radialGradient id="dp_store" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="100%" stopColor="#064e3b" />
            </radialGradient>
            <filter id="dp_glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── Data-store → agent connections ── */}
          {DATA_STORES.map((store, i) => (
            <DrawLine
              key={`sa-${i}`}
              x1={store.x}
              y1={STORE_Y - 38}
              x2={AGENTS[i].x}
              y2={AGENT_Y + 38}
              startFrame={60}
              duration={22}
              frame={frame}
              stroke="#10b981"
              strokeWidth={2.5}
            />
          ))}
          {DATA_STORES.map((store, i) => (
            <LockBadge
              key={`sl-${i}`}
              x1={store.x}
              y1={STORE_Y - 38}
              x2={AGENTS[i].x}
              y2={AGENT_Y + 38}
              opacity={storeLockOpacity}
            />
          ))}

          {/* ── Agent ↔ agent P2P edges ── */}
          {AA_EDGES.map(([ai, bi], i) => (
            <DrawLine
              key={`aa-${i}`}
              x1={AGENTS[ai].x + 38}
              y1={AGENT_Y}
              x2={AGENTS[bi].x - 38}
              y2={AGENT_Y}
              startFrame={90}
              duration={28}
              frame={frame}
              stroke="#7c3aed"
              strokeWidth={2}
            />
          ))}
          {AA_EDGES.map(([ai, bi], i) => (
            <LockBadge
              key={`aal-${i}`}
              x1={AGENTS[ai].x + 38}
              y1={AGENT_Y}
              x2={AGENTS[bi].x - 38}
              y2={AGENT_Y}
              opacity={aaLockOpacity}
            />
          ))}

          {/* ── Agent → user edges ── */}
          {AU_EDGES.map(([ai, ui], i) => (
            <DrawLine
              key={`au-${i}`}
              x1={AGENTS[ai].x}
              y1={AGENT_Y - 38}
              x2={USERS[ui].x}
              y2={USER_Y + 32}
              startFrame={115}
              duration={32}
              frame={frame}
              stroke="#60a5fa"
              strokeWidth={2}
            />
          ))}
          {AU_EDGES.map(([ai, ui], i) => (
            <LockBadge
              key={`aul-${i}`}
              x1={AGENTS[ai].x}
              y1={AGENT_Y - 38}
              x2={USERS[ui].x}
              y2={USER_Y + 32}
              opacity={auLockOpacity}
            />
          ))}

          {/* ── Animated particles on store→agent ── */}
          {frame > 82 &&
            DATA_STORES.map((store, i) => (
              <Particle
                key={`p-sa-${i}`}
                x1={store.x}
                y1={STORE_Y - 38}
                x2={AGENTS[i].x}
                y2={AGENT_Y + 38}
                frame={frame}
                offset={i * 0.33}
                color="#10b981"
                speed={0.009}
              />
            ))}

          {/* ── Animated particles on agent↔agent ── */}
          {frame > 118 &&
            AA_EDGES.map(([ai, bi], i) => (
              <Particle
                key={`p-aa-${i}`}
                x1={AGENTS[ai].x + 38}
                y1={AGENT_Y}
                x2={AGENTS[bi].x - 38}
                y2={AGENT_Y}
                frame={frame}
                offset={i * 0.5}
                color="#a78bfa"
                speed={0.011}
              />
            ))}

          {/* ── Data stores ── */}
          {DATA_STORES.map((store, i) => (
            <g key={`store-${i}`} opacity={storeOpacity}>
              {/* Glow */}
              <circle
                cx={store.x}
                cy={STORE_Y}
                r={48}
                fill="#10b981"
                fillOpacity={0.07}
              />
              {/* Node */}
              <circle
                cx={store.x}
                cy={STORE_Y}
                r={46}
                fill="url(#dp_store)"
                stroke="#10b981"
                strokeWidth={1.5}
                strokeOpacity={0.5}
              />
              <text
                x={store.x}
                y={STORE_Y + 10}
                textAnchor="middle"
                fontSize={46}
                fill="#fff"
              >
                {store.icon}
              </text>
              <text
                x={store.x}
                y={STORE_Y + 82}
                textAnchor="middle"
                fontSize={30}
                fill={BRAND.muted}
                fontFamily={MONO}
              >
                {store.label}
              </text>
            </g>
          ))}

          {/* ── Agents ── */}
          {AGENTS.map((agent, i) => (
            <g key={`agent-${i}`} opacity={agentOpacity}>
              {/* Pulse halo */}
              <circle
                cx={agent.x}
                cy={AGENT_Y}
                r={52 * agentPulse}
                fill="#7c3aed"
                fillOpacity={0.06}
              />
              {/* Outer ring */}
              <circle
                cx={agent.x}
                cy={AGENT_Y}
                r={38}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={1.5}
                strokeOpacity={0.4}
                filter="url(#dp_glow)"
              />
              {/* Core */}
              <circle cx={agent.x} cy={AGENT_Y} r={48} fill="url(#dp_agent)" />
              <text
                x={agent.x}
                y={AGENT_Y + 9}
                textAnchor="middle"
                fontSize={42}
                fill="#fff"
              >
                🤖
              </text>
              <text
                x={agent.x}
                y={AGENT_Y - 62}
                textAnchor="middle"
                fontSize={30}
                fontWeight={700}
                fill={BRAND.purple400}
                fontFamily={MONO}
              >
                agent-{i + 1}
              </text>
            </g>
          ))}

          {/* ── Users ── */}
          {USERS.map((user, i) => (
            <g key={`user-${i}`} opacity={userOpacity}>
              <circle
                cx={user.x}
                cy={USER_Y}
                r={34}
                fill="url(#dp_user)"
                stroke="#60a5fa"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
              <text
                x={user.x}
                y={USER_Y + 10}
                textAnchor="middle"
                fontSize={42}
                fill="#fff"
              >
                👤
              </text>
              <text
                x={user.x}
                y={USER_Y - 62}
                textAnchor="middle"
                fontSize={30}
                fontWeight={700}
                fill={BRAND.blue400}
                fontFamily={MONO}
              >
                {user.label}
              </text>
            </g>
          ))}

          {/* Perimeter boundary label */}
          <rect
            x={60}
            y={140}
            width={840}
            height={720}
            rx={20}
            fill="none"
            stroke="#10b981"
            strokeWidth={1}
            strokeOpacity={interpolate(frame, [155, 175], [0, 0.2], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            strokeDasharray="12 8"
          />
          <text
            x={80}
            y={1000}
            fontSize={30}
            fontWeight={700}
            fill="#10b981"
            fontFamily={MONO}
            opacity={interpolate(frame, [165, 180], [0, 0.7], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          >
            YOUR SECURE PERIMETER
          </text>
        </svg>
      </div>

      {/* Right panel: 960 × 1080 — pinned to the right half */}
      <div
        style={{
          position: "absolute",
          left: 960,
          top: 0,
          width: 960,
          height: 1080,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingRight: 100,
          paddingLeft: 60,
        }}
      >
        {/* Label */}
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: BRAND.green,
            marginBottom: 20,
            opacity: titleSlide.opacity,
            transform: `translateY(${titleSlide.y}px)`,
            fontFamily: MONO,
          }}
        >
          Zero-Trust Edge
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 100,
            fontWeight: 900,
            color: BRAND.text,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 20,
            opacity: headlineSlide.opacity,
            transform: `translateY(${headlineSlide.y}px)`,
          }}
        >
          Agents at the edge.
        </div>

        {/* Sub — one punchy line */}
        <div
          style={{
            fontSize: 30,
            color: BRAND.muted,
            lineHeight: 1.5,
            marginBottom: 44,
            opacity: subSlide.opacity,
            transform: `translateY(${subSlide.y}px)`,
          }}
        >
          Zero data exfiltration. No inbound ports.
        </div>

        {/* Feature chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {CHIPS.map((chip, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: chipOpacity(i),
                transform: `translateX(${interpolate(chipOpacity(i), [0, 1], [-20, 0])}px)`,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: chip.bg,
                  border: `1px solid ${chip.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                  flexShrink: 0,
                }}
              >
                {chip.icon}
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 600,
                  color: chip.color,
                }}
              >
                {chip.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
