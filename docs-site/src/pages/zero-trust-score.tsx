import React from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Data
   ──────────────────────────────────────────────────────────── */
type Status = "active" | "partial" | "roadmap";

const DOMAINS: {
  id: string;
  name: string;
  status: Status;
  summary: string;
  detail: string;
}[] = [
  {
    id: "01",
    name: "Agent Identity & Authentication",
    status: "active",
    summary: "Every agent has a non-transferable cryptographic DID.",
    detail:
      "VaultysId assigns each agent a self-sovereign DID backed by an ECDSA key pair that never leaves the agent. Authentication is mutual challenge-response — no shared secrets, no API keys, no session tokens that can be stolen or replayed.",
  },
  {
    id: "02",
    name: "Access Control & Privileges",
    status: "active",
    summary: "Capability-based least-privilege, revocable in real time.",
    detail:
      "Each agent holds an explicit signed capability grant: internet_access, file_access, api_call, code_execution, mail_send, and more. Capabilities are enforced server-side before any intent is dispatched. Revocation takes effect immediately — no restart required.",
  },
  {
    id: "03",
    name: "Resource Perimeter & Blast Radius",
    status: "active",
    summary: "Realm isolation contains lateral movement by design.",
    detail:
      "Agents are scoped to realms. A compromised agent cannot reach agents, data, or workflows in other realms. Policy signatures prevent trust escalation across boundaries, and per-agent budget caps limit resource consumption.",
  },
  {
    id: "04",
    name: "Observability & Audit",
    status: "active",
    summary: "Immutable, cryptographically attributed audit trail on every action.",
    detail:
      "All intents, results, policy changes, and delegation events are signed by their emitter and appended to an append-only log. Every entry is attributable to a specific DID — no ambiguity about who did what, even under delegation chains.",
  },
  {
    id: "05",
    name: "Tool Access & Security",
    status: "active",
    summary: "Tools are declared, schema-validated, and policy-gated per agent.",
    detail:
      "Built-in tools (file ops, shell, HTTP, code runner, remote-agent calls) are registered with Zod schemas. No implicit tool access — each tool requires an explicit capability grant. Execution is logged and bounded by the agent's policy.",
  },
  {
    id: "06",
    name: "Input Validation",
    status: "active",
    summary: "Zod-enforced type-safe contracts at every system boundary.",
    detail:
      "Intent payloads are validated against strict Zod schemas at the control-plane boundary before dispatch. Type-safe ts-rest contracts on all API routes prevent malformed or injected inputs from reaching agent logic.",
  },
  {
    id: "07",
    name: "Agent Memory Protection",
    status: "active",
    summary: "Per-agent isolated memory store — no cross-agent access.",
    detail:
      "Each agent's semantic memory (SQLite + vector index) is fully isolated. Retrieval is scoped to the agent's own store; no agent can query another's memory. Memory summarisation runs inside the agent boundary.",
  },
  {
    id: "08",
    name: "AI Governance Policies",
    status: "partial",
    summary: "Signed policy distribution and budget enforcement implemented; LLM output governance in progress.",
    detail:
      "Policy documents are cryptographically signed and distributed to agents, which verify signatures before storing. Budget caps, capability grants, and workflow-level human approval gates are enforced. Full prompt-injection detection and LLM output content governance are in active development.",
  },
  {
    id: "09",
    name: "Credential Protection",
    status: "partial",
    summary: "Private keys never leave the agent; LLM key injection via env — vault integration planned.",
    detail:
      "VaultysId private keys are generated and stored locally on each agent — they are never transmitted. LLM API keys are currently injected via environment variables at startup. Secrets vault integration (e.g. HashiCorp Vault, AWS Secrets Manager) and automated key rotation are on the near-term roadmap.",
  },
  {
    id: "10",
    name: "Integrity & Recovery",
    status: "partial",
    summary: "Signed state and WAL recovery in place; distributed consistency is partial.",
    detail:
      "Agent certificates, policies, and delegation chains are signed and independently verifiable offline. Control-plane state is backed by SQLite WAL mode with crash recovery. Full distributed state consistency, multi-node failover, and automated recovery orchestration are partially implemented.",
  },
  {
    id: "11",
    name: "Behavioural Monitoring",
    status: "partial",
    summary: "Token usage and intent logging implemented; anomaly detection in development.",
    detail:
      "Per-agent token consumption, task history, and intent logs are tracked and surfaced in the control-plane dashboard. Statistical anomaly detection and behavioural baseline alerting are in active development and will ship as part of the observability roadmap.",
  },
  {
    id: "12",
    name: "Output Filtering & Data Leak Prevention",
    status: "roadmap",
    summary: "Planned: LLM output scanning, PII detection, exfiltration prevention.",
    detail:
      "Currently, data exposure is limited through capability-gating (agents only access data they have explicit grants for). Dedicated output filtering — automated PII detection, sensitive data redaction, and prompt-injection response scanning — is on the public roadmap.",
  },
];

const STATUS_CONFIG: Record<
  Status,
  { label: string; color: string; bg: string; border: string; Icon: React.ComponentType<{ size: number; strokeWidth: number; style?: React.CSSProperties }> }
> = {
  active: {
    label: "Active",
    color: "#3fb950",
    bg: "rgba(63,185,80,0.1)",
    border: "rgba(63,185,80,0.25)",
    Icon: CheckCircle2,
  },
  partial: {
    label: "Partial",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.25)",
    Icon: Clock,
  },
  roadmap: {
    label: "Roadmap",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.25)",
    Icon: Sparkles,
  },
};

const ACTIVE_COUNT  = DOMAINS.filter((d) => d.status === "active").length;
const PARTIAL_COUNT = DOMAINS.filter((d) => d.status === "partial").length;
const ROADMAP_COUNT = DOMAINS.filter((d) => d.status === "roadmap").length;

const ANTHROPIC_DOC_URL = "https://claude.com/blog/zero-trust-for-ai-agents";

/* ────────────────────────────────────────────────────────────
   Score bar
   ──────────────────────────────────────────────────────────── */
function ScoreBar() {
  const total = DOMAINS.length;
  const activePct  = (ACTIVE_COUNT  / total) * 100;
  const partialPct = (PARTIAL_COUNT / total) * 100;
  const roadmapPct = (ROADMAP_COUNT / total) * 100;

  return (
    <div
      style={{
        display: "flex",
        height: 10,
        borderRadius: 100,
        overflow: "hidden",
        gap: 2,
        marginBottom: 20,
      }}
    >
      <div style={{ width: `${activePct}%`,  background: "#3fb950", borderRadius: "100px 0 0 100px" }} />
      <div style={{ width: `${partialPct}%`, background: "#f59e0b" }} />
      <div style={{ width: `${roadmapPct}%`, background: "#3b82f6", borderRadius: "0 100px 100px 0" }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="hero-section">
      <div className="hero-grid" />
      <div className="container">
        <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
          <div className="hero-badge">
            <ShieldCheck size={12} strokeWidth={2.5} />
            Anthropic Zero Trust AI Agents Framework · May 2026
          </div>

          <h1 className="hero-title">
            12 domains.
            <br />
            <span className="gradient-text">11 covered today.</span>
          </h1>

          <p className="hero-subtitle" style={{ maxWidth: 640, margin: "0 auto 32px" }}>
            Anthropic published a Zero Trust security framework for AI agents
            covering 12 critical domains. VaultysClaw fully covers 7, partially
            covers 4, and has the remaining 1 on the public roadmap.
          </p>

          {/* Score stats */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 32,
              marginBottom: 32,
              flexWrap: "wrap",
            }}
          >
            {[
              { count: ACTIVE_COUNT,  label: "Active",   color: "#3fb950" },
              { count: PARTIAL_COUNT, label: "Partial",  color: "#f59e0b" },
              { count: ROADMAP_COUNT, label: "Roadmap",  color: "#3b82f6" },
            ].map(({ count, label, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.4rem", fontWeight: 900, color, lineHeight: 1 }}>
                  {count}
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--ifm-color-emphasis-500)",
                    marginTop: 4,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="hero-cta-group" style={{ justifyContent: "center" }}>
            <a
              className="btn-primary"
              href={ANTHROPIC_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the Anthropic framework{" "}
              <ExternalLink size={15} strokeWidth={2.5} />
            </a>
            <Link className="btn-secondary" to="/docs/security/security-model">
              Our security model
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Framework summary
   ──────────────────────────────────────────────────────────── */
function FrameworkSummary() {
  return (
    <section
      style={{ padding: "64px 0", background: "var(--ifm-background-surface-color)" }}
    >
      <div className="container">
        <div className="row" style={{ alignItems: "flex-start", gap: 0 }}>
          <div className="col col--7">
            <p className="section-label">About the framework</p>
            <h2 className="section-title" style={{ marginBottom: 16 }}>
              Anthropic's Zero Trust AI Agents Framework
            </h2>
            <p className="section-subtitle" style={{ marginBottom: 16 }}>
              Published in May 2026, this framework defines the security
              requirements organisations should demand of any AI agent platform.
              It draws directly from Zero Trust principles established by NIST
              and extends them to the specific threat model of autonomous AI
              agents: prompt injection, capability abuse, lateral movement,
              identity spoofing, and data exfiltration.
            </p>
            <p className="section-subtitle" style={{ marginBottom: 24 }}>
              The 12 domains range from foundational identity controls (DIDs,
              mutual authentication) through runtime protections (tool gating,
              input validation, memory isolation) to governance and recovery
              capabilities. No other open-source agent platform covers this
              surface area today.
            </p>
            <a
              href={ANTHROPIC_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.88rem",
                fontWeight: 700,
                color: "#3b82f6",
                textDecoration: "none",
              }}
            >
              Download the full PDF{" "}
              <ExternalLink size={14} strokeWidth={2.5} />
            </a>
          </div>

          <div className="col col--5" style={{ paddingLeft: 40 }}>
            <div
              style={{
                background: "var(--ifm-card-background-color)",
                border: "1px solid var(--ifm-color-emphasis-200)",
                borderRadius: 16,
                padding: "28px 28px 20px",
              }}
            >
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--ifm-color-emphasis-500)",
                }}
              >
                Overall coverage
              </p>
              <ScoreBar />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                {(["active", "partial", "roadmap"] as Status[]).map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const count = DOMAINS.filter((d) => d.status === s).length;
                  return (
                    <div
                      key={s}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <cfg.Icon
                        size={15}
                        strokeWidth={2}
                        style={{ color: cfg.color, flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--ifm-color-emphasis-700)",
                          flex: 1,
                        }}
                      >
                        {cfg.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          color: cfg.color,
                        }}
                      >
                        {count} / {DOMAINS.length}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid var(--ifm-color-emphasis-200)",
                  fontSize: "0.75rem",
                  color: "var(--ifm-color-emphasis-500)",
                  lineHeight: 1.55,
                }}
              >
                Evaluated against Anthropic's Zero Trust AI Agents Framework,
                May 2026.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Domain grid
   ──────────────────────────────────────────────────────────── */
function DomainGrid() {
  return (
    <section style={{ padding: "64px 0", background: "var(--ifm-background-color)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="section-label">Domain-by-domain</p>
          <h2 className="section-title">How VaultysClaw maps to each domain</h2>
        </div>

        <div className="row">
          {DOMAINS.map(({ id, name, status, summary, detail }) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <div
                key={id}
                className="col col--6"
                style={{ marginBottom: 20 }}
              >
                <div
                  style={{
                    background: "var(--ifm-card-background-color)",
                    border: `1px solid ${cfg.border}`,
                    borderRadius: 14,
                    padding: "22px 24px",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          color: "var(--ifm-color-emphasis-400)",
                          flexShrink: 0,
                        }}
                      >
                        {id}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "0.92rem",
                          color: "var(--ifm-color-emphasis-900)",
                          lineHeight: 1.3,
                        }}
                      >
                        {name}
                      </span>
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        background: cfg.bg,
                        border: `1px solid ${cfg.border}`,
                        color: cfg.color,
                        padding: "3px 10px",
                        borderRadius: 100,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <cfg.Icon size={11} strokeWidth={2.5} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Summary */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--ifm-color-emphasis-800)",
                      lineHeight: 1.5,
                    }}
                  >
                    {summary}
                  </p>

                  {/* Detail */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.82rem",
                      color: "var(--ifm-color-emphasis-600)",
                      lineHeight: 1.65,
                    }}
                  >
                    {detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   CTA
   ──────────────────────────────────────────────────────────── */
function CTA() {
  return (
    <section className="cta-section">
      <div className="container">
        <p
          style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#60a5fa",
            marginBottom: 16,
          }}
        >
          Open Source · MIT License · Self-hosted
        </p>
        <h2
          style={{
            fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
            fontWeight: 900,
            color: "#f8fafc",
            marginBottom: 16,
          }}
        >
          The most complete Zero Trust coverage
          <br />
          for AI agents — out of the box.
        </h2>
        <p
          style={{
            fontSize: "1rem",
            color: "#94a3b8",
            maxWidth: 520,
            margin: "0 auto 32px",
            lineHeight: 1.7,
          }}
        >
          No security team to hire. No SPIRE cluster to maintain. Deploy in
          five minutes and tick 11 of 12 Anthropic framework domains on day one.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link className="btn-primary" to="/docs/guides/quickstart">
            Get started <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
          <a
            className="btn-secondary"
            href="https://github.com/vaultys/vaultysclaw"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitBranch size={15} /> View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Page assembly
   ──────────────────────────────────────────────────────────── */
export default function ZeroTrustScore(): React.ReactElement {
  return (
    <Layout
      title="Zero Trust Score — VaultysClaw vs. Anthropic Framework"
      description="VaultysClaw covers 11 of 12 domains from Anthropic's Zero Trust AI Agents Framework (May 2026). See how each domain is addressed."
    >
      <Hero />
      <FrameworkSummary />
      <DomainGrid />
      <CTA />
    </Layout>
  );
}
