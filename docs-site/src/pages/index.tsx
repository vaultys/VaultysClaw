import React from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import clsx from "clsx";
import ArchitectureDiagram from "../components/ArchitectureDiagram";
import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  Fingerprint,
  GitBranch,
  Globe,
  Heart,
  Key,
  Lock,
  MessageSquare,
  Network,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="hero-section">
      <div className="hero-grid" />
      <div className="container">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--7">
            <div className="hero-badge">
              <Sparkles size={12} strokeWidth={2.5} />
              Enterprise AI Orchestration
            </div>

            <h1 className="hero-title">
              Give your company
              <br />
              <span className="gradient-text">a soul.</span>
            </h1>

            <p className="hero-subtitle">
              Your culture, your processes, your values — deployed as
              professional AI agents that work the way <em>you</em> do.
              Vaultys Claw gives every agent a unique, non-transferable
              identity so they're truly yours: accountable, trustworthy,
              and deeply embedded in how your organisation thinks.
            </p>

            <div className="hero-cta-group">
              <Link className="btn-primary" to="/docs/guides/quickstart">
                Deploy your first agent <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <Link className="btn-secondary" to="/docs/intro">
                Read the docs
              </Link>
              <a
                className="btn-secondary"
                href="https://github.com/vaultys/vaultysclaw"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitBranch size={15} /> GitHub
              </a>
            </div>
          </div>

          <div className="col col--5" style={{ paddingTop: "12px" }}>
            <TerminalPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function TerminalPreview() {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "12px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", background: "#161b22", borderBottom: "1px solid #21262d" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
        <span style={{ marginLeft: "8px", fontSize: "0.78rem", color: "#8b949e", fontFamily: "JetBrains Mono, monospace" }}>
          vaultys-claw — terminal
        </span>
      </div>
      <pre style={{ margin: 0, padding: "20px", fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", lineHeight: "1.7", color: "#c9d1d9", background: "transparent", overflowX: "auto" }}>
        <span style={{ color: "#8b949e" }}>$ </span>
        <span style={{ color: "#79c0ff" }}>git clone</span>
        <span> github.com/vaultys/vaultysclaw{"\n"}</span>
        <span style={{ color: "#8b949e" }}>$ </span>
        <span style={{ color: "#79c0ff" }}>cd</span>
        <span> vaultysclaw && </span>
        <span style={{ color: "#79c0ff" }}>pnpm install{"\n"}</span>
        <span style={{ color: "#8b949e" }}>$ </span>
        <span style={{ color: "#79c0ff" }}>pnpm dev{"\n\n"}</span>
        <span style={{ color: "#3fb950" }}>✓</span>
        <span> Control plane ready on </span>
        <span style={{ color: "#a5d6ff" }}>:3000{"\n"}</span>
        <span style={{ color: "#3fb950" }}>✓</span>
        <span> WebSocket hub ready on </span>
        <span style={{ color: "#a5d6ff" }}>:8080{"\n"}</span>
        <span style={{ color: "#3fb950" }}>✓</span>
        <span> Agent "alice-research" connected{"\n"}</span>
        <span style={{ color: "#3fb950" }}>✓</span>
        <span> VaultysId identity loaded{"\n\n"}</span>
      </pre>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Social proof
   ──────────────────────────────────────────────────────────── */
const LOGOS = ["ACME Corp", "Nexus AI", "Vertex Labs", "Meridian", "Crestline", "Orbis Tech"];

function EnterpriseSection() {
  return (
    <section className="enterprise-section">
      <div className="container">
        <p style={{ textAlign: "center", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ifm-color-emphasis-500)", fontWeight: 600, marginBottom: "28px" }}>
          Trusted by teams that take their culture seriously
        </p>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "40px" }}>
          {LOGOS.map((name) => (
            <div key={name} className="logo-placeholder">{name}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   "Not a generic assistant" manifesto
   ──────────────────────────────────────────────────────────── */
function ManifestoSection() {
  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-surface-color)" }}>
      <div className="container">
        <div className="row" style={{ alignItems: "center", gap: 0 }}>
          <div className="col col--6">
            <p className="section-label">Why Vaultys Claw</p>
            <h2 className="section-title">
              Not a generic assistant.<br />
              <em>Your</em> agent.
            </h2>
            <p className="section-subtitle" style={{ marginBottom: "28px" }}>
              Most AI tools are blank slates you rent from a cloud provider.
              They have no memory of who you are, no stake in your outcomes,
              and no accountability when things go wrong.
            </p>
            <p className="section-subtitle" style={{ marginBottom: "36px" }}>
              Vaultys Claw is different. Every agent carries a{" "}
              <strong>unique, non-transferable identity</strong> — a cryptographic
              fingerprint that is yours, governed by your policies, and
              auditable to any action it ever took. You're not deploying a tool.
              You're extending your team.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                { Icon: Heart, color: "#f472b6", text: "Agents that reflect your values and communication style" },
                { Icon: Users, color: "#60a5fa", text: "Governed by your org chart — realms, roles, and accountability chains" },
                { Icon: Fingerprint, color: "#a78bfa", text: "Each agent has a soul: a cryptographic identity that is uniquely, irrevocably theirs" },
              ].map(({ Icon, color, text }) => (
                <div key={text} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div className="manifesto-icon-box">
                    <Icon size={17} strokeWidth={1.8} style={{ color }} />
                  </div>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ifm-color-emphasis-700)", lineHeight: 1.65 }}>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="col col--6" style={{ paddingLeft: "48px" }}>
            <AgentProfileCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentProfileCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Agent identity card */}
      <div style={{ background: "var(--ifm-card-background-color)", border: "1px solid var(--ifm-color-emphasis-200)", borderRadius: "12px", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: 42, height: 42, borderRadius: "10px", background: "linear-gradient(135deg, #1d4ed8, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={22} strokeWidth={1.6} style={{ color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--ifm-color-emphasis-900)" }}>alice-research</div>
              <div style={{ fontSize: "0.72rem", color: "var(--ifm-color-emphasis-600)", fontFamily: "JetBrains Mono, monospace" }}>did:vaultys:z6Mkf9x3TQ…</div>
            </div>
          </div>
          <span style={{ background: "rgba(16,185,129,0.12)", color: "#3fb950", padding: "3px 10px", borderRadius: "100px", fontSize: "0.72rem", fontWeight: 700, border: "1px solid rgba(16,185,129,0.2)" }}>
            ● online
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          {[
            { label: "Realm", value: "Research" },
            { label: "Model", value: "claude-sonnet" },
            { label: "Role", value: "Analyst" },
            { label: "Intents", value: "2,841 today" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--ifm-background-surface-color)", border: "1px solid var(--ifm-color-emphasis-200)", borderRadius: "8px", padding: "10px 12px" }}>
              <div style={{ fontSize: "0.68rem", color: "var(--ifm-color-emphasis-600)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "3px" }}>{label}</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ifm-color-emphasis-900)" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--ifm-color-emphasis-200)", paddingTop: "12px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--ifm-color-emphasis-600)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Culture profile</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {["direct comms", "data-driven", "cite sources", "concise", "EMEA-aware"].map((tag) => (
              <span key={tag} style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.22)", color: "#3b82f6", padding: "2px 8px", borderRadius: "5px", fontSize: "0.72rem", fontWeight: 600 }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Policy card */}
      <div style={{ background: "var(--ifm-card-background-color)", border: "1px solid var(--ifm-color-emphasis-200)", borderRadius: "12px", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <ShieldCheck size={15} style={{ color: "#a78bfa" }} strokeWidth={1.8} />
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.07em" }}>Signed Policy</span>
          <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--ifm-color-emphasis-600)", fontFamily: "JetBrains Mono, monospace" }}>v4 · signed 2m ago</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {["internet_access", "api_call", "file_access"].map((cap) => (
            <span key={cap} style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.22)", color: "#a78bfa", padding: "3px 8px", borderRadius: "5px", fontSize: "0.72rem", fontWeight: 600 }}>{cap}</span>
          ))}
        </div>
        <div style={{ marginTop: "10px", fontSize: "0.72rem", color: "var(--ifm-color-emphasis-600)", fontFamily: "JetBrains Mono, monospace" }}>
          sig: a3f9b2…d04c <CheckCircle2 size={11} style={{ color: "#3fb950", display: "inline", marginLeft: "4px" }} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Feature cards
   ──────────────────────────────────────────────────────────── */
const FEATURES: {
  Icon: React.ComponentType<{ size: number; strokeWidth: number }>;
  iconColor: string;
  title: string;
  desc: string;
}[] = [
    {
      Icon: Fingerprint,
      iconColor: "blue",
      title: "Every agent has an identity",
      desc: "A non-transferable VaultysId ties each agent to your organisation. No impersonation, no ambiguity — every action is cryptographically attributed.",
    },
    {
      Icon: Brain,
      iconColor: "purple",
      title: "Encode your culture as policy",
      desc: "Communication style, escalation rules, data access boundaries — formalise how your organisation works and deploy it as signed, tamper-proof policy.",
    },
    {
      Icon: Users,
      iconColor: "blue",
      title: "Your org chart, reflected in AI",
      desc: "Realms, roles, and capability grants mirror your real team structure. The right people govern the right agents — enforced server-side, always.",
    },
    {
      Icon: Zap,
      iconColor: "emerald",
      title: "Real-time coordination",
      desc: "A persistent WebSocket hub lets agents collaborate in real time — routing work across departments, escalating to humans, and returning results in milliseconds.",
    },
    {
      Icon: ShieldCheck,
      iconColor: "emerald",
      title: "Zero-trust security",
      desc: "All intents, policies, and results are cryptographically signed end-to-end. Tampering is detected instantly, even if an intermediate node is compromised.",
    },
    {
      Icon: Lock,
      iconColor: "purple",
      title: "Least-privilege by design",
      desc: "Grant exactly the permissions each agent needs — file access, internet, code execution — and revoke them in one click, no restart required.",
    },
    {
      Icon: Workflow,
      iconColor: "blue",
      title: "Automate your processes",
      desc: "Build multi-step workflows that mirror your real business processes. Agents hand off to each other exactly the way your best teams do.",
    },
    {
      Icon: CheckCircle2,
      iconColor: "emerald",
      title: "Human judgment, built in",
      desc: "Flag sensitive actions for mandatory human review. Every approval is logged — who decided what, when, and why. Compliance loves it.",
    },
  ];

function FeaturesSection() {
  return (
    <section className="features-section">
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "52px" }}>
          <p className="section-label">What you get</p>
          <h2 className="section-title">
            AI agents that work like your best employee
          </h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            The primitives your organisation needs to deploy AI with confidence —
            accountability, culture, and zero-trust security baked in from day one.
          </p>
        </div>

        <div className="row">
          {FEATURES.map((f) => (
            <div key={f.title} className="col col--3" style={{ marginBottom: "20px" }}>
              <div className="feature-card">
                <div className={clsx("feature-icon", f.iconColor)}>
                  <f.Icon size={20} strokeWidth={1.8} />
                </div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Architecture (kept for technical credibility)
   ──────────────────────────────────────────────────────────── */
function ArchitectureSection() {
  return (
    <section className="arch-section">
      <div className="container">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--5">
            <p className="section-label">Architecture</p>
            <h2 className="section-title">
              Built for where your data lives
            </h2>
            <p className="section-subtitle" style={{ marginBottom: "24px" }}>
              The control plane is your single pane of glass. Agent controllers
              run wherever your data is — on-premises, private cloud, or at the
              edge. They connect outbound, so no inbound firewall rules needed.
              Your IT team will thank you.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                "VaultysId ensures no agent can impersonate another",
                "Policies signed and distributed, never assumed",
                "Agents verify every intent before acting",
                "All results signed and returned for full auditability",
              ].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "0.9rem", color: "var(--ifm-color-emphasis-700)" }}>
                  <CheckCircle2 size={16} style={{ color: "#3fb950", flexShrink: 0, marginTop: "3px" }} />
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: "28px" }}>
              <Link className="btn-secondary" to="/docs/overview/architecture">
                Deep dive into the architecture <ChevronRight size={15} />
              </Link>
            </div>
          </div>

          <div className="col col--7">
            <ArchitectureDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Dashboard mockup
   ──────────────────────────────────────────────────────────── */
const MOCK_AGENTS = [
  { name: "alice-research", realm: "Research", caps: ["internet_access", "api_call"], status: "online", model: "claude-sonnet" },
  { name: "bob-analyst", realm: "Finance", caps: ["api_call", "file_access"], status: "online", model: "gpt-4o" },
  { name: "ops-dispatcher", realm: "Operations", caps: ["mail_send", "api_call"], status: "online", model: "gpt-4o-mini" },
  { name: "dev-coder", realm: "Engineering", caps: ["code_execution", "file_access"], status: "offline", model: "llama3.2" },
];

const NAV_ITEMS = [
  { Icon: Network, label: "Overview", active: false },
  { Icon: Bot, label: "Agents", active: true },
  { Icon: Send, label: "Intents", active: false },
  { Icon: ShieldCheck, label: "Policies", active: false },
  { Icon: Workflow, label: "Workflows", active: false },
  { Icon: MessageSquare, label: "Chat", active: false },
  { Icon: CheckCircle2, label: "Approvals", active: false },
  { Icon: Building2, label: "Realms", active: false },
  { Icon: Users, label: "Users", active: false },
];

function DashboardMockup() {
  return (
    <section className="mockup-section">
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p className="section-label">Control plane</p>
          <h2 className="section-title">Your whole team, in one place</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            See who's working, what they're doing, and whether they're acting
            within your organisation's policies — in real time.
          </p>
        </div>

        <div className="mockup-window">
          <div className="mockup-titlebar">
            <div className="mockup-dot red" />
            <div className="mockup-dot yellow" />
            <div className="mockup-dot green" />
            <div className="mockup-url-bar">
              https://vaultysclaw.acmecorp.internal
            </div>
          </div>

          <div className="mockup-body">
            <div className="mockup-sidebar">
              <div className="mockup-sidebar-logo">
                <div className="logo-dot" />
                Vaultys Claw
              </div>
              {NAV_ITEMS.map(({ Icon, label, active }) => (
                <div key={label} className={clsx("mockup-nav-item", active && "active")}>
                  <span className="nav-icon">
                    <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  {label}
                </div>
              ))}
            </div>

            <div className="mockup-content">
              <div className="mockup-page-title">Agents</div>

              <div className="mockup-stats-row">
                <div className="mockup-stat-card">
                  <div className="mockup-stat-label">Team Members</div>
                  <div className="mockup-stat-value">12</div>
                  <div className="mockup-stat-sub">+3 this week</div>
                </div>
                <div className="mockup-stat-card">
                  <div className="mockup-stat-label">Active Now</div>
                  <div className="mockup-stat-value" style={{ color: "#3fb950" }}>9</div>
                  <div className="mockup-stat-sub">75% uptime</div>
                </div>
                <div className="mockup-stat-card">
                  <div className="mockup-stat-label">Tasks Today</div>
                  <div className="mockup-stat-value">1,432</div>
                  <div className="mockup-stat-sub" style={{ color: "#79c0ff" }}>↑ 12%</div>
                </div>
              </div>

              <div className="mockup-agent-table">
                <div className="mockup-table-header">
                  <span>Agent</span>
                  <span>Capabilities</span>
                  <span>Model</span>
                  <span>Status</span>
                </div>
                {MOCK_AGENTS.map((agent) => (
                  <div className="mockup-table-row" key={agent.name}>
                    <div>
                      <div style={{ color: "#e6edf3", fontWeight: 600, fontSize: "0.83rem", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Bot size={13} style={{ color: "#60a5fa", flexShrink: 0 }} />
                        {agent.name}
                      </div>
                      <div style={{ color: "#8b949e", fontSize: "0.72rem", paddingLeft: "19px" }}>
                        {agent.realm}
                      </div>
                    </div>
                    <div>
                      {agent.caps.map((c) => (
                        <span key={c} className="mockup-cap-pill">{c}</span>
                      ))}
                    </div>
                    <div style={{ color: "#8b949e", fontSize: "0.78rem", fontFamily: "JetBrains Mono, monospace" }}>
                      {agent.model}
                    </div>
                    <div>
                      <span className={clsx("mockup-status-badge", agent.status === "online" ? "online" : "offline")}>
                        {agent.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   VaultysId — soul of the system
   ──────────────────────────────────────────────────────────── */
const SECURITY_PILLARS = [
  {
    Icon: Globe,
    title: "No central authority",
    desc: "Identity lives with the agent — no provider to call, no single point of failure.",
  },
  {
    Icon: Key,
    title: "Non-transferable by design",
    desc: "Private keys never leave the entity. Your agent's identity is exclusively its own.",
  },
  {
    Icon: FileCheck,
    title: "Offline-verifiable",
    desc: "Agents verify trust locally at execution time — fast, resilient, and auditable.",
  },
];

function SecuritySection() {
  return (
    <section className="security-section">
      <div className="container">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--5">
            <p className="section-label" style={{ color: "#a78bfa" }}>Powered by VaultysId</p>
            <h2 className="section-title" style={{ color: "#f8fafc" }}>
              Identity is the soul of your agents
            </h2>
            <p className="section-subtitle" style={{ color: "#94a3b8", marginBottom: "28px" }}>
              VaultysId gives every agent a cryptographic identity that is
              uniquely, irrevocably theirs. Not a session token you hand out.
              Not an API key you can copy. A decentralised identity that
              embeds accountability into the fabric of every action taken.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "28px" }}>
              {SECURITY_PILLARS.map(({ Icon, title, desc }) => (
                <div key={title} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: "rgba(124, 58, 237, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={18} strokeWidth={1.8} style={{ color: "#a78bfa" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0", marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <Link className="btn-secondary" to="/docs/security/vaultys-id" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              How VaultysId works <ChevronRight size={15} />
            </Link>
          </div>

          <div className="col col--7">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Intent signing flow */}
              <div className="security-card highlight">
                <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a78bfa", marginBottom: "16px" }}>
                  Every action, signed and attributed
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  {[
                    "Create intent",
                    "Sign w/ DID key",
                    "Route via WSS",
                    "Verify signature",
                    "Check policy",
                    "Execute",
                    "Sign result",
                    "Audit log",
                  ].map((step, i, arr) => (
                    <React.Fragment key={step}>
                      <div className="security-flow-step">{step}</div>
                      {i < arr.length - 1 && (
                        <ChevronRight size={13} style={{ color: "#30363d", flexShrink: 0 }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Why it matters for culture */}
              <div className="security-card">
                <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8b949e", marginBottom: "14px" }}>
                  What this means for your organisation
                </div>
                {[
                  { Icon: CheckCircle2, color: "#3fb950", text: "You always know which agent did what, and under whose authority" },
                  { Icon: CheckCircle2, color: "#3fb950", text: "Compromised agents can't affect others — blast radius is always contained" },
                  { Icon: CheckCircle2, color: "#3fb950", text: "Delegation is explicit — no implicit trust, no permission creep" },
                  { Icon: CheckCircle2, color: "#3fb950", text: "Audit trail satisfies SOC 2, ISO 27001, and GDPR requirements" },
                ].map(({ Icon, color, text }) => (
                  <div key={text} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "10px" }}>
                    <Icon size={14} strokeWidth={2.5} style={{ color, flexShrink: 0, marginTop: "3px" }} />
                    <span style={{ fontSize: "0.85rem", color: "#c9d1d9", lineHeight: 1.55 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Developer experience / code snippet
   ──────────────────────────────────────────────────────────── */
function CodeExampleSection() {
  const snippet = `// Send a culturally-aware intent to your research agent
const response = await fetch("/api/intents", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    agentId: "did:vaultys:z6Mkf9x3T...",   // alice-research
    action: "brief_ceo",
    params: {
      topic: "Q1 EMEA market shifts",
      tone: "direct",         // your company voice
      format: "3-bullet-max", // your communication style
      cite_sources: true,     // your quality bar
    },
  }),
});

const { intentId, sentTo } = await response.json();
// The agent's identity + your policy = accountable AI`;

  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-color)" }}>
      <div className="container">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--5">
            <p className="section-label">Developer experience</p>
            <h2 className="section-title">One call to put your culture to work</h2>
            <p className="section-subtitle" style={{ marginBottom: "24px" }}>
              Encoding your culture into an agent is as simple as adding
              parameters to an API call. The platform handles identity
              verification, policy enforcement, and signing — you focus on
              what makes your organisation unique.
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link className="btn-primary" to="/docs/api/overview">
                Explore the API <ChevronRight size={16} strokeWidth={2.5} />
              </Link>
              <Link className="btn-secondary" to="/docs/guides/quickstart">
                5-minute quickstart
              </Link>
            </div>
          </div>
          <div className="col col--7">
            <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "12px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", background: "#161b22", borderBottom: "1px solid #21262d", fontSize: "0.78rem", color: "#8b949e", fontFamily: "JetBrains Mono, monospace" }}>
                <span style={{ background: "#238636", color: "#fff", padding: "1px 6px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700 }}>POST</span>
                /api/intents
              </div>
              <pre style={{ margin: 0, padding: "20px", fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem", lineHeight: "1.65", color: "#c9d1d9", background: "transparent", overflowX: "auto" }}>
                {snippet}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Quote / testimonial strip
   ──────────────────────────────────────────────────────────── */
const QUOTES = [
  {
    quote: "For the first time, our AI agents feel like colleagues, not third-party services. They know our tone, our rules, and who gave them permission to act.",
    author: "Head of Engineering",
    company: "Meridian",
  },
  {
    quote: "The VaultysId model completely changed how we think about AI governance. Every action is attributable. Our compliance team stopped worrying.",
    author: "CISO",
    company: "Vertex Labs",
  },
  {
    quote: "We went from 'we can't use AI here' to 'our agents run inside our firewall, on our data, with our policies'. That changed everything.",
    author: "CTO",
    company: "Nexus AI",
  },
];

function QuotesSection() {
  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-surface-color)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p className="section-label">What teams say</p>
          <h2 className="section-title">Culture compounds when agents carry it</h2>
        </div>
        <div className="row">
          {QUOTES.map(({ quote, author, company }) => (
            <div key={company} className="col col--4" style={{ marginBottom: "20px" }}>
              <div style={{ background: "var(--ifm-card-background-color)", border: "1px solid var(--ifm-color-emphasis-200)", borderRadius: "12px", padding: "28px", height: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ fontSize: "1.5rem", color: "#3b82f6", lineHeight: 1, fontFamily: "Georgia, serif" }}>"</div>
                <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.7, color: "var(--ifm-color-emphasis-800)", fontStyle: "italic", flex: 1 }}>{quote}</p>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{author}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ifm-color-emphasis-600)" }}>{company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   CTA
   ──────────────────────────────────────────────────────────── */
function CTASection() {
  return (
    <section className="cta-section">
      <div className="container" style={{ position: "relative" }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#60a5fa", marginBottom: "16px" }}>
          Open Source · MIT License · Self-hosted
        </p>
        <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)", fontWeight: 900, color: "#f8fafc", marginBottom: "16px" }}>
          Your culture deserves agents<br />that carry it faithfully.
        </h2>
        <p style={{ fontSize: "1.05rem", color: "#94a3b8", maxWidth: "520px", margin: "0 auto 36px", lineHeight: "1.7" }}>
          Deploy in under five minutes. On your infrastructure. With your
          policies. No vendor lock-in, no data leaving your perimeter.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn-primary" to="/docs/guides/quickstart">
            Get started free <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
          <Link className="btn-secondary" to="/docs/overview/architecture">
            Read the architecture
          </Link>
          <a className="btn-secondary" href="https://github.com/vaultys/vaultysclaw" target="_blank" rel="noopener noreferrer">
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
export default function Home(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} — Give your company a soul`}
      description="Deploy AI agents that carry your culture, your policies, and your values. Vaultys Claw is enterprise AI orchestration secured by VaultysId decentralised identity."
    >
      <Hero />
      <EnterpriseSection />
      <ManifestoSection />
      <FeaturesSection />
      <ArchitectureSection />
      <DashboardMockup />
      <SecuritySection />
      <CodeExampleSection />
      <QuotesSection />
      <CTASection />
    </Layout>
  );
}
