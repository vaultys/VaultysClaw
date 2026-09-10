import React from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import clsx from "clsx";
import ArchitectureDiagram from "../components/ArchitectureDiagram";
import ConsoleExplorer from "../components/ConsoleExplorer";
import PeerTrustDiagram from "../components/PeerTrustDiagram";
import {
  ArrowRight,
  Ban,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileCheck,
  Fingerprint,
  GitBranch,
  Globe,
  Key,
  Lock,
  RefreshCw,
  Plane,
  Radio,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Share2,
  Terminal,
  Truck,
  User,
  Wifi,
  Workflow,
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
              VaultysId · Capability certificates · Open source
            </div>

            <h1 className="hero-title">
              Your orchestrator decides what to do.
              <br />
              <span className="gradient-text">
                VaultysClaw decides what it may do.
              </span>
            </h1>

            <p className="hero-subtitle">
              A trust plane, not a framework. Keep the orchestration you already
              run and give every actor — software agent, robot, drone, vehicle,
              sensor, or human — a cryptographic identity and a signed,
              revocable capability certificate. The control plane distributes
              those certificates once; after that any two peers verify each
              other directly, with nothing in the middle.
            </p>

            <div className="hero-facts">
              {[
                { color: "#3b82f6", label: "Identity, not API keys" },
                { color: "#a78bfa", label: "Verified offline, peer to peer" },
                { color: "#10b981", label: "Revocation that actually lands" },
              ].map(({ color, label }) => (
                <div key={label} className="hero-fact">
                  <span style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>

            <div className="hero-cta-group">
              <Link className="btn-primary" to="/docs/guides/quickstart">
                Start with the SDK <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <Link className="btn-secondary" to="/docs/intro">
                What VaultysClaw is
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
    <div className="code-frame" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
      <div className="term-bar">
        <div className="mockup-dot red" />
        <div className="mockup-dot yellow" />
        <div className="mockup-dot green" />
        <span>
          <Terminal size={12} /> invoice-approver — actor runtime
        </span>
      </div>
      <pre>
        <span className="c-dim">$ </span>
        <span className="c-blue">pnpm add</span>
        <span> @vaultysclaw/sdk{"\n"}</span>
        <span className="c-dim">$ </span>
        <span className="c-blue">node</span>
        <span> ./agent.js{"\n\n"}</span>
        <span className="c-green">✓</span>
        <span> identity loaded </span>
        <span className="c-cyan">did:vaultys:z6MkwF3jA7Qx…{"\n"}</span>
        <span className="c-green">✓</span>
        <span> auth handshake complete (service: auth){"\n"}</span>
        <span className="c-yellow">…</span>
        <span> unknown DID → </span>
        <span className="c-yellow">registration_pending{"\n"}</span>
        <span className="c-dim">  waiting for an admin decision…{"\n\n"}</span>
        <span className="c-green">✓</span>
        <span> cert_issued · 2 of 3 requested capabilities{"\n"}</span>
        <span className="c-dim">  granted   </span>
        <span className="c-cyan">api_call, acme:invoice.approve{"\n"}</span>
        <span className="c-dim">  withheld  </span>
        <span className="c-red">file_access{"\n"}</span>
        <span className="c-green">✓</span>
        <span> staple verified · refresh every 150s{"\n\n"}</span>
        <span className="c-dim">{"> "}</span>
        <span>erp_approve_invoice </span>
        <span className="c-green">allowed{"\n"}</span>
        <span className="c-dim">{"> "}</span>
        <span>read_ledger_dump </span>
        <span className="c-red">denied</span>
        <span className="c-dim"> (file_access not granted){"\n"}</span>
      </pre>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Bring your own orchestration
   ──────────────────────────────────────────────────────────── */
const ORCHESTRATORS = [
  "LangGraph",
  "CrewAI",
  "Mastra",
  "Temporal",
  "n8n",
  "MCP servers",
  "Claude Code",
  "your own while-loop",
];

function OrchestrationStrip() {
  return (
    <section className="enterprise-section">
      <div className="container">
        <p className="strip-label">
          Bring your own orchestration — VaultysClaw governs it as an Actor
        </p>
        <div className="works-strip">
          {ORCHESTRATORS.map((name) => (
            <span key={name} className="works-chip">
              <Workflow size={14} strokeWidth={1.9} style={{ opacity: 0.6 }} />
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   The seam: what this is, and what it deliberately is not
   ──────────────────────────────────────────────────────────── */
const IS_LIST = [
  {
    Icon: Fingerprint,
    title: "Who is this agent?",
    desc: "A VaultysId DID, proven per connection by a challenge/response handshake. Not a bearer token you can copy out of an env file.",
  },
  {
    Icon: FileCheck,
    title: "What is it allowed to do?",
    desc: "A CapabilityCertificate, signed by the control plane and by the Actor itself. Anyone can verify it offline — no network, no database.",
  },
  {
    Icon: RefreshCw,
    title: "Is that still true?",
    desc: "The cert_status protocol: a signed, timestamped status any party can request, cache, or staple. Revocation is a ledger write, not a hopeful push.",
  },
  {
    Icon: ScrollText,
    title: "What actually happened?",
    desc: "One append-only audit log, every entry attributed to a DID and keyed to the exact certificate that authorised the action.",
  },
];

const IS_NOT_LIST = [
  "An agent framework — yours already works",
  "A workflow engine — that went in the rebuild; run n8n or Temporal",
  "A model gateway or a prompt router",
  "A chat product, or anything an end user logs into",
  "A cloud your agent traffic has to transit",
];

function SeamSection() {
  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-surface-color)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p className="section-label">The scope</p>
          <h2 className="section-title">Four questions. That is the whole product.</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            Orchestration is solved. Knowing who an actor is and what it may do,
            provably, is not — so that is all VaultysClaw answers.
          </p>
        </div>

        <div className="row">
          {IS_LIST.map(({ Icon, title, desc }) => (
            <div key={title} className="col col--3" style={{ marginBottom: "20px" }}>
              <div className="feature-card">
                <div className="feature-icon blue">
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <div className="feature-title">{title}</div>
                <div className="feature-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="not-panel">
          <div className="not-panel-head">
            <Ban size={16} strokeWidth={2.2} />
            What VaultysClaw is deliberately not
          </div>
          <ul>
            {IS_NOT_LIST.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link className="not-panel-link" to="/docs/reference/removed-surface">
            What was removed in the rebuild, and why <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Distribution → peer to peer
   ──────────────────────────────────────────────────────────── */
const P2P_POINTS = [
  {
    Icon: Share2,
    color: "#a78bfa",
    title: "Issuance is a moment, not a dependency",
    desc: "The control plane signs a certificate and hands it over. That exchange is the only time it has to be reachable — the grant is a durable artefact the holder keeps, not a session it has to maintain.",
  },
  {
    Icon: Wifi,
    color: "#3fb950",
    title: "Any peer can check any other peer",
    desc: "A certificate is signed by the control plane and by its holder, so a second actor verifies it with the issuer's public key alone. No callback, no token introspection endpoint, no shared secret between the two.",
  },
  {
    Icon: Lock,
    color: "#60a5fa",
    title: "Nothing in the middle to compromise or meter",
    desc: "Once distributed, decisions happen where the work happens. There is no broker holding every actor's authority, and no bottleneck that turns an outage into a fleet-wide denial.",
  },
  {
    Icon: RefreshCw,
    color: "#f0b429",
    title: "Freshness is a policy, not a hope",
    desc: "A staple has an age, and trust.maxStatusAgeSeconds says how stale is tolerable. An air-gapped robot can be told to accept an hour-old staple; a payment agent, none at all.",
  },
];

function PeerToPeerSection() {
  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-color)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "44px" }}>
          <p className="section-label">Certificate distribution</p>
          <h2 className="section-title">Distribute the certificates. Then get out of the way.</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            This is the architectural choice everything else follows from. A
            capability is a signed certificate, not a lookup against a server —
            so once it has been distributed, any two actors can establish what
            the other is allowed to do without either of them talking to us.
          </p>
        </div>

        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--6" style={{ marginBottom: "24px" }}>
            <PeerTrustDiagram />
          </div>
          <div className="col col--6">
            <div className="sdk-points">
              {P2P_POINTS.map(({ Icon, color, title, desc }) => (
                <div key={title} className="sdk-point">
                  <div className="sdk-point-icon" style={{ color }}>
                    <Icon size={17} strokeWidth={1.9} />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
              <div className="sdk-links">
                <Link className="btn-secondary" to="/docs/concepts/trust-verification">
                  How offline verification works <ChevronRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Not only AI
   ──────────────────────────────────────────────────────────── */
const ACTOR_KINDS = [
  { Icon: Bot, label: "Software agents", desc: "An LLM loop, a scheduled job, an MCP server." },
  { Icon: Plane, label: "Drones", desc: "A mission grant scoped to an airspace and an hour." },
  { Icon: Cpu, label: "Robots and PLCs", desc: "A cell that may move an axis, and may not open a door." },
  { Icon: Truck, label: "Vehicles and fleets", desc: "Onboard compute that keeps deciding off-network." },
  { Icon: Radio, label: "Sensors and gateways", desc: "Telemetry attributed to a DID, not to an IP." },
  { Icon: User, label: "Humans", desc: "kind: \"human\" — an Actor like any other, no role table." },
];

function BeyondAISection() {
  return (
    <section className="enterprise-section" style={{ paddingBottom: "80px" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <p className="section-label">Actors, not just agents</p>
          <h2 className="section-title">Nothing here is specific to AI</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            An Actor is anything that holds a keypair and takes actions. The
            protocol never asks whether a model is involved — which is why a
            drone, a factory cell, and a payments agent are governed by exactly
            the same ledger, the same certificates, and the same revocation.
          </p>
        </div>
        <div className="kinds-grid">
          {ACTOR_KINDS.map(({ Icon, label, desc }) => (
            <div key={label} className="kind-card">
              <Icon size={18} strokeWidth={1.8} />
              <strong>{label}</strong>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Anthropic Zero Trust teaser
   ──────────────────────────────────────────────────────────── */
function AnthropicScoreTeaser() {
  return (
    <section style={{ padding: "0 0 80px", background: "var(--ifm-background-surface-color)" }}>
      <div className="container">
        <Link to="/zero-trust-score" className="zt-teaser">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="zt-teaser-icon">
              <ShieldCheck size={22} strokeWidth={1.8} style={{ color: "#3b82f6" }} />
            </div>
            <div>
              <div className="zt-teaser-kicker">
                Anthropic Zero Trust AI Agents Framework · self-assessment
              </div>
              <div className="zt-teaser-claim">
                We publish the matrix instead of claiming compliance —{" "}
                <span style={{ color: "#3fb950" }}>7 domains fully</span>,{" "}
                <span style={{ color: "#f59e0b" }}>4 partially</span>,{" "}
                <span style={{ color: "#3b82f6" }}>1 on the roadmap</span>,
                including where we score zero.
              </div>
            </div>
          </div>
          <div className="zt-teaser-cta">
            See the full breakdown <ChevronRight size={16} strokeWidth={2.5} />
          </div>
        </Link>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   SDK — the main event
   ──────────────────────────────────────────────────────────── */
const SDK_TABS: { id: string; label: string; note: string; code: string }[] = [
  {
    id: "ts",
    label: "agent.ts",
    note: "@vaultysclaw/sdk · identity, grant, and the staple loop in one object",
    code: `import { ActorRuntime, loadOrCreateIdentity } from "@vaultysclaw/sdk";

const runtime = new ActorRuntime({
  name: "invoice-approver",
  kind: "openclaw",
  controlPlaneWsUrl: "wss://cp.acme.internal:8081",
  identityPath: "~/.acme/identity.key",
  capabilityStatePath: "~/.acme/capabilities.json",
  capabilityManifestPath: "./capabilities.json",
  // A request, not a declaration. An admin may approve less —
  // and your Actor has to work correctly holding less.
  requestedCapabilities: ["api_call", "file_access", "acme:invoice.approve"],
});

await runtime.start();          // handshake → maybe pending → cert_issued

// Gate your own operation, whatever an "operation" is for you:
// a tool call, an HTTP route, a button, a queue consumer.
if (await runtime.isOperationAllowed("erp_approve_invoice", "invoice:8812")) {
  await erp.approveInvoice("8812");
}

// A revocation, or a custom capability deleted from the registry,
// arrives here — rebuild any cached authorisation on this event.
runtime.on("capabilities", (held) => cache.rebuild(held));`,
  },
  {
    id: "go",
    label: "main.go",
    note: "sdk-go/vconn · the same protocol, the same decisions, in Go",
    code: `conn := vconn.NewClientConn(vconn.ClientConfig{
    CollectorURL: "https://cp.acme.internal:8081",
    Identity:     id,
    Name:         "invoice-poster",
    Kind:         "openclaw",
    RequestedCapabilities: []string{"api_call", "acme:invoice.post"},
    CapabilityStatePath:   "/var/lib/acme/capabilities.json",
})
go conn.Run(ctx)

if !conn.HasCapability("acme:invoice.post") {
    return errors.New("not granted — refusing to post")
}

// Or decide from the certificate itself, with no control plane
// reachable at all. authz.Resolve is a line-for-line port of
// resolvePermission, pinned by the shared conformance vectors.
d := authz.Resolve(authz.RequestedAction{
    Capability: "acme:invoice.post",
    Resource:   authz.Res("invoice:8812"),
}, certs, time.Now().UnixMilli())

if !d.Allowed {
    return fmt.Errorf("denied: %s", d.Reason)
}`,
  },
  {
    id: "manifest",
    label: "capabilities.json",
    note: "Which capability gates which operation — the seam the SDK owns",
    code: `{
  "version": 1,
  "declares": [
    {
      "name": "acme:invoice.approve",
      "label": "Approve invoices",
      "description": "Marks an invoice approved in the Acme ERP."
    }
  ],
  "bindings": {
    "erp_approve_invoice": "acme:invoice.approve",
    "erp_read_invoice": "api_call"
  }
}

// The declared set is reported in \`register\`, so an admin sees what
// is wanted before granting anything. Declaring is not requesting,
// and requesting is not granting.
//
// Parsing is strict: an invalid name, a binding naming an undeclared
// capability, or a missing file all throw. Degrading to "no
// capabilities" would look identical to an app that needs none.`,
  },
];

function SdkSection() {
  const [active, setActive] = React.useState(SDK_TABS[0].id);
  const tab = SDK_TABS.find((t) => t.id === active) ?? SDK_TABS[0];

  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-color)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "44px" }}>
          <p className="section-label">The SDK</p>
          <h2 className="section-title">Two clients. One set of decisions.</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            TypeScript and Go, both driven against a real control plane, both
            resolving permissions through the same 37 conformance vectors. No
            tool registry to adopt — the SDK owns one seam: which capability
            gates which of your operations.
          </p>
        </div>

        <div className="row" style={{ alignItems: "stretch" }}>
          <div className="col col--7" style={{ marginBottom: "24px" }}>
            <div className="code-frame" style={{ height: "100%" }}>
              <div className="sdk-tabs">
                {SDK_TABS.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={clsx("sdk-tab", active === t.id && "active")}
                    onClick={() => setActive(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="sdk-note">{tab.note}</div>
              <pre>{tab.code}</pre>
            </div>
          </div>

          <div className="col col--5">
            <div className="sdk-points">
              {[
                {
                  Icon: Lock,
                  color: "#60a5fa",
                  title: "No fallback to allow",
                  desc: "An unbound operation, an ungranted capability, and an unreachable control plane all deny. There is deliberately no “nothing granted means allow everything” path anywhere in the package.",
                },
                {
                  Icon: RefreshCw,
                  color: "#a78bfa",
                  title: "Holding a certificate is not proof it is still good",
                  desc: "refreshCertStatus() verifies the signed response against the control plane's key from the handshake — not merely because it arrived on an authenticated socket — and the verified result replaces the held set. That is how a revocation lands.",
                },
                {
                  Icon: ShieldCheck,
                  color: "#3fb950",
                  title: "Stale means denied, unless you say otherwise",
                  desc: "Cadence comes from actor_config: refresh at half of maxStatusAgeSeconds, and 0 means no cached status is acceptable at all. No trust config is treated as failClosed.",
                },
                {
                  Icon: Globe,
                  color: "#f0b429",
                  title: "Decide with the network down",
                  desc: "resolvePermission() is synchronous and decides on what is already known. Certificates are signed artefacts — packages/policy verifies one with no network and no database.",
                },
              ].map(({ Icon, color, title, desc }) => (
                <div key={title} className="sdk-point">
                  <div className="sdk-point-icon" style={{ color }}>
                    <Icon size={17} strokeWidth={1.9} />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
              <div className="sdk-links">
                <Link className="btn-primary" to="/docs/architecture/building-an-actor">
                  Build an Actor <ChevronRight size={16} strokeWidth={2.5} />
                </Link>
                <Link className="btn-secondary" to="/docs/reference/websocket-protocol">
                  Protocol reference
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Certificate lifecycle
   ──────────────────────────────────────────────────────────── */
const LIFECYCLE = [
  {
    step: "01",
    title: "Register",
    desc: "The Actor connects and proves its DID with a Challenger handshake. An unknown DID becomes a pending registration — it is connected, and nothing resolves.",
  },
  {
    step: "02",
    title: "Grant",
    desc: "An admin picks capabilities from what was requested. A second, independent certificate handshake signs the grant; cert_issued delivers it.",
  },
  {
    step: "03",
    title: "Enforce",
    desc: "The Actor gates its own operations on what it holds. Scope, expiry, and resource limits are checked by pure code with an injected clock.",
  },
  {
    step: "04",
    title: "Re-check",
    desc: "cert_status_request returns a signed status the holder verifies and staples. A revoked grant, or a deleted custom capability, stops resolving here.",
  },
  {
    step: "05",
    title: "Prove",
    desc: "Every decision lands in the append-only audit log, attributed to a DID and keyed to the certificate that authorised it.",
  },
];

function LifecycleSection() {
  return (
    <section className="features-section">
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <p className="section-label">Certificate lifecycle</p>
          <h2 className="section-title">A grant is an artefact, not a session</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            Capabilities are either built-ins from a closed list or admin-defined{" "}
            <code>vendor:action</code> names from the registry. Both travel
            through identical machinery — the same certificates, scoping, expiry,
            revocation, and resolution.
          </p>
        </div>
        <div className="lifecycle">
          {LIFECYCLE.map(({ step, title, desc }) => (
            <div key={step} className="lifecycle-step">
              <span className="lifecycle-num">{step}</span>
              <strong>{title}</strong>
              <p>{desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <Link className="btn-secondary" to="/docs/concepts/certificates">
            How certificates work <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Architecture
   ──────────────────────────────────────────────────────────── */
function ArchitectureSection() {
  return (
    <section className="arch-section">
      <div className="container">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--5">
            <p className="section-label">Architecture</p>
            <h2 className="section-title">One process you host, clients that dial out</h2>
            <p className="section-subtitle" style={{ marginBottom: "24px" }}>
              One Next.js + WebSocket process over Postgres, holding the
              certificate ledger and the admin console. Actors dial outbound, so
              there are no inbound firewall rules to negotiate — and no actor
              traffic transits anything of ours, because nothing of ours is in
              the path.
            </p>
            <ul className="check-list">
              {[
                "packages/policy and packages/trust are pure — no Prisma, no Next.js, no sockets",
                "Humans are Actors (kind: \"human\"), not a separate identity table — there is no role field anywhere",
                "Access is a ledger lookup, and every mutating admin action authorizes itself",
                "The Go and TypeScript sides are pinned to each other by shared conformance fixtures",
              ].map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} style={{ color: "#3fb950" }} />
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: "28px" }}>
              <Link className="btn-secondary" to="/docs/architecture/overview">
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
   Interactive control plane
   ──────────────────────────────────────────────────────────── */
function ConsoleSection() {
  return (
    <section className="mockup-section">
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <p className="section-label">Control plane · try it</p>
          <h2 className="section-title">Approve something. Then take it away.</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            The admin console, wired to a fake ledger that behaves like the real
            one. Tick the capabilities you would actually grant, approve an
            Actor, then revoke its certificate and see what the holder loses.
          </p>
        </div>
        <ConsoleExplorer />
        <p className="mockup-caption">
          Every number above is derived from the state your clicks change.
          Nothing here is a screenshot.
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   VaultysId
   ──────────────────────────────────────────────────────────── */
const SECURITY_PILLARS = [
  {
    Icon: Globe,
    title: "No central authority",
    desc: "Identity lives with the Actor — no provider to call, no single point of failure.",
  },
  {
    Icon: Key,
    title: "Non-transferable by design",
    desc: "Private keys never leave the entity. An identity cannot be copied out of a config file.",
  },
  {
    Icon: FileCheck,
    title: "Offline-verifiable",
    desc: "A holder verifies a grant locally at decision time — fast, resilient, and auditable.",
  },
];

function SecuritySection() {
  return (
    <section className="security-section">
      <div className="container">
        <div className="row" style={{ alignItems: "center" }}>
          <div className="col col--5">
            <p className="section-label" style={{ color: "#a78bfa" }}>
              Powered by VaultysId
            </p>
            <h2 className="section-title" style={{ color: "#f8fafc" }}>
              An identity you cannot leak in an env var
            </h2>
            <p className="section-subtitle" style={{ color: "#94a3b8", marginBottom: "28px" }}>
              Every Actor holds a VaultysId DID that is uniquely, irrevocably
              its own. Not a session token you hand out. Not an API key you can
              paste into a second process and become two agents at once.
            </p>

            <div className="vid-pillars">
              {SECURITY_PILLARS.map(({ Icon, title, desc }) => (
                <div key={title} className="vid-pillar">
                  <div className="vid-pillar-icon">
                    <Icon size={18} strokeWidth={1.8} style={{ color: "#a78bfa" }} />
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <Link
              className="btn-secondary"
              to="/docs/concepts/trust-verification"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              How verification works <ChevronRight size={15} />
            </Link>
          </div>

          <div className="col col--7">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="security-card highlight">
                <div className="security-card-kicker">
                  Two independent handshakes, one connection
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                  {[
                    "register",
                    "auth_challenge",
                    "auth_complete",
                    "cert_challenge",
                    "cert_issued",
                    "cert_status_request",
                    "verify + staple",
                    "decide",
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

              <div className="security-card">
                <div className="security-card-kicker dim">
                  What this buys the people who have to sign off
                </div>
                {[
                  "You always know which Actor did what, and under whose authority",
                  "A compromised Actor holds only its own scoped grant — blast radius is bounded by the certificate",
                  "Delegation is explicit and signed; there is no implicit trust to creep",
                  "Deleting a registry entry is a mass revoke — it stops resolving on every holder's next refresh",
                ].map((text) => (
                  <div key={text} className="security-check">
                    <CheckCircle2 size={14} strokeWidth={2.5} style={{ color: "#3fb950" }} />
                    <span>{text}</span>
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
   Conformance
   ──────────────────────────────────────────────────────────── */
const CONFORMANCE = [
  {
    file: "permission-vectors.json",
    count: "37 cases",
    desc: "Run by both packages/trust and sdk-go/authz. If the two ever disagree about a permission, a suite goes red.",
  },
  {
    file: "capability-names.json",
    count: "31 cases",
    desc: "One grammar for capability names, mirrored in packages/policy and sdk-go/capability. Never validate a name by hand.",
  },
  {
    file: "grant-fixture.json",
    count: "TS-signed",
    desc: "Signed on the TypeScript side, verified on the Go side. Offline grant verification, proven across the boundary.",
  },
];

function ConformanceSection() {
  return (
    <section style={{ padding: "80px 0", background: "var(--ifm-background-surface-color)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "44px" }}>
          <p className="section-label">TS ↔ Go parity</p>
          <h2 className="section-title">Two implementations, pinned to each other</h2>
          <p className="section-subtitle" style={{ margin: "0 auto", textAlign: "center" }}>
            An authorization decision that differs between a Go robot and a
            TypeScript agent is a security bug. So the logic is not documented as
            identical — it is tested as identical, from fixtures neither side may
            change alone.
          </p>
        </div>
        <div className="row">
          {CONFORMANCE.map(({ file, count, desc }) => (
            <div key={file} className="col col--4" style={{ marginBottom: "20px" }}>
              <div className="conf-card">
                <div className="conf-file">
                  <code>{file}</code>
                  <span>{count}</span>
                </div>
                <p>{desc}</p>
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
        <p className="cta-kicker">Open source · Self-hosted · Public alpha</p>
        <h2 className="cta-title">
          Keep your orchestration.
          <br />
          Give it an identity it can prove.
        </h2>
        <p className="cta-sub">
          A control plane you run, certificates any peer can verify, and two SDKs
          that refuse to guess. Ten minutes to a connected Actor holding a real
          grant.
        </p>
        <div className="cta-buttons">
          <Link className="btn-primary" to="/docs/guides/quickstart">
            Run the quickstart <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
          <Link className="btn-secondary" to="/docs/architecture/building-an-actor">
            Build an Actor
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
export default function Home(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} — a trust plane for agents, robots, and machines`}
      description="VaultysClaw secures whatever orchestration you already run: a cryptographic identity for every actor — agent, robot, drone, vehicle, sensor, or human — signed capability certificates any peer verifies offline, and a live revocation protocol. TypeScript and Go SDKs."
    >
      <Hero />
      <OrchestrationStrip />
      <SeamSection />
      <PeerToPeerSection />
      <BeyondAISection />
      <AnthropicScoreTeaser />
      <SdkSection />
      <LifecycleSection />
      <ArchitectureSection />
      <ConsoleSection />
      <SecuritySection />
      <ConformanceSection />
      <CTASection />
    </Layout>
  );
}
