import React from "react";
import clsx from "clsx";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Plug,
  Radio,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldOff,
  Users,
  X,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   An interactive replica of the control plane's admin console.
   Every number on screen is derived from the state below, so
   approving an Actor or revoking a certificate really does move
   the tiles, the tables, and the audit log — the same way the
   real console does. No network, no backend: this is a model of
   the ledger, not a screenshot of one.
   ──────────────────────────────────────────────────────────── */

type ActorKind = "agent" | "human" | "sensor" | "device";
type PageId = "overview" | "actors" | "certificates" | "audit" | "workspaces";

interface Actor {
  did: string;
  name: string;
  kind: ActorKind;
  runtime: string;
  workspace: string;
  connected: boolean;
}

interface Certificate {
  id: string;
  holderDid: string;
  holderName: string;
  capabilities: string[];
  scope: string;
  issued: string;
  expires: string;
  revoked: boolean;
}

interface PendingActor {
  id: string;
  did: string;
  name: string;
  kind: ActorKind;
  runtime: string;
  workspace: string;
  seen: string;
  /** What the Actor asked for. A request — never a grant. */
  requested: { name: string; label: string; custom?: boolean }[];
}

interface AuditEntry {
  id: number;
  at: string;
  event: string;
  actor: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
  sig: string;
}

interface ConsoleState {
  actors: Actor[];
  certificates: Certificate[];
  pending: PendingActor[];
  audit: AuditEntry[];
  nextId: number;
}

const INITIAL: ConsoleState = {
  actors: [
    {
      did: "did:vaultys:z6Mkf9x3TQnP…",
      name: "alice-research",
      kind: "agent",
      runtime: "@vaultysclaw/sdk · LangGraph",
      workspace: "Research",
      connected: true,
    },
    {
      did: "did:vaultys:z6MkrB1vH8dW…",
      name: "invoice-poster",
      kind: "agent",
      runtime: "sdk-go · Temporal worker",
      workspace: "Finance",
      connected: true,
    },
    {
      did: "did:vaultys:z6MkuT4sJ2Lp…",
      name: "fx-macbook",
      kind: "sensor",
      runtime: "vaultysclaw-sensor v0.9",
      workspace: "Corp IT",
      connected: true,
    },
    {
      did: "did:vaultys:z6MkhQ7dR9Zm…",
      name: "fx.thoorens",
      kind: "human",
      runtime: "VaultysId wallet",
      workspace: "—",
      connected: true,
    },
    {
      did: "did:vaultys:z6MkpL5nY6Tc…",
      name: "edge-gateway-03",
      kind: "device",
      runtime: "sdk-go embedded",
      workspace: "Operations",
      connected: false,
    },
  ],
  certificates: [
    {
      id: "cert_8f2a",
      holderDid: "did:vaultys:z6Mkf9x3TQnP…",
      holderName: "alice-research",
      capabilities: ["internet_access", "api_call"],
      scope: "workspace:Research",
      issued: "12 days ago",
      expires: "in 78 days",
      revoked: false,
    },
    {
      id: "cert_41c7",
      holderDid: "did:vaultys:z6MkrB1vH8dW…",
      holderName: "invoice-poster",
      capabilities: ["api_call", "acme:invoice.post"],
      scope: "workspace:Finance",
      issued: "4 days ago",
      expires: "in 26 days",
      revoked: false,
    },
    {
      id: "cert_a913",
      holderDid: "did:vaultys:z6MkhQ7dR9Zm…",
      holderName: "fx.thoorens",
      capabilities: ["admin_console_access"],
      scope: "org",
      issued: "31 days ago",
      expires: "in 334 days",
      revoked: false,
    },
    {
      id: "cert_6b04",
      holderDid: "did:vaultys:z6MkuT4sJ2Lp…",
      holderName: "fx-macbook",
      capabilities: ["sensor_telemetry"],
      scope: "org",
      issued: "9 days ago",
      expires: "in 81 days",
      revoked: false,
    },
  ],
  pending: [
    {
      id: "pend_1",
      did: "did:vaultys:z6MkwF3jA7Qx…",
      name: "invoice-approver",
      kind: "agent",
      runtime: "@vaultysclaw/sdk · CrewAI crew",
      workspace: "Finance",
      seen: "3m ago",
      requested: [
        { name: "api_call", label: "Call outbound HTTP APIs" },
        { name: "file_access", label: "Read and write local files" },
        {
          name: "acme:invoice.approve",
          label: "Mark an invoice approved in the Acme ERP",
          custom: true,
        },
      ],
    },
    {
      id: "pend_2",
      did: "did:vaultys:z6MkdC8pM4Rv…",
      name: "ops-dispatcher",
      kind: "agent",
      runtime: "sdk-go · n8n node",
      workspace: "Operations",
      seen: "18m ago",
      requested: [
        { name: "mail_send", label: "Send mail on the org's behalf" },
        { name: "api_call", label: "Call outbound HTTP APIs" },
      ],
    },
  ],
  audit: [
    {
      id: 4,
      at: "2m ago",
      event: "actor.registered",
      actor: "invoice-approver",
      detail: "Unknown DID · queued for approval · 3 capabilities requested",
      tone: "warning",
      sig: "a3f9b2…d04c",
    },
    {
      id: 3,
      at: "1h ago",
      event: "cert_status.checked",
      actor: "alice-research",
      detail: "Signed status response verified · active · staple refreshed",
      tone: "neutral",
      sig: "71ce55…8ab1",
    },
    {
      id: 2,
      at: "4d ago",
      event: "certificate.issued",
      actor: "invoice-poster",
      detail: "cert_41c7 · api_call, acme:invoice.post · workspace:Finance",
      tone: "success",
      sig: "c40d18…9f27",
    },
    {
      id: 1,
      at: "12d ago",
      event: "certificate.issued",
      actor: "alice-research",
      detail: "cert_8f2a · internet_access, api_call · workspace:Research",
      tone: "success",
      sig: "5e2b7a…31da",
    },
  ],
  nextId: 5,
};

const NAV: {
  id: PageId;
  label: string;
  icon: React.ElementType;
  badge?: (s: ConsoleState) => number;
}[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "actors", label: "Actors", icon: Users, badge: (s) => s.pending.length },
  { id: "certificates", label: "Certificates", icon: KeyRound },
  { id: "audit", label: "Audit Log", icon: ScrollText, badge: (s) => 0 },
  { id: "workspaces", label: "Workspaces", icon: Globe2 },
];

const KIND_ICON: Record<ActorKind, React.ElementType> = {
  agent: Bot,
  human: Users,
  sensor: Radio,
  device: Cpu,
};

function randHex(n: number) {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Capabilities an Actor currently holds, from live (non-revoked) certificates only. */
function heldCapabilities(state: ConsoleState, did: string): string[] {
  return state.certificates
    .filter((c) => c.holderDid === did && !c.revoked)
    .flatMap((c) => c.capabilities);
}

export default function ConsoleExplorer(): React.ReactElement {
  const [state, setState] = React.useState<ConsoleState>(INITIAL);
  const [page, setPage] = React.useState<PageId>("overview");
  const [tab, setTab] = React.useState<"pending" | "agents" | "humans">("pending");
  const [toast, setToast] = React.useState<string | null>(null);
  /** Per-pending-Actor: which of the requested capabilities the operator will actually grant. */
  const [selection, setSelection] = React.useState<Record<string, string[]>>({
    pend_1: ["api_call", "acme:invoice.approve"],
    pend_2: ["api_call"],
  });

  const flash = React.useCallback((message: string) => {
    setToast(message);
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const appendAudit = (
    s: ConsoleState,
    entry: Omit<AuditEntry, "id" | "at" | "sig">,
  ): ConsoleState => ({
    ...s,
    audit: [
      { ...entry, id: s.nextId, at: "just now", sig: `${randHex(6)}…${randHex(4)}` },
      ...s.audit,
    ],
    nextId: s.nextId + 1,
  });

  function approve(p: PendingActor) {
    const granted = selection[p.id] ?? [];
    setState((s) => {
      const certId = `cert_${randHex(4)}`;
      let next: ConsoleState = {
        ...s,
        pending: s.pending.filter((x) => x.id !== p.id),
        actors: [
          {
            did: p.did,
            name: p.name,
            kind: p.kind,
            runtime: p.runtime,
            workspace: p.workspace,
            connected: true,
          },
          ...s.actors,
        ],
        certificates: granted.length
          ? [
              {
                id: certId,
                holderDid: p.did,
                holderName: p.name,
                capabilities: granted,
                scope: `workspace:${p.workspace}`,
                issued: "just now",
                expires: "in 90 days",
                revoked: false,
              },
              ...s.certificates,
            ]
          : s.certificates,
      };
      next = appendAudit(next, {
        event: "actor.approved",
        actor: p.name,
        detail: `Registration approved · ${granted.length} of ${p.requested.length} requested capabilities granted`,
        tone: "success",
      });
      if (granted.length) {
        next = appendAudit(next, {
          event: "certificate.issued",
          actor: p.name,
          detail: `${certId} · ${granted.join(", ")} · workspace:${p.workspace}`,
          tone: "success",
        });
      }
      return next;
    });
    flash(
      granted.length
        ? `cert_challenge → cert_issued delivered to ${p.name} over WebSocket · ${granted.length} capabilit${granted.length === 1 ? "y" : "ies"} granted`
        : `${p.name} approved with no capabilities — it connects, and every operation denies`,
    );
    setPage("certificates");
  }

  function deny(p: PendingActor) {
    setState((s) =>
      appendAudit(
        { ...s, pending: s.pending.filter((x) => x.id !== p.id) },
        {
          event: "actor.denied",
          actor: p.name,
          detail: "Registration denied · no certificate issued · DID stays unknown",
          tone: "danger",
        },
      ),
    );
    flash(`${p.name} denied. It may reconnect, but nothing resolves until an admin acts.`);
  }

  function revoke(cert: Certificate) {
    setState((s) =>
      appendAudit(
        {
          ...s,
          certificates: s.certificates.map((c) =>
            c.id === cert.id ? { ...c, revoked: true } : c,
          ),
        },
        {
          event: "certificate.revoked",
          actor: cert.holderName,
          detail: `${cert.id} · ${cert.capabilities.join(", ")} · takes effect on next status refresh`,
          tone: "danger",
        },
      ),
    );
    flash(
      `${cert.id} revoked. ${cert.holderName}'s next cert_status_request returns a signed non-active status — under failClosed it denies everything.`,
    );
  }

  function toggleCap(pendId: string, cap: string) {
    setSelection((sel) => {
      const current = sel[pendId] ?? [];
      return {
        ...sel,
        [pendId]: current.includes(cap)
          ? current.filter((c) => c !== cap)
          : [...current, cap],
      };
    });
  }

  function reset() {
    setState(INITIAL);
    setSelection({ pend_1: ["api_call", "acme:invoice.approve"], pend_2: ["api_call"] });
    setPage("overview");
    setTab("pending");
    flash("Demo ledger reset.");
  }

  const activeCerts = state.certificates.filter((c) => !c.revoked);
  const revokedCerts = state.certificates.filter((c) => c.revoked);

  return (
    <div className="cx-window">
      {/* ── Browser chrome ── */}
      <div className="mockup-titlebar">
        <div className="mockup-dot red" />
        <div className="mockup-dot yellow" />
        <div className="mockup-dot green" />
        <div className="mockup-url-bar">
          https://vaultysclaw.acme.internal/admin
          {page === "overview" ? "" : `/${page}`}
        </div>
        <button type="button" className="cx-reset" onClick={reset}>
          <RotateCcw size={12} strokeWidth={2.4} /> Reset
        </button>
      </div>

      <div className="cx-body">
        {/* ── Sidebar ── */}
        <div className="cx-sidebar">
          <div className="mockup-sidebar-logo">
            <div className="logo-dot" />
            VaultysClaw
          </div>
          {NAV.map(({ id, label, icon: Icon, badge }) => {
            const count = badge?.(state) ?? 0;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setPage(id)}
                className={clsx("cx-nav-item", page === id && "active")}
              >
                <Icon size={15} strokeWidth={page === id ? 2.2 : 1.8} />
                <span>{label}</span>
                {count > 0 && <span className="cx-nav-badge">{count}</span>}
              </button>
            );
          })}
          <div className="cx-nav-spacer" />
          <div className="cx-nav-item muted">
            <Plug size={15} strokeWidth={1.8} />
            <span>Integrations</span>
          </div>
          <div className="cx-nav-item muted">
            <Settings size={15} strokeWidth={1.8} />
            <span>Settings</span>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="cx-content">
          {page === "overview" && (
            <>
              <CxHeader
                title="Overview"
                desc="Trust posture, and the next useful action."
              />
              <div className="cx-tiles">
                <Tile
                  label="Actors"
                  value={state.actors.length}
                  detail={`${state.actors.filter((a) => a.kind === "human").length} human · ${state.actors.filter((a) => a.kind === "agent" || a.kind === "device").length} agent/device · ${state.actors.filter((a) => a.kind === "sensor").length} sensor`}
                  tone="primary"
                  onClick={() => {
                    setPage("actors");
                    setTab("agents");
                  }}
                />
                <Tile
                  label="Pending approval"
                  value={state.pending.length}
                  detail={
                    state.pending.length
                      ? "Registration decisions need attention"
                      : "Registration queue is clear"
                  }
                  tone={state.pending.length ? "warning" : "neutral"}
                  onClick={() => {
                    setPage("actors");
                    setTab("pending");
                  }}
                />
                <Tile
                  label="Active certificates"
                  value={activeCerts.length}
                  detail={
                    revokedCerts.length
                      ? `${revokedCerts.length} revoked in the ledger`
                      : "Capability grants currently usable"
                  }
                  tone={activeCerts.length ? "success" : "neutral"}
                  onClick={() => setPage("certificates")}
                />
              </div>

              <div className="cx-section-label">Needs attention</div>
              {state.pending.length === 0 && revokedCerts.length === 0 ? (
                <div className="cx-empty">
                  <CheckCircle2 size={15} strokeWidth={2.2} /> Nothing waiting. Every
                  Actor holds exactly what an admin granted it.
                </div>
              ) : (
                <div className="cx-attention-list">
                  {state.pending.length > 0 && (
                    <button
                      type="button"
                      className="cx-attention warning"
                      onClick={() => {
                        setPage("actors");
                        setTab("pending");
                      }}
                    >
                      <Clock3 size={15} strokeWidth={2} />
                      <div>
                        <strong>
                          {state.pending.length} actor
                          {state.pending.length === 1 ? "" : "s"} awaiting approval
                        </strong>
                        <span>Grant only the capabilities each one needs right now.</span>
                      </div>
                      <ChevronRight size={15} />
                    </button>
                  )}
                  {revokedCerts.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="cx-attention danger"
                      onClick={() => setPage("audit")}
                    >
                      <ShieldOff size={15} strokeWidth={2} />
                      <div>
                        <strong>
                          {c.id} revoked · {c.holderName}
                        </strong>
                        <span>
                          Its next verified status refresh drops {c.capabilities.length}{" "}
                          capabilit{c.capabilities.length === 1 ? "y" : "ies"}.
                        </span>
                      </div>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
              )}

              <div className="cx-section-label">Recent activity</div>
              <div className="cx-audit-list">
                {state.audit.slice(0, 4).map((e) => (
                  <AuditRow key={e.id} entry={e} compact />
                ))}
              </div>
            </>
          )}

          {page === "actors" && (
            <>
              <CxHeader
                title="Actors"
                desc="People, agents, devices, and approvals. Humans are Actors too — there is no separate role table."
              />
              <div className="cx-tabs">
                {(
                  [
                    ["pending", `Pending (${state.pending.length})`],
                    [
                      "agents",
                      `Agents & Devices (${state.actors.filter((a) => a.kind === "agent" || a.kind === "device" || a.kind === "sensor").length})`,
                    ],
                    [
                      "humans",
                      `Humans (${state.actors.filter((a) => a.kind === "human").length})`,
                    ],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className={clsx("cx-tab", tab === id && "active")}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "pending" &&
                (state.pending.length === 0 ? (
                  <div className="cx-empty">
                    <CheckCircle2 size={15} strokeWidth={2.2} /> Registration queue is
                    clear.
                  </div>
                ) : (
                  <div className="cx-pending-list">
                    {state.pending.map((p) => {
                      const granted = selection[p.id] ?? [];
                      return (
                        <div key={p.id} className="cx-pending-card">
                          <div className="cx-pending-head">
                            <div className="cx-actor-id">
                              <span className="cx-kind-chip">
                                <Bot size={13} />
                              </span>
                              <div>
                                <div className="cx-actor-name">{p.name}</div>
                                <div className="cx-did">{p.did}</div>
                              </div>
                            </div>
                            <div className="cx-pending-meta">
                              <span>{p.runtime}</span>
                              <span>seen {p.seen}</span>
                            </div>
                          </div>

                          <div className="cx-req-label">
                            Requested capabilities — tick what you actually grant
                          </div>
                          <div className="cx-req-list">
                            {p.requested.map((r) => {
                              const on = granted.includes(r.name);
                              return (
                                <button
                                  type="button"
                                  key={r.name}
                                  className={clsx("cx-req", on && "on")}
                                  onClick={() => toggleCap(p.id, r.name)}
                                >
                                  <span className={clsx("cx-check", on && "on")}>
                                    {on && <Check size={11} strokeWidth={3.5} />}
                                  </span>
                                  <span className="cx-req-name">
                                    {r.name}
                                    {r.custom && <em className="cx-custom">custom</em>}
                                  </span>
                                  <span className="cx-req-desc">{r.label}</span>
                                </button>
                              );
                            })}
                          </div>

                          <div className="cx-pending-actions">
                            <button
                              type="button"
                              className="cx-btn primary"
                              onClick={() => approve(p)}
                            >
                              Approve with {granted.length} capabilit
                              {granted.length === 1 ? "y" : "ies"}
                            </button>
                            <button
                              type="button"
                              className="cx-btn ghost"
                              onClick={() => deny(p)}
                            >
                              <X size={13} strokeWidth={2.6} /> Deny
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

              {tab !== "pending" && (
                <ActorTable
                  state={state}
                  actors={state.actors.filter((a) =>
                    tab === "humans" ? a.kind === "human" : a.kind !== "human",
                  )}
                />
              )}
            </>
          )}

          {page === "certificates" && (
            <>
              <CxHeader
                title="Certificates"
                desc="The append-only grant ledger. A certificate is a signed artefact — revoking one adds a row, it never edits one."
              />
              <div className="cx-table">
                <div className="cx-tr cx-th" style={{ gridTemplateColumns: CERT_COLS }}>
                  <span>Certificate</span>
                  <span>Holder</span>
                  <span>Capabilities</span>
                  <span>Scope</span>
                  <span>Status</span>
                  <span />
                </div>
                {state.certificates.map((c) => (
                  <div
                    key={c.id}
                    className={clsx("cx-tr", c.revoked && "dim")}
                    style={{ gridTemplateColumns: CERT_COLS }}
                  >
                    <span className="cx-mono">{c.id}</span>
                    <span className="cx-strong">{c.holderName}</span>
                    <span>
                      {c.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className={clsx(
                            "mockup-cap-pill",
                            cap.includes(":") && "custom",
                          )}
                        >
                          {cap}
                        </span>
                      ))}
                    </span>
                    <span className="cx-mono dimtext">{c.scope}</span>
                    <span>
                      <span
                        className={clsx(
                          "mockup-status-badge",
                          c.revoked ? "offline" : "online",
                        )}
                      >
                        {c.revoked ? "revoked" : "active"}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      {!c.revoked && (
                        <button
                          type="button"
                          className="cx-btn danger sm"
                          onClick={() => revoke(c)}
                        >
                          Revoke
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="cx-note">
                Revocation is not a delete. The row stays, flipped to{" "}
                <code>revoked</code>, and the holder learns about it the next time it
                asks — which is why the SDK re-checks instead of trusting the
                certificate it already has.
              </p>
            </>
          )}

          {page === "audit" && (
            <>
              <CxHeader
                title="Audit Log"
                desc="Every decision, signed, in order. Each row cites the certificate that authorised it."
              />
              <div className="cx-audit-list">
                {state.audit.map((e) => (
                  <AuditRow key={e.id} entry={e} />
                ))}
              </div>
            </>
          )}

          {page === "workspaces" && (
            <>
              <CxHeader
                title="Workspaces"
                desc="Scopes for teams, environments, and apps. A certificate's scope is what keeps a Finance grant out of Research."
              />
              <div className="cx-ws-grid">
                {["Research", "Finance", "Operations", "Corp IT"].map((ws) => {
                  const members = state.actors.filter((a) => a.workspace === ws);
                  const certs = activeCerts.filter(
                    (c) => c.scope === `workspace:${ws}`,
                  );
                  return (
                    <div key={ws} className="cx-ws-card">
                      <div className="cx-ws-name">
                        <Globe2 size={14} strokeWidth={2} /> {ws}
                      </div>
                      <div className="cx-ws-stat">
                        <strong>{members.length}</strong> actor
                        {members.length === 1 ? "" : "s"}
                      </div>
                      <div className="cx-ws-stat">
                        <strong>{certs.length}</strong> scoped grant
                        {certs.length === 1 ? "" : "s"}
                      </div>
                      <div className="cx-ws-caps">
                        {[...new Set(certs.flatMap((c) => c.capabilities))]
                          .slice(0, 4)
                          .map((cap) => (
                            <span key={cap} className="mockup-cap-pill">
                              {cap}
                            </span>
                          ))}
                        {certs.length === 0 && (
                          <span className="dimtext">no active grants</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="cx-toast" role="status">
          <span className="cx-toast-dot" />
          {toast}
        </div>
      )}
    </div>
  );
}

const CERT_COLS = "110px 150px 1fr 160px 100px 90px";
const ACTOR_COLS = "1.3fr 1.6fr 1fr 110px";

function CxHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="cx-header">
      <div className="cx-header-title">
        {title}
        <span className="cx-live">
          <span className="cx-live-dot" /> live
        </span>
      </div>
      <div className="cx-header-desc">{desc}</div>
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "primary" | "warning" | "success" | "neutral";
  onClick: () => void;
}) {
  return (
    <button type="button" className={clsx("cx-tile", tone)} onClick={onClick}>
      <div className="cx-tile-label">{label}</div>
      <div className="cx-tile-value">{value}</div>
      <div className="cx-tile-detail">{detail}</div>
      <ChevronRight className="cx-tile-arrow" size={14} />
    </button>
  );
}

function ActorTable({ state, actors }: { state: ConsoleState; actors: Actor[] }) {
  return (
    <div className="cx-table">
      <div className="cx-tr cx-th" style={{ gridTemplateColumns: ACTOR_COLS }}>
        <span>Actor</span>
        <span>Held capabilities</span>
        <span>Runtime</span>
        <span>Status</span>
      </div>
      {actors.map((a) => {
        const held = heldCapabilities(state, a.did);
        const Icon = KIND_ICON[a.kind];
        return (
          <div key={a.did} className="cx-tr" style={{ gridTemplateColumns: ACTOR_COLS }}>
            <span>
              <span className="cx-actor-id">
                <span className="cx-kind-chip">
                  <Icon size={13} />
                </span>
                <span>
                  <span className="cx-actor-name">{a.name}</span>
                  <span className="cx-did">{a.workspace}</span>
                </span>
              </span>
            </span>
            <span>
              {held.length ? (
                held.map((cap) => (
                  <span
                    key={cap}
                    className={clsx("mockup-cap-pill", cap.includes(":") && "custom")}
                  >
                    {cap}
                  </span>
                ))
              ) : (
                <span className="cx-none">none — every operation denies</span>
              )}
            </span>
            <span className="cx-mono dimtext">{a.runtime}</span>
            <span>
              <span
                className={clsx(
                  "mockup-status-badge",
                  a.connected ? "online" : "offline",
                )}
              >
                {a.connected ? "connected" : "offline"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AuditRow({ entry, compact }: { entry: AuditEntry; compact?: boolean }) {
  return (
    <div className={clsx("cx-audit-row", entry.tone, compact && "compact")}>
      <span className="cx-audit-event">{entry.event}</span>
      <span className="cx-audit-actor">{entry.actor}</span>
      <span className="cx-audit-detail">{entry.detail}</span>
      <span className="cx-audit-meta">
        <span className="cx-mono">{entry.sig}</span>
        <span>{entry.at}</span>
      </span>
    </div>
  );
}
