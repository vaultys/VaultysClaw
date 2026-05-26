"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Activity,
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Key,
  FileText,
  AlertTriangle,
  Loader2,
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  Zap,
  Link2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditDetail {
  id: string;
  source: "activity" | "intent";
  event: string;
  agentDid: string | null;
  agentName: string | null;
  details: string | null;
  detailsParsed: unknown;
  status: string | null;
  error: string | null;
  timestamp: string;
  params: unknown;
  output: unknown;
  sentAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

interface CertInfo {
  protocol: string | null;
  state: number | null;
  certTimestamp: number | null;
  error: string | null;
  pk1Did: string | null;
  pk2Did: string | null;
  signatureVerified: boolean;
  signedPayload: string | null;
  capabilities: string[] | null;
  resourceLimits: {
    maxTokensPerDay?: number;
    maxRequestsPerHour?: number;
    allowedDomains?: string[];
  } | null;
  policyId: string | null;
  policyExpiresAt: string | null;
  rawMetadata: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={13} />,
  internet_access: <Globe size={13} />,
  browser_control: <Monitor size={13} />,
  api_call: <Plug size={13} />,
  mail_send: <Mail size={13} />,
  code_execution: <Code size={13} />,
  system_command: <Terminal size={13} />,
};

const CERT_STATE_LABELS: Record<number, string> = {
  0: "Initial",
  1: "Challenge sent",
  2: "Complete ✓",
  [-1]: "Failed ✗",
  [-2]: "Error ✗",
};

const ACTIVITY_LABELS: Record<string, string> = {
  agent_reconnected: "Agent reconnected",
  agent_authenticated: "Agent authenticated",
  registration_requested: "Registration requested",
  registration_approved: "Registration approved",
  registration_rejected: "Registration rejected",
  agent_disconnected: "Agent disconnected",
  capabilities_updated: "Capabilities updated",
  auth_failed: "Auth failed",
  user_authenticated: "User authenticated",
};

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return parseUTC(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function shortDid(did: string) {
  const parts = did.split(":");
  const key = parts[parts.length - 1];
  return key.length > 20 ? `${key.slice(0, 10)}…${key.slice(-6)}` : did;
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const json = JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-xs text-vc-muted hover:text-vc-text transition-colors"
      >
        <span className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}>▾</span>
        {label}
      </button>
      {!collapsed && (
        <pre className="bg-vc-bg border border-vc-border rounded-lg p-4 text-xs font-mono text-vc-text-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {json}
        </pre>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);

  const [entry, setEntry] = useState<AuditDetail | null>(null);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/governance/audit/${encodeURIComponent(id)}`);
        if (res.status === 404) { setError("Entry not found"); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setEntry(data.entry);
        setCertInfo(data.certInfo ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 w-full max-w-4xl mx-auto flex items-center gap-2 text-vc-muted">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="p-6 w-full max-w-7xl mx-auto space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-600 dark:text-red-400 text-sm">
          {error ?? "Entry not found"}
        </div>
      </div>
    );
  }

  const isActivity = entry.source === "activity";
  const isAuth = ["agent_authenticated", "auth_failed", "registration_approved"].includes(entry.event);

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push("/governance?tab=audit")}
        className="flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400 transition-colors"
      >
        <ChevronLeft size={16} /> Audit Log
      </button>

      {/* Header card */}
      <div className="bg-vc-surface border border-vc-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-lg border flex-shrink-0 ${isActivity
            ? "bg-indigo-100 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
            : "bg-purple-100 dark:bg-purple-500/10 border-purple-300 dark:border-purple-500/20 text-purple-600 dark:text-purple-400"
            }`}>
            {isActivity ? <Activity size={18} /> : <FileText size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-base font-semibold text-vc-text">
                {ACTIVITY_LABELS[entry.event] ?? entry.event.replace(/_/g, " ")}
              </h1>
              {/* Source badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${isActivity
                ? "bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-500/25"
                : "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-500/25"
                }`}>
                {entry.source}
              </span>
              {/* Status badge */}
              {entry.status === "success" && (
                <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 size={12} /> success
                </span>
              )}
              {entry.status === "failed" && (
                <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <XCircle size={12} /> failed
                </span>
              )}
              {entry.status && entry.status !== "success" && entry.status !== "failed" && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <Clock size={12} /> {entry.status}
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-vc-muted">
              <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(entry.timestamp)}</span>
              {entry.agentDid && (
                <span
                  className="flex items-center gap-1 cursor-pointer hover:text-indigo-500 transition-colors"
                  title={entry.agentDid}
                  onClick={() => router.push(`/agents/${encodeURIComponent(entry.agentDid!)}`)}
                >
                  <Bot size={11} />
                  {entry.agentName ?? shortDid(entry.agentDid)}
                  <Link2 size={10} className="opacity-60" />
                </span>
              )}
              {entry.durationMs !== null && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {entry.durationMs}ms
                </span>
              )}
            </div>

            {/* Entry ID */}
            <p className="text-[10px] font-mono text-vc-subtle mt-1.5">{entry.id}</p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {entry.error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-mono text-xs break-all">{entry.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Payload ─────────────────────────────────────────────────────── */}
        <div className="bg-vc-surface border border-vc-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-vc-text flex items-center gap-2">
            <FileText size={14} className="text-vc-muted" /> Payload
          </h2>

          {/* Intent timing */}
          {!isActivity && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Sent at", value: formatDate(entry.sentAt) },
                { label: "Completed at", value: entry.completedAt ? formatDate(entry.completedAt) : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-vc-raised border border-vc-border rounded-lg px-3 py-2">
                  <div className="text-vc-subtle uppercase text-[10px] mb-0.5">{label}</div>
                  <div className="text-vc-text">{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Params / details */}
          {entry.params !== null && (
            <JsonBlock value={entry.params} label="Intent params" />
          )}
          {entry.detailsParsed !== null && isActivity && (
            <JsonBlock value={entry.detailsParsed} label="Event details" />
          )}
          {entry.detailsParsed === null && entry.details && (
            <div>
              <p className="text-xs text-vc-muted mb-1.5">Raw details</p>
              <pre className="bg-vc-bg border border-vc-border rounded-lg p-3 text-xs font-mono text-vc-text-2 overflow-x-auto whitespace-pre-wrap break-all">
                {entry.details}
              </pre>
            </div>
          )}

          {/* Output */}
          {entry.output !== null && (
            <JsonBlock value={entry.output} label="Output" />
          )}

          {!entry.params && !entry.details && !entry.output && (
            <p className="text-xs text-vc-subtle italic">No payload data recorded for this event.</p>
          )}
        </div>

        {/* ── Certificate & crypto verification ────────────────────────────── */}
        <div className="bg-vc-surface border border-vc-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-vc-text flex items-center gap-2">
            <ShieldCheck size={14} className="text-vc-muted" /> Certificate & Cryptographic State
          </h2>

          {!certInfo ? (
            <div className="text-xs text-vc-subtle italic py-4 text-center">
              {entry.agentDid
                ? "No certificate on file for this agent yet."
                : "No agent DID associated with this entry."}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cert state summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  {
                    label: "Protocol state",
                    value: (
                      <span className={`font-semibold ${certInfo.state === 2 ? "text-green-600 dark:text-green-400" :
                        certInfo.state !== null && certInfo.state < 0 ? "text-red-600 dark:text-red-400" :
                          "text-amber-600 dark:text-amber-400"
                        }`}>
                        {certInfo.state !== null
                          ? (CERT_STATE_LABELS[certInfo.state] ?? `State ${certInfo.state}`)
                          : "—"}
                      </span>
                    ),
                  },
                  {
                    label: "Protocol",
                    value: <span className="font-mono">{certInfo.protocol ?? "—"}</span>,
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-vc-raised border border-vc-border rounded-lg px-3 py-2">
                    <div className="text-vc-subtle uppercase text-[10px] mb-0.5">{label}</div>
                    <div className="text-vc-text">{value}</div>
                  </div>
                ))}
              </div>

              {/* Signature verification status */}
              {certInfo.signatureVerified ? (
                <div className="flex items-center gap-2.5 bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30 rounded-lg px-4 py-3">
                  <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">Signature verified</p>
                    <p className="text-xs text-green-600/80 dark:text-green-500/80">Mutual challenge-response completed — both parties signed</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg px-4 py-3">
                  <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Signature not verified</p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-500/80">Handshake incomplete or failed</p>
                  </div>
                </div>
              )}

              {/* DIDs */}
              <div className="space-y-2">
                <p className="text-xs text-vc-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Key size={11} /> Signing parties
                </p>
                {[
                  { label: "pk1 — Control plane", did: certInfo.pk1Did },
                  { label: "pk2 — Agent", did: certInfo.pk2Did },
                ].map(({ label, did }) => (
                  <div key={label} className="bg-vc-raised border border-vc-border rounded-lg px-3 py-2 text-xs space-y-0.5">
                    <div className="text-vc-subtle uppercase text-[10px]">{label}</div>
                    <code className="font-mono text-vc-text-2 text-[11px] break-all">{did ?? "—"}</code>
                  </div>
                ))}
              </div>

              {/* Signed payload */}
              {certInfo.signedPayload && (
                <div className="space-y-1.5">
                  <p className="text-xs text-vc-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Key size={11} /> Signed payload
                  </p>
                  <pre className="bg-vc-bg border border-vc-border rounded-lg p-3 text-[11px] font-mono text-vc-text-2 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-40">
                    {certInfo.signedPayload}
                  </pre>
                </div>
              )}

              {/* Capabilities in cert */}
              {certInfo.capabilities && certInfo.capabilities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-vc-muted uppercase tracking-wider">Capabilities in certificate</p>
                  <div className="flex flex-wrap gap-1.5">
                    {certInfo.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-xs"
                      >
                        {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                        {cap.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resource limits in cert */}
              {certInfo.resourceLimits && (
                <div className="space-y-2">
                  <p className="text-xs text-vc-muted uppercase tracking-wider">Resource limits in certificate</p>
                  <div className="bg-vc-raised border border-vc-border rounded-lg divide-y divide-vc-border text-xs">
                    {certInfo.resourceLimits.maxTokensPerDay != null && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-vc-muted">Max tokens/day</span>
                        <span className="font-mono text-vc-text">{certInfo.resourceLimits.maxTokensPerDay.toLocaleString()}</span>
                      </div>
                    )}
                    {certInfo.resourceLimits.maxRequestsPerHour != null && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-vc-muted">Max requests/hour</span>
                        <span className="font-mono text-vc-text">{certInfo.resourceLimits.maxRequestsPerHour}</span>
                      </div>
                    )}
                    {certInfo.resourceLimits.allowedDomains && certInfo.resourceLimits.allowedDomains.length > 0 && (
                      <div className="flex justify-between px-3 py-2 gap-4">
                        <span className="text-vc-muted shrink-0">Allowed domains</span>
                        <span className="font-mono text-vc-text text-right break-all">{certInfo.resourceLimits.allowedDomains.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Policy reference */}
              {certInfo.policyId && (
                <div className="space-y-2">
                  <p className="text-xs text-vc-muted uppercase tracking-wider">Policy reference</p>
                  <div className="bg-vc-raised border border-vc-border rounded-lg divide-y divide-vc-border text-xs">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-vc-muted">Policy ID</span>
                      <code className="font-mono text-vc-text text-[11px]">{certInfo.policyId}</code>
                    </div>
                    {certInfo.policyExpiresAt && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-vc-muted">Expires at</span>
                        <span className={`font-mono text-[11px] ${new Date(certInfo.policyExpiresAt) < new Date()
                          ? "text-red-600 dark:text-red-400"
                          : "text-vc-text"
                          }`}>
                          {formatDate(certInfo.policyExpiresAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cert error */}
              {certInfo.error && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} />
                  <span>Cert error: {certInfo.error}</span>
                </div>
              )}

              {/* Raw metadata (collapsible) */}
              {certInfo.rawMetadata !== null && (
                <JsonBlock value={certInfo.rawMetadata} label="Raw certificate metadata" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
