import React from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  ShieldCheck,
  Brain,
  Zap,
  MapPin,
  XCircle,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────────────────────── */
function ComparisonHero() {
  return (
    <section className="hero-section">
      <div className="hero-grid" />
      <div className="container">
        <div style={{ textAlign: "center", maxWidth: "860px", margin: "0 auto" }}>
          <div className="hero-badge">
            <CheckCircle2 size={12} strokeWidth={2.5} />
            Why Vaultys Claw
          </div>
          <h1 className="hero-title">
            The fundamental differences
            <br />
            <span className="gradient-text">that actually matter</span>
          </h1>
          <p className="hero-subtitle" style={{ maxWidth: "680px", margin: "0 auto 40px" }}>
            Most AI orchestration platforms treat agents as stateless cloud tools. Vaultys Claw is built
            on completely different principles — decentralized identity, cryptographic security, true
            autonomy, and agents that live where your data does.
          </p>
          <div className="hero-cta-group" style={{ justifyContent: "center" }}>
            <Link className="btn-primary" to="/docs/guides/quickstart">
              Get started <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <Link className="btn-secondary" to="/docs/intro">
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Shared card frame
   ──────────────────────────────────────────────────────────── */
function ComparisonBlock({
  icon,
  accentColor,
  title,
  vcLabel,
  vcDesc,
  tradLabel,
  tradDesc,
  vcDiagram,
  tradDiagram,
}: {
  icon: React.ReactNode;
  accentColor: string;
  title: string;
  vcLabel: string;
  vcDesc: string;
  tradLabel: string;
  tradDesc: string;
  vcDiagram: React.ReactNode;
  tradDiagram: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--ifm-card-background-color)",
        border: "1px solid var(--ifm-color-emphasis-200)",
        borderRadius: "16px",
        overflow: "hidden",
        marginBottom: "40px",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "20px 28px",
          borderBottom: "1px solid var(--ifm-color-emphasis-200)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "8px",
            background: `${accentColor}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "var(--ifm-color-emphasis-900)" }}>
          {title}
        </h2>
      </div>

      {/* Two panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Vaultys Claw panel */}
        <div
          style={{
            padding: "28px 32px",
            borderRight: "1px solid var(--ifm-color-emphasis-200)",
            background: `${accentColor}08`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "var(--ifm-background-color)",
              border: `1px solid ${accentColor}30`,
              borderRadius: "12px",
              padding: "24px",
            }}
          >
            {vcDiagram}
          </div>
          <div style={{ marginTop: "20px" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: accentColor,
              }}
            >
              ✦ Vaultys Claw
            </span>
            <p style={{ margin: "8px 0 0", fontSize: "0.9rem", lineHeight: 1.65, color: "var(--ifm-color-emphasis-700)" }}>
              {vcDesc}
            </p>
          </div>
        </div>

        {/* Traditional panel */}
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              background: "var(--ifm-background-color)",
              border: "1px solid var(--ifm-color-emphasis-300)",
              borderRadius: "12px",
              padding: "24px",
            }}
          >
            {tradDiagram}
          </div>
          <div style={{ marginTop: "20px" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#64748b",
              }}
            >
              Traditional platforms
            </span>
            <p style={{ margin: "8px 0 0", fontSize: "0.9rem", lineHeight: 1.65, color: "var(--ifm-color-emphasis-600)" }}>
              {tradDesc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   1 — Identity diagrams
   ──────────────────────────────────────────────────────────── */
function IdentityVC() {
  return (
    <svg viewBox="0 0 280 210" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="idGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <filter id="glow1">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Agent circle */}
      <circle cx="140" cy="68" r="38" fill="url(#idGrad)" filter="url(#glow1)" opacity="0.9" />
      <circle cx="140" cy="68" r="38" fill="none" stroke="#a78bfa" strokeWidth="1.5" />
      <text x="140" y="61" textAnchor="middle" fontSize="11" fontWeight="700" fill="white" fontFamily="system-ui">AGENT</text>
      <text x="140" y="80" textAnchor="middle" fontSize="22" fill="white">⬡</text>

      {/* Connecting line */}
      <line x1="140" y1="108" x2="140" y2="128" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4,3" />
      <circle cx="140" cy="108" r="3" fill="#a78bfa" />

      {/* DID badge */}
      <rect x="24" y="128" width="232" height="38" rx="10" fill="#7c3aed" fillOpacity="0.14" stroke="#a78bfa" strokeWidth="1.5" />
      <text x="140" y="143" textAnchor="middle" fontSize="12" fontWeight="700" fill="#a78bfa" fontFamily="'JetBrains Mono', monospace">did:vaultys:z6MkfX3Q…</text>
      <text x="140" y="158" textAnchor="middle" fontSize="10" fill="#7c3aed" fontFamily="system-ui">W3C Decentralized Identifier</text>

      {/* Footer pills */}
      <rect x="12" y="180" width="120" height="22" rx="11" fill="#10b981" fillOpacity="0.15" stroke="#10b981" strokeWidth="1" />
      <text x="71" y="195" textAnchor="middle" fontSize="11" fontWeight="600" fill="#10b981">✓ Permanent</text>
      <rect x="160" y="180" width="120" height="22" rx="11" fill="#10b981" fillOpacity="0.15" stroke="#10b981" strokeWidth="1" />
      <text x="219" y="195" textAnchor="middle" fontSize="11" fontWeight="600" fill="#10b981">✓ Non-transferable</text>
    </svg>
  );
}

function IdentityTraditional() {
  return (
    <svg viewBox="0 0 280 210" style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Agent circle */}
      <circle cx="140" cy="68" r="38" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
      <text x="140" y="61" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8" fontFamily="system-ui">AGENT</text>
      <text x="140" y="80" textAnchor="middle" fontSize="24" fill="#64748b">?</text>

      {/* Connecting line */}
      <line x1="140" y1="108" x2="140" y2="128" stroke="#475569" strokeWidth="2" strokeDasharray="4,3" />
      <circle cx="140" cy="108" r="3" fill="#475569" />

      {/* Token badge */}
      <rect x="24" y="128" width="232" height="38" rx="10" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
      <text x="140" y="143" textAnchor="middle" fontSize="12" fontWeight="700" fill="#64748b" fontFamily="'JetBrains Mono', monospace">Authorization: Bearer xK8…</text>
      <text x="140" y="158" textAnchor="middle" fontSize="10" fill="#475569" fontFamily="system-ui">Platform-managed credential</text>

      {/* Footer pills */}
      <rect x="20" y="180" width="108" height="22" rx="11" fill="#ef444420" stroke="#ef4444" strokeWidth="1" />
      <text x="74" y="195" textAnchor="middle" fontSize="10" fontWeight="600" fill="#ef4444">✗ Ephemeral</text>
      <rect x="136" y="180" width="124" height="22" rx="11" fill="#ef444420" stroke="#ef4444" strokeWidth="1" />
      <text x="198" y="195" textAnchor="middle" fontSize="10" fontWeight="600" fill="#ef4444">✗ No crypto proof</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   2 — Security diagrams
   ──────────────────────────────────────────────────────────── */
function SecurityVC() {
  return (
    <svg viewBox="0 0 280 230" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="secGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <marker id="arr1" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#10b981" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* Agent */}
      <rect x="20" y="20" width="80" height="44" rx="8" fill="#059669" fillOpacity="0.18" stroke="#10b981" strokeWidth="1.5" />
      <text x="60" y="39" textAnchor="middle" fontSize="11" fontWeight="700" fill="#10b981">Agent</text>
      <text x="60" y="56" textAnchor="middle" fontSize="10" fill="#6ee7b7">🔏 signs intent</text>

      {/* Arrow → signed payload */}
      <line x1="102" y1="42" x2="132" y2="42" stroke="#10b981" strokeWidth="2" markerEnd="url(#arr1)" />

      {/* Signed payload */}
      <rect x="134" y="20" width="126" height="44" rx="8" fill="#059669" fillOpacity="0.18" stroke="#10b981" strokeWidth="1.5" />
      <text x="197" y="39" textAnchor="middle" fontSize="11" fontWeight="700" fill="#10b981">Signed Payload</text>
      <text x="197" y="56" textAnchor="middle" fontSize="10" fill="#6ee7b7" fontFamily="monospace">sig: 3a8f…c92d ✓</text>

      {/* Downward arrows */}
      <line x1="60" y1="66" x2="60" y2="90" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arr1)" />
      <line x1="197" y1="66" x2="197" y2="90" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arr1)" />

      {/* Any receiver */}
      <rect x="20" y="92" width="80" height="44" rx="8" fill="#059669" fillOpacity="0.18" stroke="#10b981" strokeWidth="1.5" />
      <text x="60" y="111" textAnchor="middle" fontSize="11" fontWeight="700" fill="#10b981">Recipient</text>
      <text x="60" y="127" textAnchor="middle" fontSize="10" fill="#6ee7b7">verifies sig</text>

      {/* Verify → result */}
      <line x1="102" y1="114" x2="132" y2="114" stroke="#10b981" strokeWidth="2" markerEnd="url(#arr1)" />

      <rect x="134" y="92" width="126" height="44" rx="8" fill="#059669" fillOpacity="0.25" stroke="#10b981" strokeWidth="1.5" />
      <text x="197" y="108" textAnchor="middle" fontSize="18" fill="#10b981">✅</text>
      <text x="197" y="128" textAnchor="middle" fontSize="11" fontWeight="700" fill="#10b981">Verified independently</text>

      {/* Divider */}
      <line x1="20" y1="152" x2="260" y2="152" stroke="#10b98130" strokeWidth="1" />

      {/* PQC badge */}
      <rect x="20" y="162" width="232" height="58" rx="10" fill="#0f766e22" stroke="#14b8a6" strokeWidth="1.5" />
      <text x="140" y="181" textAnchor="middle" fontSize="12" fontWeight="700" fill="#14b8a6">Post-Quantum Crypto Ready</text>
      <text x="140" y="198" textAnchor="middle" fontSize="9" fill="#5eead4">No forklift upgrade needed —</text>
      <text x="140" y="212" textAnchor="middle" fontSize="9" fill="#5eead4">swap algorithms via config</text>
    </svg>
  );
}

function SecurityTraditional() {
  return (
    <svg viewBox="0 0 280 230" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="arr2" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#64748b" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* Agent */}
      <rect x="20" y="20" width="72" height="44" rx="8" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
      <text x="56" y="39" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">Agent</text>
      <text x="56" y="56" textAnchor="middle" fontSize="10" fill="#64748b">sends token</text>

      <line x1="94" y1="42" x2="116" y2="42" stroke="#64748b" strokeWidth="2" markerEnd="url(#arr2)" />

      {/* Cloud Provider */}
      <rect x="118" y="20" width="142" height="44" rx="8" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
      <text x="189" y="39" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">☁ Cloud Provider</text>
      <text x="189" y="56" textAnchor="middle" fontSize="10" fill="#64748b">"trust us"</text>

      {/* Down arrow from cloud */}
      <line x1="189" y1="66" x2="189" y2="90" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arr2)" />

      {/* Trust decision */}
      <rect x="118" y="92" width="142" height="44" rx="8" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
      <text x="189" y="111" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">Centralized decision</text>
      <text x="189" y="127" textAnchor="middle" fontSize="10" fill="#64748b">no independent verification</text>

      {/* Risk box */}
      <line x1="20" y1="152" x2="260" y2="152" stroke="#47556930" strokeWidth="1" />
      <rect x="20" y="162" width="232" height="58" rx="10" fill="#ef444415" stroke="#ef4444" strokeWidth="1.5" />
      <text x="140" y="181" textAnchor="middle" fontSize="12" fontWeight="700" fill="#ef4444">⚠ Single Point of Trust</text>
      <text x="140" y="198" textAnchor="middle" fontSize="9" fill="#fca5a5">Insider threats &amp; provider breach</text>
      <text x="140" y="213" textAnchor="middle" fontSize="9" fill="#fca5a5">= full chain exposure</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   3 — Autonomy diagrams
   ──────────────────────────────────────────────────────────── */
function AutonomyVC() {
  return (
    <svg viewBox="0 0 280 230" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="autoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <marker id="arr3" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#a855f7" strokeWidth="1.5" />
        </marker>
        <marker id="arr3b" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#ec4899" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* Control plane — small, at top */}
      <rect x="90" y="16" width="100" height="34" rx="8" fill="#a855f740" stroke="#a855f7" strokeWidth="1.5" />
      <text x="140" y="30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#a855f7">Control Plane</text>
      <text x="140" y="43" textAnchor="middle" fontSize="9" fill="#c084fc">policy config only</text>

      {/* Three agent circles */}
      {[50, 140, 230].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="130" r="30" fill="url(#autoGrad)" fillOpacity="0.2" stroke="#ec4899" strokeWidth="1.5" />
          <text x={cx} y="126" textAnchor="middle" fontSize="11" fontWeight="700" fill="#f9a8d4">A{i + 1}</text>
          <text x={cx} y="143" textAnchor="middle" fontSize="8" fill="#f472b6">autonomous</text>
        </g>
      ))}

      {/* Direct agent-to-agent arrows */}
      <line x1="80" y1="118" x2="112" y2="118" stroke="#ec4899" strokeWidth="2" markerEnd="url(#arr3b)" />
      <line x1="112" y1="140" x2="80" y2="140" stroke="#a855f7" strokeWidth="2" markerEnd="url(#arr3)" />
      <line x1="170" y1="118" x2="202" y2="118" stroke="#ec4899" strokeWidth="2" markerEnd="url(#arr3b)" />
      <line x1="202" y1="140" x2="170" y2="140" stroke="#a855f7" strokeWidth="2" markerEnd="url(#arr3)" />

      {/* Footer */}
      <line x1="20" y1="175" x2="260" y2="175" stroke="#a855f730" strokeWidth="1" />
      <rect x="20" y="184" width="232" height="36" rx="8" fill="#a855f715" stroke="#a855f740" strokeWidth="1" />
      <text x="140" y="199" textAnchor="middle" fontSize="12" fontWeight="700" fill="#c084fc">Direct peer-to-peer coordination</text>
      <text x="140" y="213" textAnchor="middle" fontSize="10" fill="#a78bfa">Control plane never in the hot path</text>
    </svg>
  );
}

function AutonomyTraditional() {
  return (
    <svg viewBox="0 0 280 230" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="arr4" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#64748b" strokeWidth="1.5" />
        </marker>
        <marker id="arr4b" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#ef4444" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* Control plane — large, dominant */}
      <rect x="60" y="16" width="160" height="48" rx="8" fill="#1e293b" stroke="#ef4444" strokeWidth="2" />
      <text x="140" y="36" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fca5a5">Control Plane</text>
      <text x="140" y="55" textAnchor="middle" fontSize="10" fill="#ef4444">ALL decisions routed here</text>

      {/* Three agent circles */}
      {[50, 140, 230].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="148" r="24" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          <text x={cx} y="145" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">A{i + 1}</text>
          <text x={cx} y="160" textAnchor="middle" fontSize="8" fill="#64748b">puppet</text>
        </g>
      ))}

      {/* All arrows go UP to control plane */}
      {[50, 140, 230].map((cx, i) => (
        <g key={i}>
          {/* up to CP */}
          <line x1={cx} y1="124" x2={cx - (cx - 140) * 0.7} y2="66" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arr4)" />
          {/* back down from CP */}
          <line x1={cx - (cx - 140) * 0.7 + 4} y1="68" x2={cx + 4} y2="126" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3,2" markerEnd="url(#arr4b)" />
        </g>
      ))}

      {/* Footer */}
      <line x1="20" y1="184" x2="260" y2="184" stroke="#47556930" strokeWidth="1" />
      <rect x="8" y="193" width="265" height="28" rx="8" fill="#ef444415" stroke="#ef4444" strokeWidth="1" />
      <text x="140" y="211" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ef4444">⚠ Bottleneck — latency grows with every agent</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   4 — Resource diagrams
   ──────────────────────────────────────────────────────────── */
function ResourceVC() {
  const agents = [40, 90, 140, 190, 240];
  return (
    <svg viewBox="0 0 280 230" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="cpuLow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* Five agents with local chips */}
      {agents.map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="56" r="20" fill="#059669" fillOpacity="0.18" stroke="#10b981" strokeWidth="1.5" />
          <text x={cx} y="53" textAnchor="middle" fontSize="9" fontWeight="700" fill="#10b981">A{i + 1}</text>
          <text x={cx} y="65" textAnchor="middle" fontSize="8" fill="#6ee7b7">local</text>
        </g>
      ))}

      <text x="140" y="96" textAnchor="middle" fontSize="11" fill="#6ee7b7">each validates policy locally</text>

      {/* CPU usage bar — small */}
      <text x="20" y="124" fontSize="11" fontWeight="700" fill="#94a3b8">Control Plane CPU load</text>
      <rect x="20" y="132" width="240" height="18" rx="4" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      <rect x="20" y="132" width="48" height="18" rx="4" fill="url(#cpuLow)" />
      <text x="278" y="145" textAnchor="end" fontSize="11" fontWeight="700" fill="#10b981">20%</text>

      {/* Divider */}
      <line x1="20" y1="164" x2="260" y2="164" stroke="#10b98130" strokeWidth="1" />

      {/* Stats */}
      {[["5 000 agents", "#10b981"], ["~20% CP load", "#10b981"], ["linear scaling", "#10b981"]].map(([label, color], i) => (
        <g key={i}>
          <rect x={20 + i * 88} y="172" width="80" height="44" rx="8" fill="#10b98112" stroke="#10b98130" strokeWidth="1" />
          <text x={60 + i * 88} y="192" textAnchor="middle" fontSize="11" fontWeight="700" fill={color as string}>{label}</text>
          <text x={60 + i * 88} y="207" textAnchor="middle" fontSize="9" fill="#6ee7b7">✓</text>
        </g>
      ))}
    </svg>
  );
}

function ResourceTraditional() {
  const agents = [40, 90, 140, 190, 240];
  return (
    <svg viewBox="0 0 280 230" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="cpuHigh" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* Five agents */}
      {agents.map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="56" r="20" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          <text x={cx} y="53" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8">A{i + 1}</text>
          <text x={cx} y="65" textAnchor="middle" fontSize="8" fill="#64748b">→ CP</text>
        </g>
      ))}

      <text x="140" y="96" textAnchor="middle" fontSize="11" fill="#f87171">every request hits the control plane</text>

      {/* CPU usage bar — huge */}
      <text x="20" y="124" fontSize="11" fontWeight="700" fill="#94a3b8">Control Plane CPU load</text>
      <rect x="20" y="132" width="240" height="18" rx="4" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      <rect x="20" y="132" width="216" height="18" rx="4" fill="url(#cpuHigh)" />
      <text x="278" y="145" textAnchor="end" fontSize="11" fontWeight="700" fill="#ef4444">90%</text>

      {/* Divider */}
      <line x1="20" y1="164" x2="260" y2="164" stroke="#ef444430" strokeWidth="1" />

      {/* Stats */}
      {[["5 000 agents", "#ef4444"], [">90% CP load", "#ef4444"], ["bottleneck", "#ef4444"]].map(([label, color], i) => (
        <g key={i}>
          <rect x={20 + i * 88} y="172" width="80" height="44" rx="8" fill="#ef444412" stroke="#ef444430" strokeWidth="1" />
          <text x={60 + i * 88} y="192" textAnchor="middle" fontSize="11" fontWeight="700" fill={color as string}>{label}</text>
          <text x={60 + i * 88} y="207" textAnchor="middle" fontSize="9" fill="#fca5a5">✗</text>
        </g>
      ))}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   5 — Data Location diagrams
   ──────────────────────────────────────────────────────────── */
function DataLocationVC() {
  return (
    <svg viewBox="0 0 320 250" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="arr5" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* On-prem box — takes left ~60% of viewBox */}
      <rect x="10" y="16" width="178" height="140" rx="12" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="2" />
      <text x="99" y="37" textAnchor="middle" fontSize="11" fontWeight="700" fill="#93c5fd">Your Infrastructure</text>
      <text x="99" y="51" textAnchor="middle" fontSize="9" fill="#60a5fa">on-prem · VPC · edge</text>

      {/* Data */}
      <rect x="24" y="64" width="68" height="54" rx="8" fill="#1d4ed8" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="1.5" />
      <text x="58" y="86" textAnchor="middle" fontSize="20">🗄️</text>
      <text x="58" y="107" textAnchor="middle" fontSize="11" fontWeight="700" fill="#93c5fd">Your Data</text>

      {/* Agent (next to data) */}
      <rect x="104" y="64" width="70" height="54" rx="8" fill="#1d4ed8" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="1.5" />
      <text x="139" y="86" textAnchor="middle" fontSize="20">🤖</text>
      <text x="139" y="107" textAnchor="middle" fontSize="11" fontWeight="700" fill="#93c5fd">Agent</text>

      {/* Bidirectional in-box arrow */}
      <text x="96" y="95" textAnchor="middle" fontSize="14" fill="#60a5fa">↔</text>

      {/* Outbound-only arrow — label sits above the arrow, clear of both boxes */}
      <text x="252" y="52" textAnchor="middle" fontSize="9" fontWeight="600" fill="#60a5fa">outbound only</text>
      <line x1="190" y1="88" x2="230" y2="88" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arr5)" />

      {/* Control plane — starts at x=234, well clear of infra (ends x=188) */}
      <rect x="234" y="62" width="76" height="54" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,3" />
      <text x="272" y="84" textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">Control</text>
      <text x="272" y="97" textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b">Plane</text>
      <text x="272" y="110" textAnchor="middle" fontSize="8" fill="#475569">config only</text>

      {/* Footer */}
      <line x1="10" y1="170" x2="316" y2="170" stroke="#3b82f630" strokeWidth="1" />
      <rect x="10" y="179" width="306" height="56" rx="10" fill="#1d4ed820" stroke="#3b82f650" strokeWidth="1" />
      <text x="163" y="199" textAnchor="middle" fontSize="11" fontWeight="700" fill="#60a5fa">✓ Data never leaves your perimeter</text>
      <text x="163" y="216" textAnchor="middle" fontSize="9" fill="#93c5fd">No inbound firewall rules</text>
      <text x="163" y="229" textAnchor="middle" fontSize="9" fill="#93c5fd">Agents co-located with data</text>
    </svg>
  );
}

function DataLocationTraditional() {
  return (
    <svg viewBox="0 0 280 240" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="arr6" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7" fill="none" stroke="#ef4444" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* On-prem box — small */}
      <rect x="14" y="16" width="88" height="80" rx="10" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
      <text x="58" y="35" textAnchor="middle" fontSize="10" fontWeight="700" fill="#94a3b8">Your Infra</text>
      <rect x="26" y="45" width="64" height="40" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="1" />
      <text x="58" y="64" textAnchor="middle" fontSize="16">🗄️</text>
      <text x="58" y="78" textAnchor="middle" fontSize="10" fill="#64748b">Data</text>

      {/* Big arrow going out — label above the gap, not inside it */}
      <text x="125" y="10" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ef4444">data exits perimeter</text>
      <line x1="104" y1="56" x2="146" y2="56" stroke="#ef4444" strokeWidth="2.5" markerEnd="url(#arr6)" />

      {/* Cloud box — large */}
      <rect x="148" y="16" width="118" height="130" rx="10" fill="#1e293b" stroke="#ef4444" strokeWidth="2" />
      <text x="207" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fca5a5">☁ Cloud Provider</text>

      <rect x="162" y="48" width="46" height="40" rx="6" fill="#0f172a" stroke="#475569" strokeWidth="1" />
      <text x="185" y="66" textAnchor="middle" fontSize="14">🗄️</text>
      <text x="185" y="80" textAnchor="middle" fontSize="9" fill="#64748b">Data copy</text>

      <rect x="216" y="48" width="40" height="40" rx="6" fill="#0f172a" stroke="#475569" strokeWidth="1" />
      <text x="236" y="66" textAnchor="middle" fontSize="14">🤖</text>
      <text x="236" y="80" textAnchor="middle" fontSize="9" fill="#64748b">Agent</text>

      <text x="207" y="118" textAnchor="middle" fontSize="10" fill="#ef4444">processing in cloud</text>
      <text x="207" y="133" textAnchor="middle" fontSize="9" fill="#64748b">not under your control</text>

      {/* Footer */}
      <line x1="14" y1="162" x2="266" y2="162" stroke="#ef444430" strokeWidth="1" />
      <rect x="14" y="171" width="252" height="50" rx="10" fill="#ef444415" stroke="#ef4444" strokeWidth="1.5" />
      <text x="140" y="191" textAnchor="middle" fontSize="12" fontWeight="700" fill="#ef4444">✗ Data leaves your perimeter</text>
      <text x="140" y="208" textAnchor="middle" fontSize="10" fill="#fca5a5">Inbound ports required · Compliance exposure</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   OpenClaw bridge
   ──────────────────────────────────────────────────────────── */
function OpenClawBridge() {
  const dnaItems = [
    "Local-first, single-binary runtime",
    "Developer-friendly plugin & skill system",
    "Zero cloud lock-in by design",
    "Linear horizontal scaling",
    "Full code ownership",
  ];
  const addedItems = [
    "W3C DID cryptographic agent identity",
    "End-to-end intent & result signing",
    "Post-quantum cryptography (PQC) ready",
    "Multi-tenant org-chart governance",
    "Human-in-the-loop approval workflows",
    "Signed, tamper-proof audit trail",
    "Enterprise SSO & access control",
  ];

  return (
    <section style={{ padding: "64px 0 0" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p className="section-label">The OpenClaw lineage</p>
          <h2 className="section-title">Built on the right foundation</h2>
          <p className="section-subtitle" style={{ maxWidth: "660px", margin: "0 auto" }}>
            OpenClaw proved that agents should be local-first, developer-owned, and free of cloud lock-in.
            Vaultys Claw takes that same foundation and adds the security and governance layer that enterprise deployments cannot skip.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 1fr",
          background: "var(--ifm-card-background-color)",
          border: "1px solid var(--ifm-color-emphasis-200)",
          borderRadius: "16px",
          overflow: "hidden",
        }}>
          {/* OpenClaw side */}
          <div style={{ padding: "40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <div style={{ width: 42, height: 42, borderRadius: "10px", background: "#f59e0b22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>
                🔓
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#f59e0b" }}>OpenClaw</div>
                <div style={{ fontSize: "0.73rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--ifm-color-emphasis-500)" }}>
                  Open-source · developer tool
                </div>
              </div>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--ifm-color-emphasis-600)", lineHeight: 1.65, marginBottom: "24px" }}>
              A lightweight, open-source agent runtime built for developers who want full local ownership.
              No cloud dependency, no monthly bill — agents live on your hardware and scale with your hardware.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {dnaItems.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#f59e0b", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>✓</span>
                  <span style={{ color: "var(--ifm-color-emphasis-700)" }}>{item}</span>
                </div>
              ))}
              {["No cryptographic agent identity", "No signed audit trail", "No enterprise governance"].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#94a3b8", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>—</span>
                  <span style={{ color: "var(--ifm-color-emphasis-400)" }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center connector */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(180deg, rgba(245,158,11,0.06) 0%, rgba(124,58,237,0.08) 100%)",
            borderLeft: "1px solid var(--ifm-color-emphasis-200)",
            borderRight: "1px solid var(--ifm-color-emphasis-200)",
            padding: "32px 0",
          }}>
            <div style={{ flex: 1, width: "2px", background: "linear-gradient(to bottom, #f59e0b80, #7c3aed80)", borderRadius: "2px" }} />
            <div style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #f59e0b, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: "18px", fontWeight: 900,
              margin: "12px 0",
              boxShadow: "0 0 16px rgba(124,58,237,0.4)",
            }}>+</div>
            <div style={{ flex: 1, width: "2px", background: "linear-gradient(to bottom, #7c3aed80, #1d4ed880)", borderRadius: "2px" }} />
          </div>

          {/* Vaultys Claw side */}
          <div style={{ padding: "40px", background: "linear-gradient(160deg, rgba(124,58,237,0.07) 0%, rgba(29,78,216,0.03) 100%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <div style={{ width: 42, height: 42, borderRadius: "10px", background: "#7c3aed22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>
                🔐
              </div>
              <div>
                <div style={{
                  fontWeight: 800, fontSize: "1.15rem",
                  background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>Vaultys Claw</div>
                <div style={{ fontSize: "0.73rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--ifm-color-emphasis-500)" }}>
                  Enterprise-grade security layer
                </div>
              </div>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--ifm-color-emphasis-600)", lineHeight: 1.65, marginBottom: "24px" }}>
              Every strength of OpenClaw — plus the cryptographic identity, governance controls, and audit capabilities
              that regulated industries and security teams require before signing off on deployment.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {dnaItems.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#10b981", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>✓</span>
                  <span style={{ color: "var(--ifm-color-emphasis-700)" }}>{item}</span>
                </div>
              ))}
              {addedItems.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#a78bfa", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>+</span>
                  <span style={{ color: "var(--ifm-color-emphasis-700)", fontWeight: 500 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Feature matrix
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   Multi-competitor matrix data
   ──────────────────────────────────────────────────────────── */
type Support = "yes" | "partial" | "no";

const COMPETITORS: { name: string; note: string; highlight: boolean; dna?: boolean }[] = [
  { name: "Vaultys Claw", note: "This project",            highlight: true              },
  { name: "Prisme.ai",    note: "Enterprise low-code",      highlight: false             },
  { name: "LangGraph",    note: "Python framework",         highlight: false             },
  { name: "CrewAI",       note: "Multi-agent",              highlight: false             },
  { name: "AutoGen",      note: "by Microsoft",             highlight: false             },
  { name: "n8n",          note: "Workflow automation",      highlight: false             },
  { name: "OpenClaw",     note: "Open-source · dev tool",   highlight: false, dna: true  },
];

const COMP_GROUPS: { group: string; color: string; features: { cap: string; values: Support[] }[] }[] = [
  {
    group: "Identity & Security",
    color: "#a78bfa",
    features: [
      { cap: "Cryptographic agent identity (W3C DID)",    values: ["yes","no","no","no","no","no","no"] },
      { cap: "End-to-end intent & result signing",        values: ["yes","no","no","no","no","no","no"] },
      { cap: "Post-quantum cryptography ready",           values: ["yes","no","no","no","no","no","no"] },
      { cap: "Zero-trust — no implicit network trust",    values: ["yes","no","no","no","partial","no","no"] },
    ],
  },
  {
    group: "Autonomy & Architecture",
    color: "#ec4899",
    features: [
      { cap: "True agent autonomy — no CP round-trip",    values: ["yes","partial","yes","partial","yes","partial","yes"] },
      { cap: "Direct peer-to-peer agent coordination",    values: ["yes","partial","yes","partial","yes","no","partial"] },
      { cap: "Runtime local policy validation",           values: ["yes","partial","partial","partial","yes","partial","no"] },
      { cap: "Scales linearly — no central bottleneck",   values: ["yes","partial","yes","partial","yes","partial","yes"] },
    ],
  },
  {
    group: "Deployment & Data",
    color: "#3b82f6",
    features: [
      { cap: "On-prem / VPC / edge deployment",           values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { cap: "Agents co-located with your data",          values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { cap: "Outbound-only controller connection",       values: ["yes","partial","yes","partial","partial","yes","yes"] },
    ],
  },
  {
    group: "Governance & Compliance",
    color: "#10b981",
    features: [
      { cap: "Org-chart-based access control",            values: ["yes","partial","no","no","partial","no","no"] },
      { cap: "Mandatory human approval workflows",        values: ["yes","partial","yes","yes","yes","partial","no"] },
      { cap: "Signed, tamper-proof audit log",            values: ["yes","yes","partial","partial","yes","yes","no"] },
      { cap: "Multi-LLM support",                        values: ["yes","yes","yes","yes","yes","yes","yes"] },
    ],
  },
];

/* Cell component */
function SupportCell({ v, highlight }: { v: Support; highlight?: boolean }) {
  const cfg = {
    yes:     { color: "#10b981", bg: "#10b98115", border: "#10b98130", label: "Yes" },
    partial: { color: "#f59e0b", bg: "#f59e0b15", border: "#f59e0b35", label: "Partial" },
    no:      { color: "#64748b", bg: "#64748b10", border: "#64748b25", label: "No" },
  }[v];
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: highlight && v === "yes" ? "#10b98120" : cfg.bg,
        border: `1px solid ${highlight && v === "yes" ? "#10b98140" : cfg.border}`,
        borderRadius: "100px", padding: "3px 10px",
        fontSize: "0.75rem", fontWeight: 700, color: cfg.color,
        whiteSpace: "nowrap",
      }}>
        {v === "yes" ? "✓" : v === "partial" ? "~" : "✗"} {cfg.label}
      </span>
    </div>
  );
}

function FeatureMatrix() {
  const cols = COMPETITORS.length; // 6
  const total = COMP_GROUPS.reduce((s, g) => s + g.features.length, 0);

  // Count "yes" per competitor
  const scores = COMPETITORS.map((_, ci) =>
    COMP_GROUPS.reduce((s, g) => s + g.features.filter(f => f.values[ci] === "yes").length, 0)
  );

  const gridCols = `1fr repeat(${cols}, 128px)`;

  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-surface-color)" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 40px" }}>

        <div style={{ textAlign: "center", marginBottom: "56px" }}>
          <p className="section-label">Full comparison</p>
          <h2 className="section-title">Feature-by-feature breakdown</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", maxWidth: "560px" }}>
            Compared against the leading AI agent orchestration platforms.
          </p>
        </div>

        <div style={{ borderRadius: "16px", overflow: "hidden", border: "1px solid var(--ifm-color-emphasis-200)" }}>

          {/* ── Column headers ── */}
          <div style={{ display: "grid", gridTemplateColumns: gridCols, background: "var(--ifm-card-background-color)", borderBottom: "2px solid var(--ifm-color-emphasis-200)" }}>
            <div style={{ padding: "20px 28px", display: "flex", alignItems: "flex-end" }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ifm-color-emphasis-500)" }}>
                Capability
              </span>
            </div>
            {COMPETITORS.map((c, ci) => (
              <div key={c.name} style={{
                padding: "16px 8px",
                borderLeft: "1px solid var(--ifm-color-emphasis-200)",
                textAlign: "center",
                background: c.highlight
                  ? "linear-gradient(160deg, rgba(124,58,237,0.14) 0%, rgba(29,78,216,0.08) 100%)"
                  : c.dna ? "rgba(245,158,11,0.06)" : undefined,
                borderBottom: c.highlight ? "2px solid #7c3aed60" : c.dna ? "2px solid #f59e0b40" : "2px solid transparent",
              }}>
                <div style={{
                  fontSize: "0.85rem", fontWeight: 800, marginBottom: "2px",
                  ...(c.highlight ? {
                    background: "linear-gradient(135deg, #a78bfa, #60a5fa)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  } : c.dna ? { color: "#f59e0b" } : { color: "var(--ifm-color-emphasis-700)" }),
                }}>
                  {c.name}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--ifm-color-emphasis-500)" }}>{c.note}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 900, marginTop: "6px", lineHeight: 1, color: c.highlight ? "#10b981" : c.dna ? "#f59e0b" : "#64748b" }}>
                  {scores[ci]}
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.6 }}>/{total}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Feature groups ── */}
          {COMP_GROUPS.map((group) => (
            <React.Fragment key={group.group}>
              {/* Group separator */}
              <div style={{
                display: "grid", gridTemplateColumns: gridCols,
                background: `${group.color}10`,
                borderTop: `2px solid ${group.color}30`,
              }}>
                <div style={{ padding: "8px 28px", gridColumn: `1 / ${cols + 2}`, display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: group.color }} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: group.color }}>
                    {group.group}
                  </span>
                </div>
              </div>

              {/* Feature rows */}
              {group.features.map((feat, fi) => (
                <div key={feat.cap} style={{
                  display: "grid", gridTemplateColumns: gridCols,
                  borderTop: "1px solid var(--ifm-color-emphasis-200)",
                  background: fi % 2 === 1 ? "var(--ifm-card-background-color)" : "transparent",
                }}>
                  <div style={{ padding: "12px 28px", fontSize: "0.875rem", color: "var(--ifm-color-emphasis-700)", display: "flex", alignItems: "center" }}>
                    {feat.cap}
                  </div>
                  {feat.values.map((v, ci) => (
                    <div key={ci} style={{
                      padding: "12px 8px",
                      borderLeft: `1px solid ${ci === 0 ? group.color + "30" : COMPETITORS[ci].dna ? "#f59e0b20" : "var(--ifm-color-emphasis-200)"}`,
                      background: ci === 0 ? `${group.color}06` : COMPETITORS[ci].dna ? "rgba(245,158,11,0.03)" : undefined,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <SupportCell v={v} highlight={ci === 0} />
                    </div>
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))}

          {/* ── Score footer ── */}
          <div style={{
            display: "grid", gridTemplateColumns: gridCols,
            borderTop: "2px solid var(--ifm-color-emphasis-300)",
            background: "var(--ifm-card-background-color)",
          }}>
            <div style={{ padding: "16px 28px", fontSize: "0.85rem", fontWeight: 700, color: "var(--ifm-color-emphasis-600)", display: "flex", alignItems: "center" }}>
              Total score
            </div>
            {COMPETITORS.map((c, ci) => (
              <div key={c.name} style={{
                padding: "16px 8px",
                borderLeft: `1px solid ${ci === 0 ? "#7c3aed40" : c.dna ? "#f59e0b20" : "var(--ifm-color-emphasis-200)"}`,
                background: ci === 0 ? "rgba(16,185,129,0.06)" : c.dna ? "rgba(245,158,11,0.03)" : undefined,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  fontSize: "1.05rem", fontWeight: 800,
                  color: ci === 0 ? "#10b981" : c.dna ? "#f59e0b" : scores[ci] >= 8 ? "#f59e0b" : "#64748b",
                }}>
                  {scores[ci]} / {total}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Note about excluded tools */}
        <p style={{ marginTop: "20px", fontSize: "0.8rem", color: "var(--ifm-color-emphasis-500)", textAlign: "center" }}>
          Moltis is a single-binary personal tool — outside the scope of this enterprise comparison. OpenClaw is included above as the direct ancestor of Vaultys Claw.
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   CTA
   ──────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section style={{ padding: "80px 0" }}>
      <div className="container">
        <div style={{ background: "linear-gradient(135deg, #7c3aed, #1d4ed8)", borderRadius: "16px", padding: "60px 40px", textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "white", marginBottom: "16px" }}>
            Ready to build AI differently?
          </h2>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.88)", marginBottom: "32px", maxWidth: "560px", margin: "0 auto 32px" }}>
            Deploy AI agents that are accountable, secure, and truly yours — not rented from a cloud provider.
          </p>
          <div className="hero-cta-group" style={{ justifyContent: "center" }}>
            <Link className="btn-primary" to="/docs/guides/quickstart" style={{ background: "white", color: "#1d4ed8" }}>
              Deploy your first agent <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <Link className="btn-secondary" to="/docs/intro" style={{ borderColor: "rgba(255,255,255,0.35)", color: "white" }}>
              Read the documentation
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────── */
export default function ComparisonPage() {
  return (
    <Layout
      title="Comparison | Vaultys Claw"
      description="How Vaultys Claw compares to traditional AI agent orchestration platforms."
    >
      <ComparisonHero />

      <section style={{ padding: "80px 0" }}>
        <div className="container">

          <ComparisonBlock
            icon={<Fingerprint size={18} strokeWidth={1.8} style={{ color: "#a78bfa" }} />}
            accentColor="#a78bfa"
            title="Decentralised Identity"
            vcDesc="Every agent holds a W3C Decentralized Identifier (DID) — a permanent, cryptographic identity that is uniquely theirs. No platform can revoke it, no impersonation is possible."
            tradDesc="Agents are stateless endpoints authenticated by bearer tokens managed on the provider's side. Indistinguishable from each other, ephemeral by design."
            vcDiagram={<IdentityVC />}
            tradDiagram={<IdentityTraditional />}
          />

          <ComparisonBlock
            icon={<ShieldCheck size={18} strokeWidth={1.8} style={{ color: "#10b981" }} />}
            accentColor="#10b981"
            title="Decentralised Security — PQC Ready"
            vcDesc="All intents and results are cryptographically signed end-to-end. Any recipient can verify independently. The architecture is designed to swap in post-quantum algorithms without a full rewrite."
            tradDesc="Security is delegated to the cloud provider. TLS in transit, tokens at rest, no independent verification. A compromised provider or insider breaks the entire chain."
            vcDiagram={<SecurityVC />}
            tradDiagram={<SecurityTraditional />}
          />

          <ComparisonBlock
            icon={<Brain size={18} strokeWidth={1.8} style={{ color: "#ec4899" }} />}
            accentColor="#ec4899"
            title="Truly Autonomous Agents"
            vcDesc="Agents verify policies locally and coordinate directly with each other. The control plane is configuration, not an executor — it never becomes the hot path."
            tradDesc="Every decision is routed through a central orchestrator. Agents are puppets — they cannot act or collaborate without a round-trip to the control plane."
            vcDiagram={<AutonomyVC />}
            tradDiagram={<AutonomyTraditional />}
          />

          <ComparisonBlock
            icon={<Zap size={18} strokeWidth={1.8} style={{ color: "#f59e0b" }} />}
            accentColor="#f59e0b"
            title="Less Resource Consumption"
            vcDesc="Policy validation happens locally on each agent controller. The control plane only carries configuration traffic, keeping its CPU load flat regardless of how many agents are running."
            tradDesc="The control plane touches every single decision. At scale, CPU and latency spike together. You pay more infrastructure cost just to keep agents alive."
            vcDiagram={<ResourceVC />}
            tradDiagram={<ResourceTraditional />}
          />

          <ComparisonBlock
            icon={<MapPin size={18} strokeWidth={1.8} style={{ color: "#3b82f6" }} />}
            accentColor="#3b82f6"
            title="Agents Next to Your Data"
            vcDesc="Agent controllers are deployed inside your infrastructure — on-prem, in your VPC, or at the edge. They connect outbound only. Your data never leaves your perimeter."
            tradDesc="Cloud-first architecture means data must travel to the provider or APIs must leave your network. Compliance teams hate it; finance teams pay for the egress."
            vcDiagram={<DataLocationVC />}
            tradDiagram={<DataLocationTraditional />}
          />

        </div>
      </section>

      <OpenClawBridge />
      <FeatureMatrix />
      <FinalCTA />
    </Layout>
  );
}
