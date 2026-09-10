/**
 * PeerTrustDiagram — pure SVG, SSR-safe.
 *
 * The point the landing page has to land: the control plane signs and
 * distributes certificates, and after that it is not in the path. Peers
 * verify each other directly.
 */
import React from "react";

const MONO = '"JetBrains Mono","Fira Code",monospace';

function Peer({
  x,
  y,
  label,
  sub,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
}) {
  return (
    <g>
      <rect
        x={x - 62}
        y={y - 26}
        width="124"
        height="52"
        rx="8"
        fill="#161b22"
        stroke="#30363d"
      />
      <rect x={x - 61} y={y - 26} width="122" height="2.5" rx="1.25" fill="#3fb950" />
      <text
        x={x}
        y={y - 6}
        fill="#e6edf3"
        fontSize="10.5"
        fontFamily={MONO}
        fontWeight="700"
        textAnchor="middle"
      >
        {label}
      </text>
      <text x={x} y={y + 9} fill="#8b949e" fontSize="8.5" fontFamily={MONO} textAnchor="middle">
        {sub}
      </text>
      <text x={x} y={y + 21} fill="#3fb950" fontSize="8" fontFamily={MONO} textAnchor="middle">
        holds cert ⬡
      </text>
    </g>
  );
}

export default function PeerTrustDiagram(): React.ReactElement {
  // Triangle, so the third edge is a clean horizontal under the top peer
  // rather than an arc back through the issuance half of the figure.
  const TOP = { x: 300, y: 252 };
  const L = { x: 110, y: 340 };
  const R = { x: 490, y: 340 };

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #30363d", lineHeight: 1 }}>
      <svg
        viewBox="0 0 600 400"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "auto", display: "block", background: "#0d1117" }}
        aria-label="The control plane signs and distributes certificates once; afterwards peers verify each other directly, with the control plane out of the path."
      >
        <defs>
          <pattern id="pt-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="1.3" fill="#21262d" />
          </pattern>
          <marker id="pt-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#3fb950" />
          </marker>
          <marker id="pt-arrow-b" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#7c3aed" />
          </marker>
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .pt-issue { stroke-dasharray: 5 4; animation: ptFlow 1.4s linear infinite; }
            @keyframes ptFlow { from { stroke-dashoffset: 9; } to { stroke-dashoffset: 0; } }
            @media (prefers-reduced-motion: reduce) { .pt-issue { animation: none; } }
          `,
            }}
          />
        </defs>

        <rect width="600" height="400" fill="url(#pt-dots)" />

        {/* ── Phase 1: issuance ── */}
        <text x="20" y="26" fill="#a78bfa" fontSize="8.5" fontFamily={MONO} fontWeight="700" letterSpacing="1.1">
          ONCE — ISSUANCE
        </text>
        <rect
          x="176"
          y="40"
          width="248"
          height="56"
          rx="9"
          fill="rgba(124,58,237,0.08)"
          stroke="rgba(124,58,237,0.4)"
        />
        <text x="300" y="64" fill="#e6edf3" fontSize="11" fontFamily={MONO} fontWeight="700" textAnchor="middle">
          Control plane
        </text>
        <text x="300" y="80" fill="#a78bfa" fontSize="8.5" fontFamily={MONO} textAnchor="middle">
          signs + distributes certificates
        </text>

        {/* issuance edges — each sweeps clear of the top peer's box */}
        <path
          d={`M 300,96 C 300,150 ${L.x},170 ${L.x},${L.y - 26}`}
          fill="none"
          stroke="#7c3aed"
          strokeWidth="1.4"
          strokeOpacity="0.55"
          className="pt-issue"
          markerEnd="url(#pt-arrow-b)"
        />
        <path
          d={`M 300,96 L 300,${TOP.y - 26}`}
          fill="none"
          stroke="#7c3aed"
          strokeWidth="1.4"
          strokeOpacity="0.55"
          className="pt-issue"
          markerEnd="url(#pt-arrow-b)"
        />
        <path
          d={`M 300,96 C 300,150 ${R.x},170 ${R.x},${R.y - 26}`}
          fill="none"
          stroke="#7c3aed"
          strokeWidth="1.4"
          strokeOpacity="0.55"
          className="pt-issue"
          markerEnd="url(#pt-arrow-b)"
        />

        {/* the seam */}
        <line x1="16" y1="196" x2="584" y2="196" stroke="#30363d" strokeDasharray="3 5" />
        <rect x="206" y="186" width="188" height="20" rx="10" fill="#0d1117" stroke="#30363d" />
        <text x="300" y="200" fill="#8b949e" fontSize="8.5" fontFamily={MONO} textAnchor="middle">
          control plane leaves the path
        </text>

        {/* ── Phase 2: peer to peer ── */}
        <text x="20" y="232" fill="#3fb950" fontSize="8.5" fontFamily={MONO} fontWeight="700" letterSpacing="1.1">
          FROM THEN ON — PEER TO PEER
        </text>

        {/* peer edges: two diagonals plus one horizontal, no control plane involved */}
        <path
          d={`M ${L.x + 45},${L.y - 26} L ${TOP.x - 45},${TOP.y + 26}`}
          fill="none"
          stroke="#3fb950"
          strokeWidth="1.4"
          strokeOpacity="0.75"
          markerEnd="url(#pt-arrow)"
          markerStart="url(#pt-arrow)"
        />
        <path
          d={`M ${R.x - 45},${R.y - 26} L ${TOP.x + 45},${TOP.y + 26}`}
          fill="none"
          stroke="#3fb950"
          strokeWidth="1.4"
          strokeOpacity="0.75"
          markerEnd="url(#pt-arrow)"
          markerStart="url(#pt-arrow)"
        />
        <path
          d={`M ${L.x + 62},${L.y} L ${R.x - 62},${R.y}`}
          fill="none"
          stroke="#3fb950"
          strokeWidth="1.4"
          strokeOpacity="0.75"
          markerEnd="url(#pt-arrow)"
          markerStart="url(#pt-arrow)"
        />

        <text x="300" y="330" fill="#3fb950" fontSize="8.5" fontFamily={MONO} textAnchor="middle">
          verify each other offline · any pair, no broker
        </text>

        <Peer x={TOP.x} y={TOP.y} label="fleet-agent" sub="@vaultysclaw/sdk" />
        <Peer x={L.x} y={L.y} label="drone-07" sub="sdk-go · airframe" />
        <Peer x={R.x} y={R.y} label="cell-robot-12" sub="sdk-go · PLC" />
      </svg>
    </div>
  );
}
