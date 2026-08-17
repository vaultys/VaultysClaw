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
type Status = "active" | "partial" | "absent";

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
    summary: "Every party holds a VaultysId DID and proves possession of the key.",
    detail:
      "Identity is proven per connection by an SRP-style Challenger handshake — no bearer tokens, no shared secrets, nothing that works for whoever holds it. The public key observed during the handshake is persisted, so anything that Actor later signs can be re-verified offline with no live connection. Post-quantum identities (dilithium_ed25519) are a real, selectable type. Not present: mutual TLS with certificate pinning, and hardware-backed credentials for agents (humans can use real WebAuthn/FIDO2).",
  },
  {
    id: "02",
    name: "Access Control & Privilege",
    status: "active",
    summary: "Attribute-scoped certificates resolved as a set — the strongest domain.",
    detail:
      "There is no role table. An Actor's permissions are the union of the signed CapabilityCertificate rows naming it as subject, resolved per action over the whole set by resolvePermission — which returns which specific certificate granted the action. CertScope narrows a grant to a resource, pattern, use count, or purpose, so a ten-second single-file grant is an ordinary auditable ledger row. Whether a human may open the admin console is decided by the same code path as whether an agent may read a file.",
  },
  {
    id: "03",
    name: "Resource Perimeter & Blast Radius",
    status: "active",
    summary: "Workspace tenancy, per-kind capability allow-lists, and enforcing network interception.",
    detail:
      "Workspaces bound tenancy. Per-kind allow-lists are applied server-side at approval time, so a sensor cannot be granted system_command by any route — including a crafted form post. For the network dimension, the proxy Actor kind is an interception point that refuses agent traffic its signed rule set and certificate do not authorise. Not present: container or hypervisor isolation per agent, and per-workspace trust policy overrides.",
  },
  {
    id: "04",
    name: "Observability & Audit",
    status: "active",
    summary: "One append-only trail that also drives every alert, so the two cannot disagree.",
    detail:
      "One recordEvent() call writes the audit row and drives the webhook and notification pipeline from the same sanitised payload — an alert cannot exist without a matching audit row. Entries carry DID attribution, field-level diffs, and a live-recomputed signature badge on certificate events, re-derived from the stored bytes rather than a stored flag. Honest limitation: the log is append-only by discipline, not by storage — rows are not signed or hash-chained.",
  },
  {
    id: "05",
    name: "Behavioural Monitoring",
    status: "partial",
    summary: "Shadow-AI discovery is real; anomaly detection is not.",
    detail:
      "Endpoint sensors classify AI and agent workloads on real hosts and correlate them against the ledger — a workload whose identity evidence resolves to a known Actor is managed, one that does not is shadow. That is a genuine governance capability. But nothing establishes a behavioural baseline, nothing alerts on a threshold, and nothing contains an Actor automatically. Response is entirely manual revocation.",
  },
  {
    id: "06",
    name: "Input Validation",
    status: "partial",
    summary: "Closed protocol union and strict config parsing; the admin surface is uneven.",
    detail:
      "The WebSocket protocol is a small closed message union — unknown types are rejected, not routed — and configuration blobs are parsed by validators that reject malformed input rather than dropping it silently. The gap is the admin surface: it is Server Actions over DAOs with hand-written, non-uniform validation, and a known authorisation retrofit is still in progress because Next.js dispatches an action without re-running its route's layout gate.",
  },
  {
    id: "07",
    name: "Output Filtering & Leak Prevention",
    status: "absent",
    summary: "Not built. Nothing inspects what an agent returns.",
    detail:
      "No partial credit here. Secret handling on the platform's own outputs is careful — encrypted keys are omitted at the query level, webhook payloads pass explicit allow-lists plus a recursive secret strip, generated secrets are revealed once — and capability gating limits what an agent can reach in the first place. None of that inspects agent output. Nothing scans a result for PII, credentials, or exfiltration patterns. This is the largest single gap in the assessment.",
  },
  {
    id: "08",
    name: "Tool Access & Security",
    status: "active",
    summary: "Deny by default, allow-listed per kind, and proven to gate on a real binary.",
    detail:
      "A capability an Actor does not hold authorises nothing, and every capability it does hold passed an explicit admin approval. The gate is demonstrably real, not asserted: the Go sensor logs that it is skipping its poll cycle until process_read is granted, reads no process information at all in that window, and begins polling in the same second the certificate exchange completes. Not present: rate limiting on tool calls, and per-tool sandboxing.",
  },
  {
    id: "09",
    name: "Credential Protection",
    status: "active",
    summary: "One vault primitive, write-only fields, and a confined decrypt capability.",
    detail:
      "Agents hold a private key, not a platform secret — there is nothing to leak in the agent path. Stored secrets (LLM provider keys, SSO client secrets, Apprise service URLs) all use one signcrypt-to-self primitive rather than several code paths, and the decrypt capability never leaves the control-plane process. Encrypted columns are omitted at the query level, not deleted after the fact. Not present: automatic rotation, external secrets managers, per-agent credential isolation.",
  },
  {
    id: "10",
    name: "Integrity & Recovery",
    status: "active",
    summary: "Signed, offline-verifiable artefacts, and a decision function verified across two languages.",
    detail:
      "Both certificate formats are independently verifiable offline with no control-plane call. A proxy's rule set is signed at push time, deliberately leaving the stored copy unsigned since a stale signature is indistinguishable from a tampered one. The permission-resolution function exists in TypeScript and Go and both run the same committed conformance vectors — a divergence is a release blocker. Not present: automated rollback, configuration history for settings rows.",
  },
  {
    id: "11",
    name: "Agent Memory Protection",
    status: "absent",
    summary: "Out of scope for the control plane — and no credit claimed for it.",
    detail:
      "Agent memory is a property of the agent runtime, not the control plane, and this assessment does not claim credit for something a different process owns. What the control plane contributes: memory contents never transit it, because the chat and channel surface that would have carried them was removed, and there is no cross-Actor read path in the platform at all. Integrity verification, encryption at rest, and poisoning detection for stored memory are absent at every tier.",
  },
  {
    id: "12",
    name: "AI Governance",
    status: "active",
    summary: "Shadow-AI visibility, a model inventory, and federation that binds to the trust model.",
    detail:
      "Governance uses the same mechanism as identity, so there is no separate engine to drift from the access model. Sensors surface unmanaged AI on real hosts; the Model Registry catalogues every sanctioned LLM endpoint; every change is audited and exportable. An SSO login that cannot be bound to a DID never produces a session — there is deliberately no 'signed in but not yet anybody' state. Stated plainly: model-workspace access is recorded and audited, but not enforced at inference time.",
  },
];

const STATUS_CONFIG: Record<
  Status,
  { label: string; color: string; bg: string; border: string; Icon: React.ComponentType<{ size: number; strokeWidth: number; style?: React.CSSProperties }> }
> = {
  active: {
    label: "Built",
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
  absent: {
    label: "Not built",
    color: "#f85149",
    bg: "rgba(248,81,73,0.1)",
    border: "rgba(248,81,73,0.25)",
    Icon: XCircle,
  },
};

const ACTIVE_COUNT  = DOMAINS.filter((d) => d.status === "active").length;
const PARTIAL_COUNT = DOMAINS.filter((d) => d.status === "partial").length;
const ABSENT_COUNT  = DOMAINS.filter((d) => d.status === "absent").length;

const ANTHROPIC_DOC_URL = "https://claude.com/blog/zero-trust-for-ai-agents";

/* ────────────────────────────────────────────────────────────
   Score bar
   ──────────────────────────────────────────────────────────── */
function ScoreBar() {
  const total = DOMAINS.length;
  const activePct  = (ACTIVE_COUNT  / total) * 100;
  const partialPct = (PARTIAL_COUNT / total) * 100;
  const absentPct  = (ABSENT_COUNT  / total) * 100;

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
      <div style={{ width: `${absentPct}%`,  background: "#f85149", borderRadius: "0 100px 100px 0" }} />
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
            Anthropic Zero Trust for AI Agents · self-assessment
          </div>

          <h1 className="hero-title">
            12 domains.
            <br />
            <span className="gradient-text">Including the ones we fail.</span>
          </h1>

          <p className="hero-subtitle" style={{ maxWidth: 660, margin: "0 auto 32px" }}>
            Anthropic's Zero Trust framework for AI agents defines 12 control
            domains. This is our self-assessment against it — built where it is
            built, and empty where it is empty. Two domains score zero, and
            saying so is the point: a Zero Trust claim without the failures is
            not an assessment.
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
              { count: ABSENT_COUNT,  label: "Not built", color: "#f85149" },
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
            <Link className="btn-secondary" to="/docs/zero-trust/matrix">
              Read the full matrix
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
              The framework adapts Zero Trust — never trust, always verify — to
              a setting where the thing being verified is a non-deterministic,
              tool-using, network-connected process acting on a human's behalf.
              It defines twelve control domains across three maturity tiers,
              covering the specific threat model of autonomous agents: prompt
              injection, capability abuse, lateral movement, identity spoofing,
              and data exfiltration.
            </p>
            <p className="section-subtitle" style={{ marginBottom: 24 }}>
              VaultysClaw is built against it, and publishes the assessment
              rather than claiming compliance in the abstract. Three rules keep
              it honest: a control counts only if it is enforced rather than
              merely recorded; only if it has been exercised end to end against
              real infrastructure; and scope is stated, so a property owned by
              the agent runtime is marked as such instead of quietly claimed.
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
              Read the Anthropic framework{" "}
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
                {(["active", "partial", "absent"] as Status[]).map((s) => {
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
                Evaluated against Anthropic's Zero Trust for AI Agents
                framework. A control counts only if it is enforced rather than
                recorded, and only if it has been exercised end to end.
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
          Zero Trust for agents,
          <br />
          assessed in the open.
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
          Self-hosted, no agent traffic through anyone else's servers, and an
          assessment you can check against the code. Run it locally in about ten
          minutes.
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
      title="Zero Trust assessment — VaultysClaw vs. Anthropic's framework"
      description="VaultysClaw's per-domain self-assessment against Anthropic's Zero Trust for AI Agents framework — including the two domains that score zero."
    >
      <Hero />
      <FrameworkSummary />
      <DomainGrid />
      <CTA />
    </Layout>
  );
}
