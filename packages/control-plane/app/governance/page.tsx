"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  FileText,
  Activity,
  Trash2,
  Plus,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  Zap,
  RefreshCw,
  Gauge,
  BookOpen,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface GovernanceSummary {
  agents: {
    total: number;
    uncovered: number;
    highRisk: number;
    highRiskList: { did: string; riskyCaps: string[] }[];
  };
  intents: {
    total: number;
    failed: number;
    pending: number;
    successRate: number;
  };
  approvals: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    approvalRate: number | null;
  };
  policies: { active: number; expired: number };
  budgets: { agentsOverDailyBudget: number; agentsOverMonthlyBudget: number };
}

interface Policy {
  id: string;
  agentDid: string | null;
  realmId: string | null;
  capabilities: string[];
  resourceLimits: {
    maxTokensPerDay?: number;
    maxRequestsPerHour?: number;
    allowedDomains?: string[];
  } | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface AgentBudget {
  did: string;
  name: string;
  capabilities: string[];
  tokenBudgetDaily: number | null;
  tokenBudgetMonthly: number | null;
  todayTokens: number;
  monthTokens: number;
}

interface AuditEntry {
  id: string;
  source: "activity" | "intent";
  event: string;
  agentDid: string | null;
  agentName: string | null;
  details: string | null;
  status: string | null;
  error: string | null;
  timestamp: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={13} />,
  internet_access: <Globe size={13} />,
  browser_control: <Monitor size={13} />,
  api_call: <Plug size={13} />,
  mail_send: <Mail size={13} />,
  code_execution: <Code size={13} />,
  system_command: <Terminal size={13} />,
  knowledge_search: <BookOpen size={13} />,
};

const ALL_CAPABILITIES = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "agent_communication",
  "knowledge_search",
];

const HIGH_RISK_CAPS = new Set([
  "system_command",
  "code_execution",
  "browser_control",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortDid(did: string) {
  if (did.length <= 20) return did;
  return `${did.slice(0, 10)}…${did.slice(-6)}`;
}

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = parseUTC(iso);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Never";
  const date = parseUTC(iso);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneClasses = {
    ok: "text-success-500",
    warn: "text-warning-500",
    danger: "text-danger-500",
    neutral: "text-primary-700",
  }[tone ?? "neutral"];

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
          {label}
        </span>
        <span className={toneClasses}>{icon}</span>
      </div>
      <p className={`text-2xl font-semibold ${toneClasses}`}>{value}</p>
      {sub && <p className="text-xs text-foreground-500">{sub}</p>}
    </div>
  );
}

// ── Cap pill ──────────────────────────────────────────────────────────────────

function CapPill({ cap, risky }: { cap: string; risky?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-normal
 ${
   risky
     ? "bg-danger-50 text-danger-600 border-danger-200"
     : "bg-background-200 text-foreground-400 border-neutral-200"
 }`}
    >
      {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
      {cap.replace(/_/g, " ")}
    </span>
  );
}

// ── Budget bar ────────────────────────────────────────────────────────────────

function BudgetBar({
  used,
  budget,
  label,
}: {
  used: number;
  budget: number;
  label: string;
}) {
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const tone =
    pct >= 100
      ? "bg-danger-500"
      : pct >= 80
        ? "bg-warning-500"
        : "bg-primary-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-foreground-500">
        <span>{label}</span>
        <span>
          {fmtNum(used)} / {fmtNum(budget)} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${tone} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({
  summary,
  loading,
}: {
  summary: GovernanceSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!summary) return null;

  const { agents, intents, approvals, policies, budgets } = summary;
  const posture =
    agents.uncovered === 0 &&
    agents.highRisk === 0 &&
    budgets.agentsOverDailyBudget === 0 &&
    intents.successRate >= 90
      ? "ok"
      : agents.highRisk > 0 ||
          budgets.agentsOverDailyBudget > 0 ||
          intents.successRate < 70
        ? "danger"
        : "warn";

  const postureLabel =
    posture === "ok"
      ? "Good"
      : posture === "warn"
        ? "Needs attention"
        : "Action required";
  const PostureIcon =
    posture === "ok"
      ? ShieldCheck
      : posture === "warn"
        ? ShieldAlert
        : ShieldOff;

  return (
    <div className="space-y-6">
      {/* Posture banner */}
      <div
        className={`flex items-center gap-3 rounded-xl border p-4
 ${
   posture === "ok"
     ? "bg-success-50 border-success-500/30 text-success-700"
     : posture === "warn"
       ? "bg-warning-50 border-warning-200 text-warning-700"
       : "bg-danger-50 border-danger-200 text-danger-600"
 }`}
      >
        <PostureIcon className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-semibold text-sm">
            Overall posture: {postureLabel}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {agents.uncovered} uncovered agent
            {agents.uncovered !== 1 ? "s" : ""} · {agents.highRisk} high-risk ·{" "}
            {policies.active} active polic{policies.active !== 1 ? "ies" : "y"}{" "}
            · {intents.successRate}% intent success rate
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<Bot className="w-4 h-4" />}
          label="Locked agents"
          value={agents.uncovered}
          sub={`of ${agents.total} total`}
          tone={agents.uncovered === 0 ? "ok" : "warn"}
        />
        <StatCard
          icon={<ShieldAlert className="w-4 h-4" />}
          label="High-risk agents"
          value={agents.highRisk}
          sub="system_cmd / code / browser"
          tone={agents.highRisk === 0 ? "ok" : "danger"}
        />
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label="Active policies"
          value={policies.active}
          sub={
            policies.expired > 0
              ? `${policies.expired} expired`
              : "none expired"
          }
          tone="neutral"
        />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Intent success (30d)"
          value={`${intents.successRate}%`}
          sub={`${intents.failed} failed, ${intents.pending} pending`}
          tone={
            intents.successRate >= 90
              ? "ok"
              : intents.successRate >= 70
                ? "warn"
                : "danger"
          }
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Approval rate"
          value={
            approvals.approvalRate !== null ? `${approvals.approvalRate}%` : "—"
          }
          sub={`${approvals.pending} pending approval${approvals.pending !== 1 ? "s" : ""}`}
          tone={
            approvals.approvalRate === null
              ? "neutral"
              : approvals.approvalRate >= 80
                ? "ok"
                : "warn"
          }
        />
      </div>

      {/* Budget alerts */}
      {(budgets.agentsOverDailyBudget > 0 ||
        budgets.agentsOverMonthlyBudget > 0) && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 space-y-1">
          <p className="text-danger-600 font-semibold text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Budget violations
          </p>
          {budgets.agentsOverDailyBudget > 0 && (
            <p className="text-xs text-danger-700">
              {budgets.agentsOverDailyBudget} agent
              {budgets.agentsOverDailyBudget !== 1 ? "s" : ""} exceeded daily
              token budget
            </p>
          )}
          {budgets.agentsOverMonthlyBudget > 0 && (
            <p className="text-xs text-danger-700">
              {budgets.agentsOverMonthlyBudget} agent
              {budgets.agentsOverMonthlyBudget !== 1 ? "s" : ""} exceeded
              monthly token budget
            </p>
          )}
        </div>
      )}

      {/* High-risk agents */}
      {agents.highRiskList.length > 0 && (
        <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-700" /> High-risk
              agents
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-foreground-400 uppercase tracking-wider">
                <th className="px-4 py-2 text-left">DID</th>
                <th className="px-4 py-2 text-left">Risky capabilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {agents.highRiskList.map((a) => (
                <tr
                  key={a.did}
                  className="hover:bg-background-200/40 transition-colors"
                >
                  <td
                    className="px-4 py-2.5 font-mono text-xs text-foreground-500"
                    title={a.did}
                  >
                    {shortDid(a.did)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {a.riskyCaps.map((c) => (
                        <CapPill key={c} cap={c} risky />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return a datetime-local string N days from now (local time). */
function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  // datetime-local expects "YYYY-MM-DDTHH:MM" in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Given an original expiry, suggest the same duration from now (min 1 day). */
function suggestRenewalExpiry(originalExpiresAt: string | null): string {
  if (originalExpiresAt) {
    const orig = parseUTC(originalExpiresAt);
    const durationMs = orig.getTime() - Date.now();
    const days = Math.max(1, Math.round(durationMs / 86_400_000));
    return daysFromNow(days);
  }
  return daysFromNow(30);
}

// ── Renew policy modal ────────────────────────────────────────────────────────

function RenewPolicyModal({
  policy,
  agentName,
  onClose,
  onRenewed,
}: {
  policy: Policy;
  agentName: string | undefined;
  onClose: () => void;
  onRenewed: () => void;
}) {
  const [newExpiry, setNewExpiry] = useState(() =>
    suggestRenewalExpiry(policy.expiresAt)
  );
  const [revokeOriginal, setRevokeOriginal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRenew = async () => {
    setSaving(true);
    setError(null);
    try {
      const resourceLimits =
        policy.resourceLimits && Object.keys(policy.resourceLimits).length > 0
          ? policy.resourceLimits
          : undefined;

      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: policy.agentDid,
          realmId: policy.realmId,
          capabilities: policy.capabilities,
          resourceLimits,
          expiresAt: newExpiry ? new Date(newExpiry).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? "Failed to create renewed policy");
        return;
      }

      if (revokeOriginal) {
        await fetch(`/api/policies/${policy.id}`, { method: "DELETE" });
      }

      onRenewed();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2 text-foreground">
            <RotateCcw className="w-4 h-4 text-primary-500" />
            <h2 className="font-semibold text-sm">Renew policy</h2>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-400 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-background-200"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Policy summary (read-only) */}
          <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400">Agent</span>
              <span className="text-xs font-medium text-foreground">
                {agentName ??
                  (policy.agentDid ? (
                    shortDid(policy.agentDid)
                  ) : (
                    <span className="italic">global</span>
                  ))}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs text-foreground-400 shrink-0">
                Capabilities
              </span>
              <div className="flex flex-wrap gap-1 justify-end">
                {policy.capabilities.map((c) => (
                  <CapPill key={c} cap={c} risky={HIGH_RISK_CAPS.has(c)} />
                ))}
              </div>
            </div>
            {policy.resourceLimits &&
              (policy.resourceLimits.maxTokensPerDay ||
                policy.resourceLimits.maxRequestsPerHour) && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground-400">Limits</span>
                  <span className="text-xs text-foreground-500">
                    {policy.resourceLimits.maxTokensPerDay
                      ? `${fmtNum(policy.resourceLimits.maxTokensPerDay)} tok/d`
                      : ""}
                    {policy.resourceLimits.maxTokensPerDay &&
                    policy.resourceLimits.maxRequestsPerHour
                      ? " · "
                      : ""}
                    {policy.resourceLimits.maxRequestsPerHour
                      ? `${policy.resourceLimits.maxRequestsPerHour} req/h`
                      : ""}
                  </span>
                </div>
              )}
            {policy.expiresAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-400">
                  Original expiry
                </span>
                <span className="text-xs text-warning-600">
                  {new Date(
                    policy.expiresAt.endsWith("Z")
                      ? policy.expiresAt
                      : policy.expiresAt + "Z"
                  ).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* New expiry picker */}
          <div className="space-y-1.5">
            <label className="text-xs text-foreground-500 font-medium">
              New expiry date
            </label>
            <input
              type="datetime-local"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-2 mt-1">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNewExpiry(daysFromNow(d))}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600:text-primary-400 hover:border-primary-400:border-primary-500 transition-colors"
                >
                  +{d}d
                </button>
              ))}
            </div>
          </div>

          {/* Revoke original checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={revokeOriginal}
              onChange={(e) => setRevokeOriginal(e.target.checked)}
              className="w-4 h-4 rounded accent-primary-600"
            />
            <span className="text-xs text-foreground-500 group-hover:text-foreground transition-colors">
              Revoke original policy after renewal
            </span>
          </label>

          {error && <p className="text-xs text-danger-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRenew}
            disabled={saving || !newExpiry}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
            Renew policy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Policies ─────────────────────────────────────────────────────────────

function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [agents, setAgents] = useState<
    { id: string; name: string; capabilities: string[] }[]
  >([]);
  const [budgets, setBudgets] = useState<AgentBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [renewPolicy, setRenewPolicy] = useState<Policy | null>(null);
  const [savingBudget, setSavingBudget] = useState<string | null>(null);

  // New policy form state
  const [form, setForm] = useState<{
    agentDid: string;
    capabilities: string[];
    maxTokensPerDay: string;
    maxRequestsPerHour: string;
    expiresAt: string;
  }>({
    agentDid: "",
    capabilities: [],
    maxTokensPerDay: "",
    maxRequestsPerHour: "",
    expiresAt: "",
  });

  // Budget edit state: did -> { daily, monthly }
  const [budgetEdits, setBudgetEdits] = useState<
    Record<string, { daily: string; monthly: string }>
  >({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [polRes, agentRes] = await Promise.all([
        fetch("/api/policies?includeExpired=false"),
        fetch("/api/agents?pageSize=100"),
      ]);
      if (polRes.ok) {
        const d = (await polRes.json()) as { policies: Policy[] };
        setPolicies(d.policies);
      }
      if (agentRes.ok) {
        const d = (await agentRes.json()) as {
          agents: {
            id: string;
            name: string;
            capabilities: string[];
            tokenUsage?: { promptTokens: number; completionTokens: number };
          }[];
        };
        setAgents(
          d.agents.map((a) => ({
            id: a.id,
            name: a.name,
            capabilities: a.capabilities,
          }))
        );

        // Fetch budgets from agent details
        const budgetList: AgentBudget[] = await Promise.all(
          d.agents.slice(0, 50).map(async (a) => {
            try {
              const r = await fetch(`/api/agents/${encodeURIComponent(a.id)}`);
              if (!r.ok) return null;
              const ad = (await r.json()) as {
                tokenBudgetDaily?: number | null;
                tokenBudgetMonthly?: number | null;
                todayTokens?: number;
                monthTokens?: number;
              };
              return {
                did: a.id,
                name: a.name,
                capabilities: a.capabilities,
                tokenBudgetDaily: ad.tokenBudgetDaily ?? null,
                tokenBudgetMonthly: ad.tokenBudgetMonthly ?? null,
                todayTokens: ad.todayTokens ?? 0,
                monthTokens: ad.monthTokens ?? 0,
              } as AgentBudget;
            } catch {
              return null;
            }
          })
        ).then((r) => r.filter(Boolean) as AgentBudget[]);
        setBudgets(budgetList);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreate = async () => {
    if (!form.agentDid || form.capabilities.length === 0) return;
    setCreating(true);
    try {
      const resourceLimits: Record<string, unknown> = {};
      if (form.maxTokensPerDay)
        resourceLimits.maxTokensPerDay = parseInt(form.maxTokensPerDay);
      if (form.maxRequestsPerHour)
        resourceLimits.maxRequestsPerHour = parseInt(form.maxRequestsPerHour);

      await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: form.agentDid,
          capabilities: form.capabilities,
          resourceLimits:
            Object.keys(resourceLimits).length > 0 ? resourceLimits : undefined,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : undefined,
        }),
      });
      setForm({
        agentDid: "",
        capabilities: [],
        maxTokensPerDay: "",
        maxRequestsPerHour: "",
        expiresAt: "",
      });
      await fetchAll();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/policies/${id}`, { method: "DELETE" });
      await fetchAll();
    } finally {
      setRevoking(null);
    }
  };

  const handleSaveBudget = async (did: string) => {
    const edit = budgetEdits[did];
    if (!edit) return;
    setSavingBudget(did);
    try {
      const daily = edit.daily === "" ? null : parseInt(edit.daily);
      const monthly = edit.monthly === "" ? null : parseInt(edit.monthly);
      await fetch(`/api/agents/${encodeURIComponent(did)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenBudgetDaily: isNaN(daily as number) ? null : daily,
          tokenBudgetMonthly: isNaN(monthly as number) ? null : monthly,
        }),
      });
      setBudgetEdits((prev) => {
        const n = { ...prev };
        delete n[did];
        return n;
      });
      await fetchAll();
    } finally {
      setSavingBudget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const coveredDids = new Set(policies.map((p) => p.agentDid).filter(Boolean));

  return (
    <div className="space-y-8">
      {/* Create policy form */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary-700" /> New policy
          </h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Agent selector */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-500">Target agent</label>
            <select
              value={form.agentDid}
              onChange={(e) =>
                setForm((f) => ({ ...f, agentDid: e.target.value }))
              }
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({shortDid(a.id)})
                </option>
              ))}
            </select>
          </div>

          {/* Capabilities */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-500">
              Allowed capabilities
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => (
                <label
                  key={cap}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.capabilities.includes(cap)}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        capabilities: e.target.checked
                          ? [...f.capabilities, cap]
                          : f.capabilities.filter((c) => c !== cap),
                      }));
                    }}
                    className="w-3.5 h-3.5 rounded"
                  />
                  <CapPill cap={cap} risky={HIGH_RISK_CAPS.has(cap)} />
                </label>
              ))}
            </div>
          </div>

          {/* Resource limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-foreground-500">
                Max tokens/day (optional)
              </label>
              <input
                type="number"
                value={form.maxTokensPerDay}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxTokensPerDay: e.target.value }))
                }
                placeholder="e.g. 100000"
                className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-foreground-500">
                Max requests/hour (optional)
              </label>
              <input
                type="number"
                value={form.maxRequestsPerHour}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxRequestsPerHour: e.target.value }))
                }
                placeholder="e.g. 60"
                className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Expiry */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-500">
              Expires at (optional)
            </label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, expiresAt: e.target.value }))
              }
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={
              creating || !form.agentDid || form.capabilities.length === 0
            }
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {creating ? (
              <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Create policy
          </button>
        </div>
      </div>

      {/* Active policies list */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Active policies ({policies.length})
          </h3>
        </div>
        {policies.length === 0 ? (
          <div className="px-4 py-10 text-center text-foreground-500 text-sm">
            No active policies. All agents are currently locked.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-foreground-400 uppercase tracking-wider">
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Capabilities</th>
                <th className="px-4 py-2 text-left">Limits</th>
                <th className="px-4 py-2 text-left">Expires</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {policies.map((p) => {
                const agentName = agents.find((a) => a.id === p.agentDid)?.name;
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-background-200/40 transition-colors"
                  >
                    <td
                      className="px-4 py-2.5 font-mono text-xs text-foreground-500"
                      title={p.agentDid ?? ""}
                    >
                      {agentName ??
                        (p.agentDid ? (
                          shortDid(p.agentDid)
                        ) : (
                          <span className="italic">global</span>
                        ))}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {p.capabilities.map((c) => (
                          <CapPill
                            key={c}
                            cap={c}
                            risky={HIGH_RISK_CAPS.has(c)}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {p.resourceLimits ? (
                        <span>
                          {p.resourceLimits.maxTokensPerDay
                            ? `${fmtNum(p.resourceLimits.maxTokensPerDay)} tok/d`
                            : ""}
                          {p.resourceLimits.maxRequestsPerHour
                            ? ` · ${p.resourceLimits.maxRequestsPerHour} req/h`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-foreground-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {formatExpiry(p.expiresAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {timeAgo(p.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setRenewPolicy(p)}
                          className="p-1.5 rounded-lg text-foreground-400 hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                          title="Renew policy"
                        >
                          <RotateCcw size={13} />
                        </button>
                        <button
                          onClick={() => handleRevoke(p.id)}
                          disabled={revoking === p.id}
                          className="p-1.5 rounded-lg text-foreground-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors disabled:opacity-40"
                          title="Revoke policy"
                        >
                          {revoking === p.id ? (
                            <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Uncovered agents */}
      {agents.filter((a) => !coveredDids.has(a.id)).length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-warning-500/20">
            <h3 className="text-sm font-semibold text-warning-700 flex items-center gap-2">
              <ShieldOff className="w-4 h-4" /> Locked agents — no active policy
            </h3>
          </div>
          <div className="divide-y divide-warning-500/10">
            {agents
              .filter((a) => !coveredDids.has(a.id))
              .map((a) => (
                <div
                  key={a.id}
                  className="px-4 py-2.5 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      {a.name}
                    </p>
                    <p className="text-xs font-mono text-foreground-500">
                      {shortDid(a.id)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {a.capabilities.map((c) => (
                      <CapPill key={c} cap={c} risky={HIGH_RISK_CAPS.has(c)} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Renew policy modal */}
      {renewPolicy && (
        <RenewPolicyModal
          policy={renewPolicy}
          agentName={agents.find((a) => a.id === renewPolicy.agentDid)?.name}
          onClose={() => setRenewPolicy(null)}
          onRenewed={fetchAll}
        />
      )}

      {/* Token budgets */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary-700" /> Token budgets per
            agent
          </h3>
        </div>
        {budgets.length === 0 ? (
          <div className="px-4 py-8 text-center text-foreground-500 text-sm">
            No agents found.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {budgets.map((b) => {
              const edit = budgetEdits[b.did];
              const dailyVal =
                edit?.daily ??
                (b.tokenBudgetDaily !== null ? String(b.tokenBudgetDaily) : "");
              const monthlyVal =
                edit?.monthly ??
                (b.tokenBudgetMonthly !== null
                  ? String(b.tokenBudgetMonthly)
                  : "");
              const dirty = edit !== undefined;

              return (
                <div key={b.did} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {b.name}
                      </p>
                      <p className="text-xs font-mono text-foreground-500">
                        {shortDid(b.did)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-foreground-400">
                          Daily
                        </label>
                        <input
                          type="number"
                          value={dailyVal}
                          placeholder="Unlimited"
                          onChange={(e) =>
                            setBudgetEdits((prev) => ({
                              ...prev,
                              [b.did]: {
                                daily: e.target.value,
                                monthly: prev[b.did]?.monthly ?? monthlyVal,
                              },
                            }))
                          }
                          className="w-28 px-2 py-1 text-xs bg-background-200 border border-neutral-200 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-foreground-400">
                          Monthly
                        </label>
                        <input
                          type="number"
                          value={monthlyVal}
                          placeholder="Unlimited"
                          onChange={(e) =>
                            setBudgetEdits((prev) => ({
                              ...prev,
                              [b.did]: {
                                daily: prev[b.did]?.daily ?? dailyVal,
                                monthly: e.target.value,
                              },
                            }))
                          }
                          className="w-28 px-2 py-1 text-xs bg-background-200 border border-neutral-200 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      {dirty && (
                        <button
                          onClick={() => handleSaveBudget(b.did)}
                          disabled={savingBudget === b.did}
                          className="px-2.5 py-1 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-500 disabled:opacity-40 transition-colors"
                        >
                          {savingBudget === b.did ? "Saving…" : "Save"}
                        </button>
                      )}
                    </div>
                  </div>
                  {b.tokenBudgetDaily !== null && b.todayTokens > 0 && (
                    <BudgetBar
                      used={b.todayTokens}
                      budget={b.tokenBudgetDaily}
                      label="Today"
                    />
                  )}
                  {b.tokenBudgetMonthly !== null && b.monthTokens > 0 && (
                    <BudgetBar
                      used={b.monthTokens}
                      budget={b.tokenBudgetMonthly}
                      label="This month"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Audit Log ────────────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  agent_reconnected: "Agent reconnected",
  registration_requested: "Registration requested",
  registration_approved: "Registration approved",
  registration_rejected: "Registration rejected",
  agent_disconnected: "Agent disconnected",
  capabilities_updated: "Capabilities updated",
  auth_failed: "Auth failed",
  user_authenticated: "User authenticated",
};

function AuditTab() {
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<"" | "activity" | "intent">(
    ""
  );
  const [statusFilter, setStatusFilter] = useState<
    "" | "success" | "failed" | "pending"
  >("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ limit: "300" });
      if (sourceFilter) sp.set("source", sourceFilter);
      if (statusFilter) sp.set("status", statusFilter);
      const res = await fetch(`/api/governance/audit?${sp}`);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: AuditEntry[] };
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, statusFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paginated = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sourceBadge = (source: "activity" | "intent") =>
    source === "activity" ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border bg-primary-100 text-primary-700 border-primary-300">
        activity
      </span>
    ) : (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border bg-secondary-100 text-secondary-700 border-secondary-300">
        intent
      </span>
    );

  const statusBadge = (status: string | null) => {
    if (!status) return null;
    if (status === "success")
      return (
        <span className="flex items-center gap-1 text-success-700 text-xs">
          <CheckCircle2 size={11} /> success
        </span>
      );
    if (status === "failed")
      return (
        <span className="flex items-center gap-1 text-danger-600 text-xs">
          <XCircle size={11} /> failed
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-warning-600 text-xs">
        <Clock size={11} /> {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value as typeof sourceFilter);
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All sources</option>
          <option value="activity">Activity log</option>
          <option value="intent">Intent log</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <button
          onClick={fetchEntries}
          className="p-2 rounded-lg border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <span className="text-xs text-foreground-400 ml-auto">
          {entries.length} entries · click a row for details
        </span>
      </div>

      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="px-4 py-12 text-center text-foreground-500 text-sm">
            No audit entries found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs text-foreground-400 uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-left">Event</th>
                    <th className="px-4 py-2 text-left">Agent</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {paginated.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() =>
                        router.push(
                          `/governance/audit/${encodeURIComponent(entry.id)}`
                        )
                      }
                      className={`cursor-pointer hover:bg-background-200 transition-colors group ${
                        entry.status === "failed" ||
                        entry.event === "auth_failed"
                          ? "bg-danger-500/5 hover:bg-danger-500/10"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        {sourceBadge(entry.source)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground font-medium">
                        {ACTIVITY_LABELS[entry.event] ??
                          entry.event.replace(/_/g, " ")}
                      </td>
                      <td
                        className="px-4 py-2.5 text-xs text-foreground-500"
                        title={entry.agentDid ?? ""}
                      >
                        {entry.agentName ??
                          (entry.agentDid ? (
                            shortDid(entry.agentDid)
                          ) : (
                            <span className="italic text-foreground-400">
                              —
                            </span>
                          ))}
                      </td>
                      <td className="px-4 py-2.5">
                        {statusBadge(entry.status)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground-500 whitespace-nowrap">
                        {timeAgo(entry.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 text-foreground-400 group-hover:text-foreground-500 transition-colors">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                <p className="text-xs text-foreground-400">
                  {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, entries.length)} of{" "}
                  {entries.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-foreground-500 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "policies" | "audit";

export default function GovernancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/governance/summary");
      if (res.ok) {
        const data = (await res.json()) as GovernanceSummary;
        setSummary(data);
      }
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <ShieldCheck size={15} /> },
    {
      id: "policies",
      label: "Policies & Budgets",
      icon: <FileText size={15} />,
    },
    { id: "audit", label: "Audit Log", icon: <Activity size={15} /> },
  ];

  return (
    <div className="p-6 w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            AI Governance
          </h1>
          <p className="text-foreground-500 text-sm mt-0.5">
            Policy management, risk posture, and audit trail
          </p>
        </div>
        {tab === "overview" && (
          <button
            onClick={fetchSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
          >
            <RefreshCw
              size={12}
              className={summaryLoading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
 ${
   tab === t.id
     ? "border-primary-500 text-primary-700"
     : "border-transparent text-foreground-500 hover:text-foreground"
 }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab summary={summary} loading={summaryLoading} />
      )}
      {tab === "policies" && <PoliciesTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
