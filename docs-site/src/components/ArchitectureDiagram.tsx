/**
 * ArchitectureDiagram — pure SVG, no external runtime dependencies.
 * Scales to any container width via viewBox; SSR-safe.
 */
import React from "react";

const MONO = '"JetBrains Mono","Fira Code",monospace';

/* ── Sub-components ─────────────────────────────────────────── */

function ServiceCard({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  accent: string;
}) {
  const cx = x + w / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={7}
        fill="#1c2128"
        stroke={accent}
        strokeWidth="1"
      />
      {/* accent top stripe */}
      <rect
        x={x + 1}
        y={y}
        width={w - 2}
        height={2.5}
        rx="1.25"
        fill={accent}
      />
      <text
        x={cx}
        y={subtitle ? y + h / 2 - 5 : y + h / 2 + 1}
        fill="#e6edf3"
        fontSize={11}
        fontFamily={MONO}
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {title}
      </text>
      {subtitle && (
        <text
          x={cx}
          y={y + h / 2 + 14}
          fill="#8b949e"
          fontSize={9}
          fontFamily={MONO}
          textAnchor="middle"
        >
          {subtitle}
        </text>
      )}
    </g>
  );
}

function AgentCard({
  x,
  y,
  w,
  h,
  llm,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  llm: string;
}) {
  const cx = x + w / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={7}
        fill="#161b22"
        stroke="#30363d"
        strokeWidth="1"
      />
      <rect
        x={x + 1}
        y={y}
        width={w - 2}
        height={2.5}
        rx="1.25"
        fill="#7c3aed"
      />
      <text
        x={cx}
        y={y + 22}
        fill="#a78bfa"
        fontSize={8}
        fontFamily={MONO}
        fontWeight="700"
        textAnchor="middle"
        letterSpacing="0.8"
      >
        AGENT CONTROLLER
      </text>
      <text
        x={cx}
        y={y + 45}
        fill="#e6edf3"
        fontSize={12}
        fontFamily={MONO}
        fontWeight="700"
        textAnchor="middle"
      >
        {llm}
      </text>
      <text
        x={cx}
        y={y + 65}
        fill="#3fb950"
        fontSize={10}
        fontFamily={MONO}
        textAnchor="middle"
      >
        VaultysId ⬡
      </text>
    </g>
  );
}

/* ── Main diagram ────────────────────────────────────────────── */

export default function ArchitectureDiagram() {
  // WebSocket Hub geometry
  const WS = { x: 432, y: 46, w: 148, h: 65 };
  const SRC = { x: WS.x + WS.w / 2, y: WS.y + WS.h }; // 506, 111

  const AGENTS = [
    { x: 10, y: 278, w: 162, h: 88, llm: "LLM: GPT-4o" },
    { x: 218, y: 278, w: 162, h: 88, llm: "LLM: Claude" },
    { x: 428, y: 278, w: 162, h: 88, llm: "LLM: Ollama" },
  ];

  const MID_Y = (SRC.y + AGENTS[0].y) / 2; // ~194.5

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #30363d",
        lineHeight: 1,
      }}
    >
      <svg
        viewBox="0 0 600 382"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          background: "#0d1117",
        }}
        aria-label="VaultysClaw architecture: Control Plane with three connected Agent Controllers"
      >
        <defs>
          {/* dot-grid background */}
          <pattern
            id="vc-dots"
            x="0"
            y="0"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="11" cy="11" r="1.3" fill="#21262d" />
          </pattern>
          {/* arrowhead */}
          <marker
            id="vc-arrow"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L8,3 L0,6 Z" fill="#7c3aed" />
          </marker>
          {/* animated-dash keyframe */}
          {/* eslint-disable-next-line react/no-danger */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .vc-edge {
              stroke-dasharray: 5 3;
              animation: vcFlow 0.9s linear infinite;
            }
            @keyframes vcFlow {
              from { stroke-dashoffset: 8; }
              to   { stroke-dashoffset: 0; }
            }
          `,
            }}
          />
        </defs>

        {/* background */}
        <rect width="600" height="382" fill="url(#vc-dots)" />

        {/* ── Control Plane frame ── */}
        <rect
          x="10"
          y="10"
          width="580"
          height="198"
          rx="10"
          fill="rgba(29,78,216,0.05)"
          stroke="rgba(29,78,216,0.32)"
          strokeWidth="1"
        />

        <text
          x="22"
          y="27"
          fill="#60a5fa"
          fontSize="8.5"
          fontFamily={MONO}
          fontWeight="700"
          letterSpacing="1.1"
        >
          CONTROL PLANE :3000 / :8080
        </text>

        {/* VaultysId badge */}
        <rect
          x="456"
          y="185"
          width="120"
          height="19"
          rx="9.5"
          fill="rgba(124,58,237,0.13)"
          stroke="rgba(124,58,237,0.28)"
          strokeWidth="1"
        />
        <text
          x="516"
          y="197.5"
          fill="#a78bfa"
          fontSize="10"
          fontFamily={MONO}
          fontWeight="600"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          VaultysId ⬡
        </text>

        {/* ── Internal nodes ── */}
        <ServiceCard
          x={25}
          y={WS.y}
          w={130}
          h={WS.h}
          title="Next.js UI"
          subtitle="Dashboard :3000"
          accent="#60a5fa"
        />
        <ServiceCard
          x={230}
          y={WS.y}
          w={138}
          h={WS.h}
          title="REST API"
          subtitle="/api/**  :3000"
          accent="#3fb950"
        />
        <ServiceCard
          x={WS.x}
          y={WS.y}
          w={WS.w}
          h={WS.h}
          title="WebSocket Hub"
          subtitle=":8080"
          accent="#a78bfa"
        />

        {/* SQLite */}
        <rect
          x="152"
          y="134"
          width="274"
          height="50"
          rx="7"
          fill="#1c2128"
          stroke="#30363d"
          strokeWidth="1"
        />
        <text
          x="289"
          y="156"
          fill="#8b949e"
          fontSize="11"
          fontFamily={MONO}
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          SQLite Database
        </text>
        <text
          x="289"
          y="173"
          fill="#484f58"
          fontSize="8.5"
          fontFamily={MONO}
          textAnchor="middle"
        >
          agents · intents · policies · realms
        </text>

        {/* ── Edges: WebSocket Hub → Agents ── */}
        {AGENTS.map((a, i) => {
          const tX = a.x + a.w / 2;
          const d = `M ${SRC.x},${SRC.y} C ${SRC.x},${MID_Y} ${tX},${MID_Y} ${tX},${a.y}`;
          return (
            <g key={i}>
              {/* subtle glow */}
              <path
                d={d}
                fill="none"
                stroke="#7c3aed"
                strokeWidth="5"
                strokeOpacity="0.1"
              />
              {/* animated line */}
              <path
                d={d}
                fill="none"
                stroke="#7c3aed"
                strokeWidth="1.5"
                className="vc-edge"
                markerEnd="url(#vc-arrow)"
              />
            </g>
          );
        })}

        {/* "WSS signed" label on middle edge */}
        <rect
          x="365"
          y="188"
          width="72"
          height="16"
          rx="4"
          fill="#0d1117"
          fillOpacity="0.92"
          stroke="rgba(124,58,237,0.3)"
          strokeWidth="1"
        />
        <text
          x="401"
          y="196"
          fill="#a78bfa"
          fontSize="8.5"
          fontFamily={MONO}
          fontWeight="600"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          WSS signed
        </text>

        {/* ── Agent nodes ── */}
        {AGENTS.map((a) => (
          <AgentCard key={a.llm} x={a.x} y={a.y} w={a.w} h={a.h} llm={a.llm} />
        ))}
      </svg>
    </div>
  );
}
