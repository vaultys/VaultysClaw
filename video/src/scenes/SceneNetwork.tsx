import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BRAND, MONO, useSceneOpacity, useSlideUp } from "../helpers";

// 10 s @ 30 fps — long enough to show graph + 4 s of readable end-message
const TOTAL = 400;
const AGENT_COUNT = 300;
const USER_COUNT = 80;
const BASE_RADIUS = 370;

// Connectivity ratios
const K_USER = 5; // agents per user
const K_COMMUNITY = 3; // agent↔agent via shared user
const K_SPATIAL = 2; // agent↔agent by proximity

// User pyramid (must sum to USER_COUNT)
// Level 0 CEO · 1 VP · 2 Directors · 3 Managers · 4 ICs
const HIER_OFF = [0, 1, 5, 20, 50]; // start index of each level
const HIER_COUNT = [1, 4, 15, 30, 50]; // nodes per level

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Node3D {
  type: "agent" | "user";
  x: number;
  y: number;
  z: number;
}
interface Edge {
  a: number;
  b: number;
  w: number;
}
type EdgeKind = "aa" | "au" | "uu";

function makeRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function fibPoint(n: number, i: number): [number, number, number] {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const t = GOLDEN_ANGLE * i;
  return [r * Math.cos(t), y, r * Math.sin(t)];
}

// Return the parent user index for a given user index (−1 for CEO)
function userParent(ui: number): number {
  const level = HIER_OFF.findIndex((off, l) => ui < off + HIER_COUNT[l]);
  if (level <= 0) return -1;
  const localIdx = ui - HIER_OFF[level];
  const parentLocal = Math.floor(
    (localIdx * HIER_COUNT[level - 1]) / HIER_COUNT[level]
  );
  return HIER_OFF[level - 1] + parentLocal;
}

// ── Build graph once at module load ──────────────────────────────────────────
function buildGraph() {
  const rng = makeRng(42);
  const N = AGENT_COUNT + USER_COUNT;

  // ── Initial positions (topology only — force simulation overrides these) ──

  const agentPos: [number, number, number][] = Array.from(
    { length: AGENT_COUNT },
    (_, i) => {
      const [bx, by, bz] = fibPoint(AGENT_COUNT, i);
      const n = 0.1;
      const nx = bx + (rng() - 0.5) * n,
        ny = by + (rng() - 0.5) * n,
        nz = bz + (rng() - 0.5) * n;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      return [nx / len, ny / len, nz / len];
    }
  );

  const userPos: [number, number, number][] = Array.from(
    { length: USER_COUNT },
    () => {
      const theta = Math.acos(1 - 2 * rng());
      const phi = 2 * Math.PI * rng();
      const r = 0.28 + rng() * 0.22;
      return [
        Math.sin(theta) * Math.cos(phi) * r,
        Math.sin(theta) * Math.sin(phi) * r,
        Math.cos(theta) * r,
      ];
    }
  );

  // ── Edge topology ──────────────────────────────────────────────────────────

  const edgeSet = new Set<string>();
  const edges: Edge[] = [];
  const kinds: EdgeKind[] = [];

  const addEdge = (a: number, b: number, w: number, kind: EdgeKind) => {
    if (a === b) return;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({ a, b, w });
      kinds.push(kind);
    }
  };

  // 1. User hierarchy — parent → child (strongest spring: w=2.5)
  for (let ui = 1; ui < USER_COUNT; ui++) {
    const parent = userParent(ui);
    if (parent >= 0) addEdge(AGENT_COUNT + parent, AGENT_COUNT + ui, 2.5, "uu");
  }

  // 2. User ↔ nearest K_USER agents (w=1.5)
  const userToAgents: number[][] = userPos.map(([ux, uy, uz]) =>
    agentPos
      .map(([ax, ay, az], ai) => ({
        ai,
        d2: (ux - ax) ** 2 + (uy - ay) ** 2 + (uz - az) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, K_USER)
      .map((d) => d.ai)
  );
  const agentToUsers: number[][] = Array.from(
    { length: AGENT_COUNT },
    () => []
  );
  userToAgents.forEach((agents, ui) =>
    agents.forEach((ai) => agentToUsers[ai].push(ui))
  );
  userToAgents.forEach((agents, ui) =>
    agents.forEach((ai) => addEdge(ai, AGENT_COUNT + ui, 1.5, "au"))
  );

  // 3. Agent spatial KNN top-10 (for community + spatial edges)
  const agentKnn: number[][] = agentPos.map(([ax, ay, az], i) =>
    agentPos
      .map(([bx, by, bz], j) => ({
        j,
        d2: (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2,
      }))
      .filter((d) => d.j !== i)
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, 10)
      .map((d) => d.j)
  );

  // 4. Agent ↔ agent — community (w=1.0) + spatial fallback (w=0.5)
  agentPos.forEach((_, ai) => {
    const comSet = new Set<number>();
    agentToUsers[ai].forEach((ui) =>
      userToAgents[ui].forEach((oi) => {
        if (oi !== ai) comSet.add(oi);
      })
    );
    const com = Array.from(comSet);
    for (let k = com.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [com[k], com[j]] = [com[j], com[k]];
    }
    com.slice(0, K_COMMUNITY).forEach((oi) => addEdge(ai, oi, 1.0, "aa"));
    agentKnn[ai]
      .filter((j) => !comSet.has(j))
      .slice(0, K_SPATIAL)
      .forEach((j) => addEdge(ai, j, 0.5, "aa"));
  });

  // ── 3D Fruchterman-Reingold force simulation ──────────────────────────────
  //   Repulsion : f_r = k²/d²  (all pairs, no sqrt)
  //   Attraction: f_a = w·d/k  (edges only, weighted)
  //   Gravity   : f_g = −α·pos (prevent drift)

  const SIM_K = 0.2,
    SIM_K2 = SIM_K * SIM_K;
  const SIM_G = 0.015,
    SIM_ITER = 90,
    SIM_T0 = 0.4,
    SIM_COOL = 0.92;

  const px = new Float32Array(N),
    py = new Float32Array(N),
    pz = new Float32Array(N);
  agentPos.forEach(([x, y, z], i) => {
    px[i] = x;
    py[i] = y;
    pz[i] = z;
  });
  userPos.forEach(([x, y, z], i) => {
    const k = AGENT_COUNT + i;
    px[k] = x;
    py[k] = y;
    pz[k] = z;
  });

  const fdx = new Float32Array(N),
    fdy = new Float32Array(N),
    fdz = new Float32Array(N);
  let temp = SIM_T0;

  for (let iter = 0; iter < SIM_ITER; iter++) {
    fdx.fill(0);
    fdy.fill(0);
    fdz.fill(0);

    // Repulsion O(N²)
    for (let i = 0; i < N; i++) {
      const xi = px[i],
        yi = py[i],
        zi = pz[i];
      for (let j = i + 1; j < N; j++) {
        const dx = xi - px[j],
          dy = yi - py[j],
          dz = zi - pz[j];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
        const f = SIM_K2 / d2;
        fdx[i] += dx * f;
        fdy[i] += dy * f;
        fdz[i] += dz * f;
        fdx[j] -= dx * f;
        fdy[j] -= dy * f;
        fdz[j] -= dz * f;
      }
    }

    // Weighted attraction O(E)
    for (const { a, b, w } of edges) {
      const dx = px[b] - px[a],
        dy = py[b] - py[a],
        dz = pz[b] - pz[a];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
      const f = (w * d) / SIM_K;
      fdx[a] += dx * f;
      fdy[a] += dy * f;
      fdz[a] += dz * f;
      fdx[b] -= dx * f;
      fdy[b] -= dy * f;
      fdz[b] -= dz * f;
    }

    // Gravity + clamp
    for (let i = 0; i < N; i++) {
      fdx[i] -= px[i] * SIM_G;
      fdy[i] -= py[i] * SIM_G;
      fdz[i] -= pz[i] * SIM_G;
      const len = Math.sqrt(fdx[i] ** 2 + fdy[i] ** 2 + fdz[i] ** 2) + 1e-6;
      const s = Math.min(len, temp) / len;
      px[i] += fdx[i] * s;
      py[i] += fdy[i] * s;
      pz[i] += fdz[i] * s;
    }
    temp *= SIM_COOL;
  }

  // Normalise to unit sphere
  let maxR = 0;
  for (let i = 0; i < N; i++)
    maxR = Math.max(maxR, Math.sqrt(px[i] ** 2 + py[i] ** 2 + pz[i] ** 2));
  const inv = 1 / (maxR + 1e-6);

  const allNodes: Node3D[] = Array.from({ length: N }, (_, i) => ({
    type: i < AGENT_COUNT ? ("agent" as const) : ("user" as const),
    x: px[i] * inv,
    y: py[i] * inv,
    z: pz[i] * inv,
  }));

  // Pulse edges = a sparse sample of hierarchy (uu) edges
  const pulseEdges = kinds
    .map((k, i) => (k === "uu" ? i : -1))
    .filter((i) => i >= 0)
    .filter((_, k) => k % 3 === 0)
    .slice(0, 15);

  return { allNodes, edges, kinds, pulseEdges };
}

const {
  allNodes: ALL_NODES,
  edges: EDGES,
  kinds: EDGE_KINDS,
  pulseEdges: PULSE_EDGES,
} = buildGraph();

// ── Component ─────────────────────────────────────────────────────────────────
export const SceneNetwork: React.FC = () => {
  const frame = useCurrentFrame();
  const sceneOpacity = useSceneOpacity(TOTAL, 15, 25);
  const titleSlide = useSlideUp(5, 22);

  const rotY = frame * 0.013;
  const cosY = Math.cos(rotY),
    sinY = Math.sin(rotY);
  const TILT = 0.3;
  const cosX = Math.cos(TILT),
    sinX = Math.sin(TILT);

  // Zoom: in [40→120], hold [120→145], out [145→195]
  const zoomProgress = interpolate(frame, [40, 120, 145, 195], [0, 1, 1, 0], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zoom = 1 + zoomProgress * 2.0;
  const panX = zoomProgress * 160,
    panY = zoomProgress * -90;

  // Project
  const projected = ALL_NODES.map((node) => {
    const rx = node.x * cosY - node.z * sinY;
    const rz = node.x * sinY + node.z * cosY;
    const fy = node.y * cosX - rz * sinX;
    const fz = node.y * sinX + rz * cosX;
    const p = 2.4 / (2.4 + fz * 0.55);
    const sx = 960 + panX + rx * p * BASE_RADIUS * zoom;
    const sy = 540 + panY + fy * p * BASE_RADIUS * zoom;
    const op = interpolate(fz, [-1.3, 0, 1.3], [0.04, 0.55, 1.0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const sz = p * (node.type === "user" ? 6.5 : 3.5) * Math.min(zoom, 2.2);
    return { sx, sy, depth: fz, op, sz, type: node.type };
  });

  const sortedIdx = projected
    .map((_, i) => i)
    .sort((a, b) => projected[a].depth - projected[b].depth);

  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.18);
  const showPulse = zoomProgress > 0.4;

  // Message: appears at frame 195 (zoom fully out), readable for ~100 frames = 3.3 s
  const msgOp = interpolate(frame, [195, 215], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subOp = interpolate(frame, [210, 228], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cntOp = interpolate(frame, [18, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background:
          "linear-gradient(160deg,#050a12 0%,#0a0e1f 55%,#090517 100%)",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle,rgba(96,165,250,0.04) 1px,transparent 1px)",
          backgroundSize: "52px 52px",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%,rgba(124,58,237,0.08) 0%,transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <radialGradient id="sn_ag" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#5b21b6" />
          </radialGradient>
          <radialGradient id="sn_us" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="100%" stopColor="#065f46" />
          </radialGradient>
          <filter id="sn_gl" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges — three visual tiers */}
        {EDGES.map((edge, i) => {
          const a = projected[edge.a],
            b = projected[edge.b];
          const avg = (a.op + b.op) / 2;
          const kind = EDGE_KINDS[i];
          const isPulse = PULSE_EDGES.includes(i) && showPulse;
          if (kind === "uu") {
            // Hierarchy lines: bright green, thick
            return (
              <line
                key={i}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="#34d399"
                strokeWidth={isPulse ? 2 + pulse : 1.8}
                strokeOpacity={Math.min(
                  1,
                  avg * 0.8 + (isPulse ? pulse * 0.4 : 0)
                )}
              />
            );
          }
          if (kind === "au") {
            // Agent–user: medium green
            return (
              <line
                key={i}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="#10b981"
                strokeWidth={1.1}
                strokeOpacity={avg * 0.5}
              />
            );
          }
          // Agent–agent: dim purple
          return (
            <line
              key={i}
              x1={a.sx}
              y1={a.sy}
              x2={b.sx}
              y2={b.sy}
              stroke="#7c3aed"
              strokeWidth={0.65}
              strokeOpacity={avg * 0.25}
            />
          );
        })}

        {/* Nodes — depth-sorted */}
        {sortedIdx.map((idx) => {
          const { sx, sy, op, sz, type } = projected[idx];
          return (
            <g key={idx} filter={op > 0.5 ? "url(#sn_gl)" : undefined}>
              <circle
                cx={sx}
                cy={sy}
                r={sz * 2.2}
                fill={type === "agent" ? "#7c3aed" : "#10b981"}
                fillOpacity={op * 0.07}
              />
              <circle
                cx={sx}
                cy={sy}
                r={sz}
                fill={type === "agent" ? "url(#sn_ag)" : "url(#sn_us)"}
                opacity={op}
              />
            </g>
          );
        })}
      </svg>

      {/* Counter badges */}
      <div
        style={{
          position: "absolute",
          top: 48,
          right: 72,
          display: "flex",
          gap: 12,
          opacity: cntOp,
        }}
      >
        {[
          {
            label: `${AGENT_COUNT} agents`,
            bg: "rgba(124,58,237,0.18)",
            border: "rgba(124,58,237,0.35)",
            color: "#a78bfa",
          },
          {
            label: `${USER_COUNT} users`,
            bg: "rgba(16,185,129,0.12)",
            border: "rgba(16,185,129,0.28)",
            color: "#6ee7b7",
          },
        ].map(({ label, bg, border, color }) => (
          <div
            key={label}
            style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 100,
              padding: "8px 18px",
              fontSize: 30,
              fontWeight: 700,
              color,
              fontFamily: MONO,
            }}
          >
            ● {label}
          </div>
        ))}
      </div>

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 72,
          opacity: titleSlide.opacity,
          transform: `translateY(${titleSlide.y}px)`,
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: BRAND.blue400,
            fontFamily: MONO,
          }}
        >
          VaultysId Network
        </div>
      </div>

      {/* End message — visible ~100 frames = 3.3 s */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0 80px 72px",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 62,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            color: BRAND.text,
            opacity: msgOp,
            marginBottom: 16,
          }}
        >
          Every channel,{" "}
          <span
            style={{
              background: "linear-gradient(90deg,#60a5fa,#a78bfa,#6ee7b7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            secured.
          </span>
        </div>
        <div
          style={{
            fontSize: 30,
            color: BRAND.muted,
            opacity: subOp,
            fontFamily: MONO,
            letterSpacing: "0.03em",
          }}
        >
          Agent ↔ Agent &nbsp;·&nbsp; Agent ↔ Human
        </div>
      </div>
    </AbsoluteFill>
  );
};
