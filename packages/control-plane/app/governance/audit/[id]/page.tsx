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
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
        className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground transition-colors"
      >
        <span
          className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
        >
          ▾
        </span>
        {label}
      </button>
      {!collapsed && (
        <pre className="bg-background border border-neutral-200 rounded-lg p-4 text-xs font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
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
        const res = await fetch(
          `/api/governance/audit/${encodeURIComponent(id)}`
        );
        if (res.status === 404) {
          setError("Entry not found");
          return;
        }
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
      <div className="p-6 w-full max-w-4xl mx-auto flex items-center gap-2 text-foreground-500">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="p-6 w-full max-w-7xl mx-auto space-y-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-400"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg px-4 py-3 text-danger-600 dark:text-danger-400 text-sm">
          {error ?? "Entry not found"}
        </div>
      </div>
    );
  }

  const isActivity = entry.source === "activity";
  const isAuth = [
    "agent_authenticated",
    "auth_failed",
    "registration_approved",
  ].includes(entry.event);

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push("/governance?tab=audit")}
        className="flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-400 transition-colors"
      >
        <ChevronLeft size={16} /> Audit Log
      </button>

      {/* Header card */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div
            className={`p-2.5 rounded-lg border flex-shrink-0 ${
              isActivity
                ? "bg-primary-100 dark:bg-primary-500/10 border-primary-300 dark:border-primary-500/20 text-primary-600 dark:text-primary-400"
                : "bg-secondary-100 dark:bg-secondary-500/10 border-secondary-300 dark:border-secondary-500/20 text-secondary-600 dark:text-secondary-400"
            }`}
          >
            {isActivity ? <Activity size={18} /> : <FileText size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-base font-semibold text-foreground">
                {ACTIVITY_LABELS[entry.event] ?? entry.event.replace(/_/g, " ")}
              </h1>
              {/* Source badge */}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                  isActivity
                    ? "bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-500/25"
                    : "bg-secondary-100 dark:bg-secondary-500/15 text-secondary-700 dark:text-secondary-400 border-secondary-300 dark:border-secondary-500/25"
                }`}
              >
                {entry.source}
              </span>
              {/* Status badge */}
              {entry.status === "success" && (
                <span className="flex items-center gap-1 text-xs text-success-700 dark:text-success-400">
                  <CheckCircle2 size={12} /> success
                </span>
              )}
              {entry.status === "failed" && (
                <span className="flex items-center gap-1 text-xs text-danger-600 dark:text-danger-400">
                  <XCircle size={12} /> failed
                </span>
              )}
              {entry.status &&
                entry.status !== "success" &&
                entry.status !== "failed" && (
                  <span className="flex items-center gap-1 text-xs text-warning-600 dark:text-warning-400">
                    <Clock size={12} /> {entry.status}
                  </span>
                )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-500">
              <span className="flex items-center gap-1">
                <Clock size={11} /> {formatDate(entry.timestamp)}
              </span>
              {entry.agentDid && (
                <span
                  className="flex items-center gap-1 cursor-pointer hover:text-primary-500 transition-colors"
                  title={entry.agentDid}
                  onClick={() =>
                    router.push(
                      `/agents/${encodeURIComponent(entry.agentDid!)}`
                    )
                  }
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
            <p className="text-[10px] font-mono text-foreground-400 mt-1.5">
              {entry.id}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {entry.error && (
        <div className="flex items-start gap-2 bg-danger-500/10 border border-danger-500/20 rounded-xl px-4 py-3 text-sm text-danger-600 dark:text-danger-400">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-mono text-xs break-all">{entry.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Payload ─────────────────────────────────────────────────────── */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText size={14} className="text-foreground-500" /> Payload
          </h2>

          {/* Intent timing */}
          {!isActivity && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: "Sent at", value: formatDate(entry.sentAt) },
                {
                  label: "Completed at",
                  value: entry.completedAt
                    ? formatDate(entry.completedAt)
                    : "—",
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="bg-background-200 border border-neutral-200 rounded-lg px-3 py-2"
                >
                  <div className="text-foreground-400 uppercase text-[10px] mb-0.5">
                    {label}
                  </div>
                  <div className="text-foreground">{value}</div>
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
              <p className="text-xs text-foreground-500 mb-1.5">Raw details</p>
              <pre className="bg-background border border-neutral-200 rounded-lg p-3 text-xs font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all">
                {entry.details}
              </pre>
            </div>
          )}

          {/* Output */}
          {entry.output !== null && (
            <JsonBlock value={entry.output} label="Output" />
          )}

          {!entry.params && !entry.details && !entry.output && (
            <p className="text-xs text-foreground-400 italic">
              No payload data recorded for this event.
            </p>
          )}
        </div>

        {/* ── Certificate & crypto verification ────────────────────────────── */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck size={14} className="text-foreground-500" />{" "}
            Certificate & Cryptographic State
          </h2>

          {!certInfo ? (
            <div className="text-xs text-foreground-400 italic py-4 text-center">
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
                      <span
                        className={`font-semibold ${
                          certInfo.state === 2
                            ? "text-success-600 dark:text-success-400"
                            : certInfo.state !== null && certInfo.state < 0
                              ? "text-danger-600 dark:text-danger-400"
                              : "text-warning-600 dark:text-warning-400"
                        }`}
                      >
                        {certInfo.state !== null
                          ? (CERT_STATE_LABELS[certInfo.state] ??
                            `State ${certInfo.state}`)
                          : "—"}
                      </span>
                    ),
                  },
                  {
                    label: "Protocol",
                    value: (
                      <span className="font-mono">
                        {certInfo.protocol ?? "—"}
                      </span>
                    ),
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-background-200 border border-neutral-200 rounded-lg px-3 py-2"
                  >
                    <div className="text-foreground-400 uppercase text-[10px] mb-0.5">
                      {label}
                    </div>
                    <div className="text-foreground">{value}</div>
                  </div>
                ))}
              </div>

              {/* Signature verification status */}
              {certInfo.signatureVerified ? (
                <div className="flex items-center gap-2.5 bg-success-50 dark:bg-success-500/10 border border-success-300 dark:border-success-500/30 rounded-lg px-4 py-3">
                  <CheckCircle2
                    size={16}
                    className="text-success-600 dark:text-success-400 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold text-success-700 dark:text-success-400">
                      Signature verified
                    </p>
                    <p className="text-xs text-success-600/80 dark:text-success-500/80">
                      Mutual challenge-response completed — both parties signed
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 bg-warning-50 dark:bg-warning-500/10 border border-warning-300 dark:border-warning-500/30 rounded-lg px-4 py-3">
                  <AlertTriangle
                    size={16}
                    className="text-warning-600 dark:text-warning-400 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold text-warning-700 dark:text-warning-400">
                      Signature not verified
                    </p>
                    <p className="text-xs text-warning-600/80 dark:text-warning-500/80">
                      Handshake incomplete or failed
                    </p>
                  </div>
                </div>
              )}

              {/* DIDs */}
              <div className="space-y-2">
                <p className="text-xs text-foreground-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Key size={11} /> Signing parties
                </p>
                {[
                  { label: "pk1 — Control plane", did: certInfo.pk1Did },
                  { label: "pk2 — Agent", did: certInfo.pk2Did },
                ].map(({ label, did }) => (
                  <div
                    key={label}
                    className="bg-background-200 border border-neutral-200 rounded-lg px-3 py-2 text-xs space-y-0.5"
                  >
                    <div className="text-foreground-400 uppercase text-[10px]">
                      {label}
                    </div>
                    <code className="font-mono text-foreground-700 text-[11px] break-all">
                      {did ?? "—"}
                    </code>
                  </div>
                ))}
              </div>

              {/* Signed payload */}
              {certInfo.signedPayload && (
                <div className="space-y-1.5">
                  <p className="text-xs text-foreground-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Key size={11} /> Signed payload
                  </p>
                  <pre className="bg-background border border-neutral-200 rounded-lg p-3 text-[11px] font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-40">
                    {certInfo.signedPayload}
                  </pre>
                </div>
              )}

              {/* Capabilities in cert */}
              {certInfo.capabilities && certInfo.capabilities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-foreground-500 uppercase tracking-wider">
                    Capabilities in certificate
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {certInfo.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="flex items-center gap-1 bg-primary-100 dark:bg-primary-900/40 border border-primary-300 dark:border-primary-700/40 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded text-xs"
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
                  <p className="text-xs text-foreground-500 uppercase tracking-wider">
                    Resource limits in certificate
                  </p>
                  <div className="bg-background-200 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-xs">
                    {certInfo.resourceLimits.maxTokensPerDay != null && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-foreground-500">
                          Max tokens/day
                        </span>
                        <span className="font-mono text-foreground">
                          {certInfo.resourceLimits.maxTokensPerDay.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {certInfo.resourceLimits.maxRequestsPerHour != null && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-foreground-500">
                          Max requests/hour
                        </span>
                        <span className="font-mono text-foreground">
                          {certInfo.resourceLimits.maxRequestsPerHour}
                        </span>
                      </div>
                    )}
                    {certInfo.resourceLimits.allowedDomains &&
                      certInfo.resourceLimits.allowedDomains.length > 0 && (
                        <div className="flex justify-between px-3 py-2 gap-4">
                          <span className="text-foreground-500 shrink-0">
                            Allowed domains
                          </span>
                          <span className="font-mono text-foreground text-right break-all">
                            {certInfo.resourceLimits.allowedDomains.join(", ")}
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Policy reference */}
              {certInfo.policyId && (
                <div className="space-y-2">
                  <p className="text-xs text-foreground-500 uppercase tracking-wider">
                    Policy reference
                  </p>
                  <div className="bg-background-200 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-xs">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-foreground-500">Policy ID</span>
                      <code className="font-mono text-foreground text-[11px]">
                        {certInfo.policyId}
                      </code>
                    </div>
                    {certInfo.policyExpiresAt && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-foreground-500">Expires at</span>
                        <span
                          className={`font-mono text-[11px] ${
                            new Date(certInfo.policyExpiresAt) < new Date()
                              ? "text-danger-600 dark:text-danger-400"
                              : "text-foreground"
                          }`}
                        >
                          {formatDate(certInfo.policyExpiresAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cert error */}
              {certInfo.error && (
                <div className="flex items-center gap-2 text-xs text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} />
                  <span>Cert error: {certInfo.error}</span>
                </div>
              )}

              {/* Raw metadata (collapsible) */}
              {certInfo.rawMetadata !== null && (
                <JsonBlock
                  value={certInfo.rawMetadata}
                  label="Raw certificate metadata"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
