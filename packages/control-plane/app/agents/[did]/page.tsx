"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useAdminWS } from "../../../hooks/useAdminWS";
import type { LlmProviderType, GraphNode } from "@vaultysclaw/shared";
import dynamic from "next/dynamic";
import {
  Bot,
  Send,
  Trash2,
  Loader2,
  MessageSquare,
  Settings2,
  Clock,
  ShieldCheck,
  LayoutDashboard,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  Zap,
  TrendingUp,
  Plus,
  AlertTriangle,
  RotateCcw,
  X,
  CalendarDays,
  Activity,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={16} />,
  internet_access: <Globe size={16} />,
  browser_control: <Monitor size={16} />,
  api_call: <Plug size={16} />,
  mail_send: <Mail size={16} />,
  code_execution: <Code size={16} />,
  system_command: <Terminal size={16} />,
};

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), { ssr: false });
const EmbeddedAgentChart = dynamic(() => import("@/components/graph/EmbeddedAgentChart"), { ssr: false });

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const ALL_CAPABILITIES = [
  { id: "file_access", label: "File Access" },
  { id: "internet_access", label: "Internet Access" },
  { id: "browser_control", label: "Browser Control" },
  { id: "api_call", label: "API Call" },
  { id: "mail_send", label: "Mail Send" },
  { id: "code_execution", label: "Code Execution" },
  { id: "system_command", label: "System Command" },
] as const;

interface AgentDetail {
  id: string;
  name: string;
  capabilities: string[];
  publicKey: string | null;
  certificateInfo: Record<string, unknown> | null;
  agentVaultysId: Record<string, unknown> | null;
  registeredAt: string;
  lastSeen: string;
  online: boolean;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  reportedLlm: { provider: string; model: string } | null;
  storedLlm: { provider: string; model: string } | null;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  tokenBudgetDaily: number | null;
  tokenBudgetMonthly: number | null;
  todayTokens: number;
  monthTokens: number;
}

interface LlmConfigDisplay {
  provider: LlmProviderType;
  model: string;
  baseUrl?: string;
  systemPrompt?: string;
  maxTokens?: number;
  apiKeySet: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type TabId = "overview" | "chat" | "tokens" | "config" | "governance" | "automation" | "approvals" | "details" | "peers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
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
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "—";
  const date = parseUTC(iso);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-vc-border px-1 bg-vc-surface rounded-t-xl overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active === tab.id
            ? "border-indigo-500 text-indigo-400"
            : "border-transparent text-vc-muted hover:text-vc-text hover:border-vc-ring"
            }`}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [deletingAgent, setDeletingAgent] = useState(false);

  const { agents: agentsState, lastEvent } = useAdminWS();
  const liveAgent = agentsState.agents.find((a) => a.id === did);

  const handleDeleteAgent = async () => {
    if (!confirm("⚠️ Are you sure you want to delete this agent? This action cannot be undone. The agent will be permanently removed from the system.")) {
      return;
    }
    setDeletingAgent(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`, { method: "DELETE" });
      console.log("Delete response status:", res.status, "ok:", res.ok);
      if (res.ok) {
        router.push("/agents");
      } else {
        let errorMsg = "Failed to delete agent";
        try {
          const data = await res.json() as { error?: string };
          errorMsg = data.error ?? errorMsg;
        } catch {
          errorMsg = `Failed to delete agent (status ${res.status})`;
        }
        console.error("Delete error:", errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error("Delete network error:", err);
      setError("Network error while deleting agent");
    } finally {
      setDeletingAgent(false);
    }
  };

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`);
      if (res.status === 404) { setError("Agent not found"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgent(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent");
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => { fetchAgent(); }, [fetchAgent]);

  // Merge live status
  useEffect(() => {
    if (liveAgent && agent) {
      setAgent((prev) =>
        prev
          ? {
            ...prev,
            online: liveAgent.online,
            connectedAt: liveAgent.connectedAt,
            lastHeartbeat: liveAgent.lastHeartbeat,
            lastSeen: liveAgent.lastSeen,
            capabilities: liveAgent.capabilities,
            name: liveAgent.name,
            reportedLlm: liveAgent.reportedLlm ?? prev.reportedLlm,
          }
          : prev
      );
    }
  }, [liveAgent]);

  useEffect(() => {
    if (lastEvent === "agent_reconnected" || lastEvent === "capabilities_updated") {
      fetchAgent();
    }
  }, [lastEvent, fetchAgent]);

  // Poll approval count for badge
  useEffect(() => {
    const refresh = async () => {
      const res = await fetch("/api/tool-approvals").then((r) => r.json()).catch(() => ({ approvals: [] }));
      setPendingApprovals((res.approvals ?? []).length);
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-vc-muted">Loading agent details…</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => router.push("/agents")} className="text-indigo-400 hover:text-indigo-300 mb-6 inline-block text-sm">
          ← Back to Agents list
        </button>
        <div className="bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-lg px-4 py-3 text-red-600 dark:text-red-300">
          {error ?? "Agent not found"}
        </div>
      </div>
    );
  }

  const tabs: Tab[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { id: "chat", label: "Chat", icon: <MessageSquare size={15} /> },
    { id: "tokens", label: "Tokens", icon: <TrendingUp size={15} /> },
    { id: "config", label: "Config", icon: <Settings2 size={15} /> },
    { id: "governance", label: "Governance", icon: <ShieldCheck size={15} /> },
    { id: "automation", label: "Automation", icon: <Clock size={15} /> },
    { id: "approvals", label: "Approvals", icon: <AlertTriangle size={15} />, badge: pendingApprovals },
    { id: "peers", label: "Peer Agents", icon: <Bot size={15} /> },
    { id: "details", label: "Details", icon: <FileCode2 size={15} /> },
  ];

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
      {/* ── Page header ── */}
      <div className="mb-4">
        <button
          onClick={() => router.push("/agents")}
          className="inline-flex items-center gap-1.5 text-sm text-vc-muted hover:text-vc-text mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Back to Agents List
        </button>

        <div className="bg-vc-surface border border-vc-border rounded-xl px-5 py-4 flex items-center gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Bot size={22} className="text-indigo-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-vc-text">{agent.name}</h1>
              {agent.online ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-500/10 border border-green-300 dark:border-green-500/20 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-vc-muted bg-vc-raised border border-vc-ring rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-vc-ring rounded-full" />
                  Offline
                </span>
              )}
              {(agent.reportedLlm ?? agent.storedLlm) && (() => {
                const llm = agent.reportedLlm ?? agent.storedLlm!;
                return (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-vc-muted bg-vc-raised border border-vc-ring rounded-full px-2.5 py-0.5">
                    <Zap size={11} className="text-amber-500" />
                    <span className="text-vc-text-2">{llm.provider}</span>
                    <span className="text-vc-subtle">/</span>
                    <span className="font-mono">{llm.model}</span>
                  </span>
                );
              })()}
            </div>
            <p className="text-xs font-mono text-vc-muted mt-0.5 truncate">{agent.id}</p>
          </div>

          {/* Quick stats */}
          <div className="hidden sm:flex gap-6 text-right flex-shrink-0">
            <div>
              <div className="text-xs text-vc-muted uppercase">Last seen</div>
              <div className="text-sm text-vc-text">{timeAgo(agent.lastSeen)}</div>
            </div>
            {(agent.reportedLlm ?? agent.storedLlm) && (() => {
              const llm = agent.reportedLlm ?? agent.storedLlm!;
              return (
                <div>
                  <div className="text-xs text-vc-muted uppercase">LLM</div>
                  <div className="text-sm text-vc-text font-mono">{llm.model}</div>
                  <div className="text-[10px] text-vc-subtle">{llm.provider}</div>
                </div>
              );
            })()}
            <div>
              <div className="text-xs text-vc-muted uppercase">Capabilities</div>
              <div className="text-sm text-vc-text">{agent.capabilities.length}</div>
            </div>
            <button
              onClick={handleDeleteAgent}
              disabled={deletingAgent}
              className="ml-4 px-3 py-2 rounded-lg border border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              title="Delete agent"
            >
              {deletingAgent ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabbed content ── */}
      <div className="border border-vc-border rounded-xl overflow-hidden bg-vc-surface">
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "overview" && <OverviewTab agent={agent} onTabChange={setActiveTab} />}
          {activeTab === "chat" && <ChatTab agentId={agent.id} agentName={agent.name} online={agent.online} />}
          {activeTab === "tokens" && <TokensTab agentId={agent.id} />}
          {activeTab === "config" && <ConfigTab did={did} reportedLlm={agent.reportedLlm} />}
          {activeTab === "governance" && <GovernanceTab did={did} agentCapabilities={agent.capabilities} />}
          {activeTab === "automation" && <AutomationTab agentId={agent.id} />}
          {activeTab === "approvals" && <ApprovalsTab onCountChange={setPendingApprovals} />}
          {activeTab === "peers" && <PeerAgentsTab did={did} />}
          {activeTab === "details" && <DetailsTab agent={agent} onNodeClick={(node: GraphNode) => {
            if (node.type === "user") router.push(`/users/${encodeURIComponent(node.id.replace("user:", ""))}`);
            else if (node.type === "realm") router.push(`/realms/${node.id.replace("realm:", "")}`);
          }} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({ agent, onTabChange }: { agent: AgentDetail; onTabChange: (tab: TabId) => void }) {
  const [recentEvents, setRecentEvents] = useState<AuditEntry[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [activePolicy, setActivePolicy] = useState<PolicyEntry | null>(null);
  const [intentStats, setIntentStats] = useState<{ success: number; failed: number; pending: number } | null>(null);

  const overviewRouter = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const [auditRes, policyRes] = await Promise.all([
          fetch(`/api/governance/audit?agentDid=${encodeURIComponent(agent.id)}&limit=50`),
          fetch(`/api/policies?agentDid=${encodeURIComponent(agent.id)}`),
        ]);
        if (auditRes.ok) {
          const data = await auditRes.json();
          const entries: AuditEntry[] = data.entries ?? [];
          setRecentEvents(entries.slice(0, 8));
          const intents = entries.filter((e) => e.source === "intent");
          setIntentStats({
            success: intents.filter((e) => e.status === "success").length,
            failed: intents.filter((e) => e.status === "failed").length,
            pending: intents.filter((e) => e.status === "pending").length,
          });
        }
        if (policyRes.ok) {
          const data = await policyRes.json();
          const policies: PolicyEntry[] = data.policies ?? [];
          setActivePolicy(policies[0] ?? null);
        }
      } finally {
        setEventsLoading(false);
      }
    })();
  }, [agent.id]);

  // Token usage: prefer live session value, fall back to DB history
  const todayUsed = agent.tokenUsage?.totalTokens ?? agent.todayTokens;
  const monthUsed = agent.monthTokens;

  function TokenBar({ used, budget, label }: { used: number; budget: number | null; label: string }) {
    const pct = budget ? Math.min(100, Math.round((used / budget) * 100)) : null;
    const danger = pct !== null && pct >= 90;
    const warn = pct !== null && pct >= 70 && !danger;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-vc-muted">{label}</span>
          <span className={`font-mono ${danger ? "text-red-600 dark:text-red-400" : warn ? "text-amber-600 dark:text-amber-400" : "text-vc-text"}`}>
            {used.toLocaleString()}{budget ? ` / ${budget.toLocaleString()}` : ""}
          </span>
        </div>
        {budget && (
          <div className="h-1.5 bg-vc-raised rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-indigo-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // Session uptime
  function sessionUptime() {
    if (!agent.online || !agent.connectedAt) return null;
    const secs = Math.floor((Date.now() - parseUTC(agent.connectedAt).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const uptime = sessionUptime();

  const totalIntents = intentStats ? intentStats.success + intentStats.failed + intentStats.pending : 0;
  const successRate = totalIntents > 0 && intentStats ? Math.round((intentStats.success / totalIntents) * 100) : null;

  return (
    <div className="space-y-5">

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Session uptime */}
        <div className="bg-vc-raised border border-vc-border rounded-xl p-4">
          <div className="text-xs text-vc-muted uppercase mb-1">Session uptime</div>
          {uptime ? (
            <>
              <div className="text-2xl font-bold text-vc-text">{uptime}</div>
              <div className="text-xs text-vc-subtle mt-0.5">since {timeAgo(agent.connectedAt)}</div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-vc-muted">Offline</div>
              <div className="text-xs text-vc-subtle mt-0.5">last seen {timeAgo(agent.lastSeen)}</div>
            </>
          )}
        </div>

        {/* Tokens today */}
        <div className="bg-vc-raised border border-vc-border rounded-xl p-4">
          <div className="text-xs text-vc-muted uppercase mb-2">Tokens today</div>
          <div className="text-2xl font-bold text-vc-text">{todayUsed.toLocaleString()}</div>
          {agent.tokenBudgetDaily && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-vc-subtle mb-1">
                <span>budget</span>
                <span>{Math.round((todayUsed / agent.tokenBudgetDaily) * 100)}%</span>
              </div>
              <div className="h-1 bg-vc-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${todayUsed / agent.tokenBudgetDaily >= 0.9 ? "bg-red-500" :
                    todayUsed / agent.tokenBudgetDaily >= 0.7 ? "bg-amber-500" : "bg-indigo-500"
                    }`}
                  style={{ width: `${Math.min(100, Math.round((todayUsed / agent.tokenBudgetDaily) * 100))}%` }}
                />
              </div>
            </div>
          )}
          {!agent.tokenBudgetDaily && <div className="text-xs text-vc-subtle mt-1">no daily limit</div>}
        </div>

        {/* Tokens this month */}
        <div className="bg-vc-raised border border-vc-border rounded-xl p-4">
          <div className="text-xs text-vc-muted uppercase mb-2">Tokens this month</div>
          <div className="text-2xl font-bold text-vc-text">{monthUsed.toLocaleString()}</div>
          {agent.tokenBudgetMonthly && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-vc-subtle mb-1">
                <span>budget</span>
                <span>{Math.round((monthUsed / agent.tokenBudgetMonthly) * 100)}%</span>
              </div>
              <div className="h-1 bg-vc-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${monthUsed / agent.tokenBudgetMonthly >= 0.9 ? "bg-red-500" :
                    monthUsed / agent.tokenBudgetMonthly >= 0.7 ? "bg-amber-500" : "bg-indigo-500"
                    }`}
                  style={{ width: `${Math.min(100, Math.round((monthUsed / agent.tokenBudgetMonthly) * 100))}%` }}
                />
              </div>
            </div>
          )}
          {!agent.tokenBudgetMonthly && <div className="text-xs text-vc-subtle mt-1">no monthly limit</div>}
        </div>

        {/* Intent success rate */}
        <div className="bg-vc-raised border border-vc-border rounded-xl p-4">
          <div className="text-xs text-vc-muted uppercase mb-1">Intents (recent 50)</div>
          {eventsLoading ? (
            <div className="flex items-center gap-1.5 text-vc-muted text-sm mt-1"><Loader2 size={12} className="animate-spin" /> —</div>
          ) : intentStats && totalIntents > 0 ? (
            <>
              <div className="text-2xl font-bold text-vc-text">
                {successRate}%
                <span className="text-sm font-normal text-vc-muted ml-1">success</span>
              </div>
              <div className="flex gap-3 mt-1.5 text-xs">
                <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 size={10} />{intentStats.success}</span>
                {intentStats.failed > 0 && <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><XCircle size={10} />{intentStats.failed}</span>}
                {intentStats.pending > 0 && <span className="flex items-center gap-1 text-vc-muted"><Clock size={10} />{intentStats.pending}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-vc-muted">—</div>
              <div className="text-xs text-vc-subtle mt-0.5">no intents yet</div>
            </>
          )}
        </div>
      </div>

      {/* ── Lower two-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent activity */}
        <div className="bg-vc-surface border border-vc-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-vc-text flex items-center gap-1.5">
              <Activity size={14} className="text-vc-muted" /> Recent Activity
            </h2>
            <button
              onClick={() => onTabChange("governance")}
              className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-0.5 transition-colors"
            >
              Full audit <ChevronRight size={12} />
            </button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-vc-muted text-sm py-4 justify-center">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="text-xs text-vc-subtle text-center py-6">No activity recorded yet.</p>
          ) : (
            <div className="space-y-0">
              {recentEvents.map((ev, i) => {
                const isActivity = ev.source === "activity";
                return (
                  <button
                    key={ev.id}
                    onClick={() => overviewRouter.push(`/governance/audit/${encodeURIComponent(ev.id)}`)}
                    className="w-full flex items-start gap-3 py-2.5 hover:bg-vc-raised rounded-lg px-2 -mx-2 transition-colors text-left group"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${ev.status === "failed" ? "bg-red-500" :
                        ev.status === "success" ? "bg-green-500" :
                          isActivity ? "bg-indigo-500" : "bg-purple-500"
                        }`} />
                      {i < recentEvents.length - 1 && <div className="w-px flex-1 bg-vc-border mt-1 min-h-[12px]" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-vc-text truncate">
                          {AUDIT_LABELS[ev.event] ?? ev.event.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-vc-subtle flex-shrink-0">{timeAgo(ev.timestamp)}</span>
                      </div>
                      {ev.status === "failed" && ev.error && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 truncate mt-0.5">{ev.error}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active policy snapshot */}
        <div className="bg-vc-surface border border-vc-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-vc-text flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-vc-muted" /> Active Policy
            </h2>
            <button
              onClick={() => onTabChange("governance")}
              className="text-xs text-indigo-500 hover:text-indigo-400 flex items-center gap-0.5 transition-colors"
            >
              Manage <ChevronRight size={12} />
            </button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-vc-muted text-sm py-4 justify-center">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : !activePolicy ? (
            <div className="text-center py-6 space-y-2">
              <ShieldCheck size={26} className="mx-auto text-vc-border" />
              <p className="text-xs text-vc-subtle">No policy — agent is locked and cannot execute actions.</p>
              <button
                onClick={() => onTabChange("governance")}
                className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
              >
                Create a policy →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Capabilities */}
              <div>
                <p className="text-[10px] text-vc-subtle uppercase tracking-wider mb-2">Capabilities</p>
                <div className="flex flex-wrap gap-1.5">
                  {activePolicy.capabilities.map((cap) => (
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

              {/* Resource limits */}
              {activePolicy.resourceLimits && Object.keys(activePolicy.resourceLimits).length > 0 && (
                <div>
                  <p className="text-[10px] text-vc-subtle uppercase tracking-wider mb-2">Resource limits</p>
                  <div className="space-y-2">
                    {activePolicy.resourceLimits.maxTokensPerDay != null && (
                      <TokenBar
                        used={todayUsed}
                        budget={activePolicy.resourceLimits.maxTokensPerDay}
                        label="Tokens today"
                      />
                    )}
                    {activePolicy.resourceLimits.maxRequestsPerHour != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-vc-muted">Max requests / hour</span>
                        <span className="font-mono text-vc-text">{activePolicy.resourceLimits.maxRequestsPerHour}</span>
                      </div>
                    )}
                    {activePolicy.resourceLimits.allowedDomains && activePolicy.resourceLimits.allowedDomains.length > 0 && (
                      <div className="flex justify-between text-xs gap-4">
                        <span className="text-vc-muted flex-shrink-0">Allowed domains</span>
                        <span className="font-mono text-vc-text text-right text-[11px] break-all">{activePolicy.resourceLimits.allowedDomains.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Expiry */}
              {activePolicy.expiresAt && (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${new Date(activePolicy.expiresAt) < new Date()
                  ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400"
                  : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400"
                  }`}>
                  <CalendarDays size={12} />
                  {formatExpiry(activePolicy.expiresAt)}
                </div>
              )}

              {/* Policy meta */}
              <p className="text-[10px] font-mono text-vc-subtle">
                {activePolicy.id} · created {timeAgo(activePolicy.createdAt)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Governance — policies, resource limits, cert-embedded enforcement
// ---------------------------------------------------------------------------

interface PolicyEntry {
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

const EMPTY_LIMITS = { maxTokensPerDay: "", maxRequestsPerHour: "", allowedDomains: "" };

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

const AUDIT_LABELS: Record<string, string> = {
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

const AUDIT_PAGE_SIZE = 20;

function GovernanceTab({ did, agentCapabilities }: { did: string; agentCapabilities: string[] }) {
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formCaps, setFormCaps] = useState<string[]>([...agentCapabilities]);
  const [formLimits, setFormLimits] = useState(EMPTY_LIMITS);
  const [formExpiry, setFormExpiry] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [revoking, setRevoking] = useState<string | null>(null);
  const [renewTarget, setRenewTarget] = useState<PolicyEntry | null>(null);
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewRevokeOriginal, setRenewRevokeOriginal] = useState(true);
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  const openRenew = (p: PolicyEntry) => {
    // Suggest same remaining duration, min 1 day; fall back to +30 days
    const suggestExpiry = () => {
      const pad = (n: number) => String(n).padStart(2, "0");
      let ms = 30 * 86_400_000;
      if (p.expiresAt) {
        const rem = parseUTC(p.expiresAt).getTime() - Date.now();
        ms = Math.max(86_400_000, rem);
      }
      const d = new Date(Date.now() + ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setRenewTarget(p);
    setRenewExpiry(suggestExpiry());
    setRenewRevokeOriginal(true);
    setRenewError(null);
  };

  const confirmRenew = async () => {
    if (!renewTarget) return;
    setRenewSaving(true);
    setRenewError(null);
    try {
      const rl = renewTarget.resourceLimits && Object.keys(renewTarget.resourceLimits).length > 0
        ? renewTarget.resourceLimits : undefined;
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: renewTarget.agentDid,
          capabilities: renewTarget.capabilities,
          resourceLimits: rl,
          expiresAt: renewExpiry ? new Date(renewExpiry).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setRenewError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      if (renewRevokeOriginal) {
        await fetch(`/api/policies/${encodeURIComponent(renewTarget.id)}`, { method: "DELETE" });
      }
      setRenewTarget(null);
      await fetchPolicies();
    } finally {
      setRenewSaving(false);
    }
  };

  // Audit trail state
  const router = useRouter();
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditSourceFilter, setAuditSourceFilter] = useState<"" | "activity" | "intent">("");
  const [auditStatusFilter, setAuditStatusFilter] = useState<"" | "success" | "failed">("");
  const [auditPage, setAuditPage] = useState(0);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ agentDid: did, limit: "200" });
      if (auditSourceFilter) params.set("source", auditSourceFilter);
      if (auditStatusFilter) params.set("status", auditStatusFilter);
      const res = await fetch(`/api/governance/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries ?? []);
        setAuditPage(0);
      }
    } finally {
      setAuditLoading(false);
    }
  }, [did, auditSourceFilter, auditStatusFilter]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch(`/api/policies?agentDid=${encodeURIComponent(did)}`);
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
      }
    } finally {
      setLoadingPolicies(false);
    }
  }, [did]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const openForm = () => {
    setFormCaps([...agentCapabilities]);
    setFormLimits(EMPTY_LIMITS);
    setFormExpiry("");
    setFormError(null);
    setShowForm(true);
  };

  const savePolicy = async () => {
    if (formCaps.length === 0) { setFormError("Select at least one capability."); return; }
    setFormSaving(true);
    setFormError(null);
    try {
      const resourceLimits: Record<string, unknown> = {};
      if (formLimits.maxTokensPerDay !== "") resourceLimits.maxTokensPerDay = Number(formLimits.maxTokensPerDay);
      if (formLimits.maxRequestsPerHour !== "") resourceLimits.maxRequestsPerHour = Number(formLimits.maxRequestsPerHour);
      if (formLimits.allowedDomains.trim() !== "") {
        resourceLimits.allowedDomains = formLimits.allowedDomains.split(",").map((d) => d.trim()).filter(Boolean);
      }
      const body: Record<string, unknown> = {
        agentDid: did,
        capabilities: formCaps,
        resourceLimits: Object.keys(resourceLimits).length > 0 ? resourceLimits : undefined,
        expiresAt: formExpiry !== "" ? new Date(formExpiry).toISOString() : undefined,
      };
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      await fetchPolicies();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setFormSaving(false);
    }
  };

  const revokePolicy = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/policies/${encodeURIComponent(id)}`, { method: "DELETE" });
      await fetchPolicies();
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-vc-text">Policies</h2>
          <p className="text-xs text-vc-muted mt-0.5">
            Policies define which capabilities and resource limits are embedded in the agent&apos;s certificate.
            Creating or revoking a policy immediately triggers a certificate reissue for connected agents.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openForm}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus size={13} /> New Policy
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-vc-raised border border-vc-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-vc-text">New Policy</h3>
            <button onClick={() => setShowForm(false)} className="text-vc-muted hover:text-vc-text"><X size={16} /></button>
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-xs text-vc-muted uppercase mb-2">Capabilities</p>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => {
                const active = formCaps.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => setFormCaps(active ? formCaps.filter((c) => c !== cap.id) : [...formCaps, cap.id])}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${active
                      ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500 text-indigo-700 dark:text-indigo-300"
                      : "bg-vc-surface border-vc-ring text-vc-muted hover:border-vc-muted"}`}
                  >
                    {CAPABILITY_ICONS[cap.id] ?? <Zap size={14} />}
                    {cap.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resource limits */}
          <div>
            <p className="text-xs text-vc-muted uppercase mb-2">Resource Limits <span className="normal-case text-vc-subtle">(optional)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-vc-muted">Max tokens / day</span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  value={formLimits.maxTokensPerDay}
                  onChange={(e) => setFormLimits((l) => ({ ...l, maxTokensPerDay: e.target.value }))}
                  className="w-full bg-vc-surface border border-vc-ring rounded-md px-3 py-1.5 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:border-indigo-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-vc-muted">Max requests / hour</span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 60"
                  value={formLimits.maxRequestsPerHour}
                  onChange={(e) => setFormLimits((l) => ({ ...l, maxRequestsPerHour: e.target.value }))}
                  className="w-full bg-vc-surface border border-vc-ring rounded-md px-3 py-1.5 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:border-indigo-500"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-vc-muted">Allowed domains <span className="text-vc-subtle">(comma-separated)</span></span>
                <input
                  type="text"
                  placeholder="e.g. api.openai.com, example.com"
                  value={formLimits.allowedDomains}
                  onChange={(e) => setFormLimits((l) => ({ ...l, allowedDomains: e.target.value }))}
                  className="w-full bg-vc-surface border border-vc-ring rounded-md px-3 py-1.5 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:border-indigo-500"
                />
              </label>
            </div>
          </div>

          {/* Expiry */}
          <label className="block space-y-1">
            <span className="text-xs text-vc-muted uppercase">Expiry <span className="normal-case text-vc-subtle">(optional)</span></span>
            <input
              type="datetime-local"
              value={formExpiry}
              onChange={(e) => setFormExpiry(e.target.value)}
              className="bg-vc-surface border border-vc-ring rounded-md px-3 py-1.5 text-sm text-vc-text focus:outline-none focus:border-indigo-500"
            />
          </label>

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle size={13} />{formError}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-vc-muted hover:text-vc-text px-3 py-1.5">Cancel</button>
            <button
              onClick={savePolicy}
              disabled={formSaving}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors"
            >
              {formSaving ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={13} />}
              {formSaving ? "Applying…" : "Apply Policy"}
            </button>
          </div>
        </div>
      )}

      {/* Policy list */}
      {loadingPolicies ? (
        <div className="flex items-center gap-2 text-vc-muted text-sm py-4">
          <Loader2 size={14} className="animate-spin" /> Loading policies…
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-10 text-vc-muted text-sm border border-dashed border-vc-border rounded-xl">
          <ShieldCheck size={28} className="mx-auto mb-2 opacity-30" />
          No active policies. Create one above to grant capabilities and set limits.
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="bg-vc-raised border border-vc-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 flex-1 min-w-0">
                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1.5">
                    {p.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-xs"
                      >
                        {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                        {cap.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>

                  {/* Resource limits */}
                  {p.resourceLimits && Object.keys(p.resourceLimits).length > 0 && (
                    <div className="flex flex-wrap gap-3 text-xs text-vc-muted">
                      {p.resourceLimits.maxTokensPerDay != null && (
                        <span className="flex items-center gap-1">
                          <TrendingUp size={11} className="text-amber-600 dark:text-amber-400" />
                          {p.resourceLimits.maxTokensPerDay.toLocaleString()} tokens/day
                        </span>
                      )}
                      {p.resourceLimits.maxRequestsPerHour != null && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} className="text-amber-600 dark:text-amber-400" />
                          {p.resourceLimits.maxRequestsPerHour} req/h
                        </span>
                      )}
                      {p.resourceLimits.allowedDomains && p.resourceLimits.allowedDomains.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Globe size={11} className="text-amber-600 dark:text-amber-400" />
                          {p.resourceLimits.allowedDomains.join(", ")}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-vc-subtle">
                    <span>Created {timeAgo(p.createdAt)}</span>
                    {p.createdBy && <span>by <code className="font-mono">{p.createdBy.slice(0, 20)}…</code></span>}
                    {p.expiresAt && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {formatExpiry(p.expiresAt)}
                      </span>
                    )}
                    <code className="font-mono text-vc-subtle/60">{p.id}</code>
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1.5">
                  <button
                    onClick={() => openRenew(p)}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 border border-indigo-300 dark:border-indigo-500/30 hover:border-indigo-400 px-2.5 py-1.5 rounded-md transition-colors"
                    title="Renew policy"
                  >
                    <RotateCcw size={12} /> Renew
                  </button>
                  <button
                    onClick={() => revokePolicy(p.id)}
                    disabled={revoking === p.id}
                    className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 border border-red-300 dark:border-red-500/20 hover:border-red-400 dark:hover:border-red-500/40 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
                  >
                    {revoking === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Renew policy modal */}
      {renewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-vc-border">
              <span className="flex items-center gap-2 text-sm font-semibold text-vc-text">
                <RotateCcw size={15} className="text-indigo-500" /> Renew policy
              </span>
              <button onClick={() => setRenewTarget(null)} className="text-vc-subtle hover:text-vc-text p-1 rounded-lg hover:bg-vc-raised transition-colors"><X size={15} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Capabilities summary */}
              <div className="bg-vc-raised border border-vc-border rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {renewTarget.capabilities.map((cap) => (
                    <span key={cap} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-xs">
                      {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}{cap.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                {renewTarget.resourceLimits && (renewTarget.resourceLimits.maxTokensPerDay || renewTarget.resourceLimits.maxRequestsPerHour) && (
                  <p className="text-xs text-vc-muted">
                    {renewTarget.resourceLimits.maxTokensPerDay ? `${renewTarget.resourceLimits.maxTokensPerDay.toLocaleString()} tok/d` : ""}
                    {renewTarget.resourceLimits.maxTokensPerDay && renewTarget.resourceLimits.maxRequestsPerHour ? " · " : ""}
                    {renewTarget.resourceLimits.maxRequestsPerHour ? `${renewTarget.resourceLimits.maxRequestsPerHour} req/h` : ""}
                  </p>
                )}
                {renewTarget.expiresAt && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Original expiry: {new Date(renewTarget.expiresAt.endsWith("Z") ? renewTarget.expiresAt : renewTarget.expiresAt + "Z").toLocaleString()}
                  </p>
                )}
              </div>
              {/* New expiry */}
              <div className="space-y-1.5">
                <label className="text-xs text-vc-muted font-medium">New expiry date</label>
                <input
                  type="datetime-local"
                  value={renewExpiry}
                  onChange={(e) => setRenewExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-vc-raised border border-vc-border rounded-lg text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex gap-1.5 mt-1">
                  {([7, 30, 90, 365] as const).map((days) => {
                    const pad = (n: number) => String(n).padStart(2, "0");
                    const d = new Date(Date.now() + days * 86_400_000);
                    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    return (
                      <button key={days} type="button" onClick={() => setRenewExpiry(val)}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-vc-border text-vc-muted hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 transition-colors">
                        +{days}d
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Revoke original */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={renewRevokeOriginal} onChange={(e) => setRenewRevokeOriginal(e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-xs text-vc-muted group-hover:text-vc-text transition-colors">Revoke original policy after renewal</span>
              </label>
              {renewError && <p className="text-xs text-red-500 dark:text-red-400">{renewError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-vc-border">
              <button onClick={() => setRenewTarget(null)} className="px-3 py-1.5 text-sm text-vc-muted hover:text-vc-text border border-vc-border rounded-lg hover:bg-vc-raised transition-colors">Cancel</button>
              <button
                onClick={confirmRenew}
                disabled={renewSaving || !renewExpiry}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {renewSaving ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Renew policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Trail ──────────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        {/* Section header + filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-vc-text flex items-center gap-1.5">
              <Activity size={14} className="text-vc-muted" /> Audit Trail
            </h2>
            <p className="text-xs text-vc-muted mt-0.5">
              All activity and intent events for this agent. Click any row for full detail.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Source filter */}
            <div className="flex rounded-md overflow-hidden border border-vc-ring text-xs">
              {(["", "activity", "intent"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditSourceFilter(s)}
                  className={`px-2.5 py-1 transition-colors ${auditSourceFilter === s
                    ? "bg-indigo-600 text-white"
                    : "bg-vc-surface text-vc-muted hover:text-vc-text"
                    }`}
                >
                  {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex rounded-md overflow-hidden border border-vc-ring text-xs">
              {(["", "success", "failed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditStatusFilter(s)}
                  className={`px-2.5 py-1 transition-colors ${auditStatusFilter === s
                    ? "bg-indigo-600 text-white"
                    : "bg-vc-surface text-vc-muted hover:text-vc-text"
                    }`}
                >
                  {s === "" ? "Any status" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAudit}
              className="text-xs text-vc-muted hover:text-vc-text px-2 py-1 rounded-md border border-vc-ring bg-vc-surface transition-colors"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Table */}
        {auditLoading ? (
          <div className="flex items-center gap-2 text-vc-muted text-sm py-6 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading audit trail…
          </div>
        ) : auditEntries.length === 0 ? (
          <div className="text-center py-10 text-vc-muted text-sm border border-dashed border-vc-border rounded-xl">
            <Activity size={28} className="mx-auto mb-2 opacity-30" />
            No audit events found for this agent.
          </div>
        ) : (() => {
          const totalPages = Math.ceil(auditEntries.length / AUDIT_PAGE_SIZE);
          const page = Math.min(auditPage, totalPages - 1);
          const slice = auditEntries.slice(page * AUDIT_PAGE_SIZE, (page + 1) * AUDIT_PAGE_SIZE);
          return (
            <div className="space-y-2">
              <div className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-vc-border">
                      <th className="text-left text-vc-subtle uppercase tracking-wider px-3 py-2 font-medium w-24">Source</th>
                      <th className="text-left text-vc-subtle uppercase tracking-wider px-3 py-2 font-medium">Event</th>
                      <th className="text-left text-vc-subtle uppercase tracking-wider px-3 py-2 font-medium w-24">Status</th>
                      <th className="text-left text-vc-subtle uppercase tracking-wider px-3 py-2 font-medium w-36">Time</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vc-border">
                    {slice.map((entry) => {
                      const isActivity = entry.source === "activity";
                      return (
                        <tr
                          key={entry.id}
                          onClick={() => router.push(`/governance/audit/${encodeURIComponent(entry.id)}`)}
                          className="cursor-pointer hover:bg-vc-raised transition-colors group"
                        >
                          {/* Source badge */}
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${isActivity
                              ? "bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-500/25"
                              : "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-500/25"
                              }`}>
                              {isActivity ? <Activity size={9} /> : <FileText size={9} />}
                              {entry.source}
                            </span>
                          </td>
                          {/* Event name */}
                          <td className="px-3 py-2.5 text-vc-text">
                            {AUDIT_LABELS[entry.event] ?? entry.event.replace(/_/g, " ")}
                          </td>
                          {/* Status */}
                          <td className="px-3 py-2.5">
                            {entry.status === "success" && (
                              <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                                <CheckCircle2 size={11} /> success
                              </span>
                            )}
                            {entry.status === "failed" && (
                              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <XCircle size={11} /> failed
                              </span>
                            )}
                            {entry.status && entry.status !== "success" && entry.status !== "failed" && (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <Clock size={11} /> {entry.status}
                              </span>
                            )}
                            {!entry.status && (
                              <span className="text-vc-subtle">—</span>
                            )}
                          </td>
                          {/* Timestamp */}
                          <td className="px-3 py-2.5 text-vc-muted">
                            {timeAgo(entry.timestamp)}
                          </td>
                          {/* Arrow */}
                          <td className="pr-3">
                            <ChevronRight size={13} className="text-vc-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-vc-muted px-1">
                  <span>{auditEntries.length} events · page {page + 1} of {totalPages}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setAuditPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="px-2.5 py-1 rounded border border-vc-ring bg-vc-surface hover:text-vc-text disabled:opacity-40 transition-colors"
                    >
                      ‹ Prev
                    </button>
                    <button
                      onClick={() => setAuditPage(Math.min(totalPages - 1, page + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-2.5 py-1 rounded border border-vc-ring bg-vc-surface hover:text-vc-text disabled:opacity-40 transition-colors"
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Chat (embedded, agent pre-selected)
// ---------------------------------------------------------------------------

interface ChatSessionMeta {
  id: string;
  title: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

// ---------------------------------------------------------------------------
// TokensTab
// ---------------------------------------------------------------------------

type TokenGranularity = "day" | "month";
type TokenPeriod = "7d" | "30d" | "3m" | "12m";

interface TokenBucket {
  bucket: string;
  promptTokens: number;
  completionTokens: number;
}

function TokensTab({ agentId }: { agentId: string }) {
  const [granularity, setGranularity] = useState<TokenGranularity>("day");
  const [period, setPeriod] = useState<TokenPeriod>("30d");
  const [data, setData] = useState<TokenBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fetchData = useCallback(async (g: TokenGranularity, p: TokenPeriod) => {
    setLoading(true);
    setTokenError(null);
    try {
      const today = new Date();
      let from: string;
      if (p === "7d") {
        const d = new Date(today); d.setDate(d.getDate() - 6);
        from = d.toISOString().slice(0, 10);
      } else if (p === "30d") {
        const d = new Date(today); d.setDate(d.getDate() - 29);
        from = d.toISOString().slice(0, 10);
      } else if (p === "3m") {
        const d = new Date(today); d.setMonth(d.getMonth() - 2);
        from = g === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
      } else {
        const d = new Date(today); d.setMonth(d.getMonth() - 11);
        from = g === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
      }
      const to = g === "month" ? today.toISOString().slice(0, 7) : today.toISOString().slice(0, 10);
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/token-usage?granularity=${g}&from=${from}&to=${to}`
      );
      if (!res.ok) throw new Error("Failed to fetch token data");
      const json = await res.json();
      setData(json.data ?? []);
    } catch (e) {
      setTokenError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchData(granularity, period); }, [fetchData, granularity, period]);

  const total = data.reduce(
    (acc, r) => ({ prompt: acc.prompt + r.promptTokens, completion: acc.completion + r.completionTokens }),
    { prompt: 0, completion: 0 },
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border border-vc-border bg-vc-surface p-0.5">
          {(["7d", "30d", "3m", "12m"] as TokenPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p === "3m" || p === "12m") setGranularity("month"); else setGranularity("day");
              }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${period === p ? "bg-vc-accent text-white" : "text-vc-muted hover:text-vc-foreground hover:bg-vc-card"
                }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-vc-border bg-vc-surface p-0.5">
          {(["day", "month"] as TokenGranularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${granularity === g ? "bg-vc-accent text-white" : "text-vc-muted hover:text-vc-foreground hover:bg-vc-card"
                }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-vc-border bg-vc-card p-4">
          <p className="text-xs text-vc-muted mb-1">Input tokens</p>
          <p className="text-xl font-semibold text-vc-foreground">{total.prompt.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-vc-border bg-vc-card p-4">
          <p className="text-xs text-vc-muted mb-1">Output tokens</p>
          <p className="text-xl font-semibold text-vc-foreground">{total.completion.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-vc-border bg-vc-card p-4">
          <p className="text-xs text-vc-muted mb-1">Total tokens</p>
          <p className="text-xl font-semibold text-vc-foreground">{(total.prompt + total.completion).toLocaleString()}</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-vc-muted">
          <Loader2 className="animate-spin w-5 h-5 mr-2" /> Loading…
        </div>
      )}
      {tokenError && <p className="text-red-600 dark:text-red-400 text-sm">{tokenError}</p>}
      {!loading && !tokenError && data.length > 0 && (
        <div className="rounded-xl border border-vc-border bg-vc-card p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v: string) => granularity === "month" ? v.slice(0, 7) : v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#1a1a1f", border: "1px solid #2d2d35", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="promptTokens" name="Input" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completionTokens" name="Output" fill="#818cf8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !tokenError && data.length === 0 && (
        <div className="text-center py-12 text-vc-muted text-sm">No token data for this period.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatTab
// ---------------------------------------------------------------------------

function ChatTab({ agentId, agentName, online }: { agentId: string; agentName: string; online: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset chat state when switching agents
  useEffect(() => {
    setMessages([]);
    setActiveSessionId(null);
    setSessions([]);
    setError(null);
  }, [agentId]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/chat-sessions`);
      if (!res.ok) return;
      const data = await res.json() as { sessions: ChatSessionMeta[] };
      setSessions(data.sessions ?? []);
    } catch { /* non-fatal */ }
  }, [agentId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/chat-sessions?session=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json() as { messages: Array<{ role: string; content: string }> };
      setMessages(
        (data.messages ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      );
      setActiveSessionId(sessionId);
      setError(null);
    } catch { /* non-fatal */ }
  }, [agentId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || !online) return;

      const userMsg: ChatMessage = { role: "user", content: text.trim() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setError(null);
      setErrorCode(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentDid: agentId, messages: updatedMessages, sessionId: activeSessionId ?? undefined }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string; errorCode?: string };
          setErrorCode(errBody.errorCode ?? null);
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let assistantContent = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        let buffer = "";
        let eventType = "message";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
            if (!line.startsWith("data: ")) { if (line === "") eventType = "message"; continue; }
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (eventType === "session") {
                if (typeof parsed.conversationId === "string") setActiveSessionId(parsed.conversationId);
                eventType = "message"; continue;
              }
              if (parsed.error) {
                setErrorCode(parsed.errorCode ?? null);
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                assistantContent += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
              eventType = "message";
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) =>
          prev[prev.length - 1]?.role === "assistant" && !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        fetchSessions().catch(() => { });
      }
    },
    [messages, agentId, activeSessionId, isStreaming, online, fetchSessions]
  );

  const startNew = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setErrorCode(null);
    setIsStreaming(false);
    setActiveSessionId(null);
  };

  if (!online) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-vc-muted">
        <Bot size={40} strokeWidth={1} />
        <p className="text-sm">{agentName} is offline — chat unavailable</p>
      </div>
    );
  }

  return (
    <div className="flex" style={{ height: "calc(100vh - 22rem)" }}>
      {/* Sessions sidebar */}
      <div className="w-44 flex-shrink-0 flex flex-col border-r border-vc-border bg-vc-raised rounded-l-lg overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2 border-b border-vc-border">
          <span className="text-[10px] font-semibold text-vc-muted uppercase tracking-widest">History</span>
          <button onClick={startNew} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-[10px] text-vc-subtle text-center mt-4 px-2">No past sessions</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full text-left px-2 py-2 border-b border-vc-border/50 hover:bg-vc-surface transition-colors ${activeSessionId === s.id ? "bg-indigo-900/20 border-l-2 border-l-indigo-500" : ""
                }`}
            >
              <p className="text-[11px] text-vc-text truncate leading-tight">
                {s.title ?? "Untitled"}
              </p>
              <p className="text-[9px] text-vc-subtle mt-0.5">
                {s.messageCount} msg · {s.source}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-vc-border flex-shrink-0">
          <p className="text-xs text-vc-muted">
            {activeSessionId
              ? <span>Session <span className="font-mono text-vc-subtle">{activeSessionId.slice(0, 8)}…</span></span>
              : <span>New conversation with <span className="text-vc-text font-medium">{agentName}</span></span>
            }
          </p>
          {messages.length > 0 && (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 text-xs text-vc-muted hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 p-3">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-vc-muted">
              <Bot size={36} strokeWidth={1} />
              <p className="text-sm">Send a message to start the conversation</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed prose prose-sm prose-invert max-w-none ${msg.role === "user"
                  ? "bg-indigo-600/25 text-vc-text rounded-br-sm prose-headings:text-vc-text prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-vc-text prose-code:bg-indigo-950/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-indigo-950/30 prose-pre:border prose-pre:border-indigo-500/20 prose-pre:text-indigo-100"
                  : "bg-vc-raised border border-vc-border text-vc-text rounded-bl-sm prose-headings:text-vc-text prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-vc-text prose-code:bg-vc-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-vc-bg prose-pre:border prose-pre:border-vc-border prose-pre:text-vc-text"
                  }`}
              >
                {msg.content ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="m-0">{children}</p>,
                      ul: ({ children }) => <ul className="m-0 pl-4 list-disc">{children}</ul>,
                      ol: ({ children }) => <ol className="m-0 pl-4 list-decimal">{children}</ol>,
                      li: ({ children }) => <li className="m-0">{children}</li>,
                      code: ({ children }) => (
                        <code className={`px-1 py-0.5 rounded text-sm font-mono ${msg.role === "user"
                          ? "bg-indigo-950/30 text-indigo-200"
                          : "bg-vc-bg text-vc-text"
                          }`}>
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className={`p-2 rounded text-xs overflow-x-auto my-1 border ${msg.role === "user"
                          ? "bg-indigo-950/30 border-indigo-500/20 text-indigo-100"
                          : "bg-vc-bg border-vc-border text-vc-text"
                          }`}>
                          {children}
                        </pre>
                      ),
                      h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xs font-bold mt-1 mb-0.5">{children}</h3>,
                      blockquote: ({ children }) => (
                        <blockquote className={`pl-2 border-l-2 my-1 ${msg.role === "user" ? "border-indigo-500/50" : "border-vc-border"
                          }`}>
                          {children}
                        </blockquote>
                      ),
                      a: ({ children, href }) => (
                        <a href={href} className="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.role === "assistant" && isStreaming && (
                    <span className="inline-flex gap-1 text-vc-muted">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                    </span>
                  )
                )}
              </div>
            </div>
          ))}

          {error && (
            <AgentChatErrorBanner message={error} code={errorCode} />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-vc-border flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-vc-raised border border-vc-border rounded-lg px-4 py-2.5 text-sm text-vc-text placeholder:text-vc-muted focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors"
            >
              {isStreaming ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Config (LLM)
// ---------------------------------------------------------------------------

const PROVIDER_OPTIONS: { value: LlmProviderType; label: string; needsKey: boolean; needsUrl: boolean }[] = [
  { value: "openai", label: "OpenAI", needsKey: true, needsUrl: false },
  { value: "anthropic", label: "Anthropic", needsKey: true, needsUrl: false },
  { value: "google", label: "Google Gemini", needsKey: true, needsUrl: false },
  { value: "ollama", label: "Ollama (local)", needsKey: false, needsUrl: true },
  { value: "openai-compatible", label: "OpenAI-compatible", needsKey: true, needsUrl: true },
];

interface RegistryModel {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  modelId: string;
  status: string;
  litellmModelName: string | null;
}

interface RealmLlmModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  litellmModelName: string | null;
}

interface RealmLlmRealm {
  realmId: string;
  realmName: string;
  isPrimary: boolean;
  hasVirtualKey: boolean;
  models: RealmLlmModel[];
}

interface RealmLlmData {
  litellmConfigured: boolean;
  litellmBaseUrl: string | undefined;
  realms: RealmLlmRealm[];
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  "openai-compatible": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800",
  anthropic: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
  google: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800",
  ollama: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800",
};

function ConfigTab({ did, reportedLlm }: { did: string; reportedLlm: { provider: string; model: string } | null }) {
  const [llmConfig, setLlmConfig] = useState<LlmConfigDisplay | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmEditing, setLlmEditing] = useState(false);
  const [configMode, setConfigMode] = useState<"realm" | "registry" | "manual">("realm");
  const [registryModels, setRegistryModels] = useState<RegistryModel[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = useState("");
  const [realmLlmData, setRealmLlmData] = useState<RealmLlmData | null>(null);
  const [selectedRealmId, setSelectedRealmId] = useState("");
  const [selectedRealmModelId, setSelectedRealmModelId] = useState("");
  const [llmForm, setLlmForm] = useState({
    provider: "openai" as LlmProviderType,
    model: "",
    apiKey: "",
    baseUrl: "",
    systemPrompt: "",
    maxTokens: "",
  });
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");

  useEffect(() => {
    Promise.all([
      fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`).then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
      fetch(`/api/agents/${encodeURIComponent(did)}/realm-llm`).then((r) => r.json()),
    ]).then(([configData, modelsData, realmData]: [
      { config: LlmConfigDisplay | null },
      { models?: RegistryModel[] },
      RealmLlmData,
    ]) => {
      setLlmConfig(configData.config);
      setRegistryModels(modelsData.models ?? []);
      setRealmLlmData(realmData);
      if (configData.config) {
        setLlmForm({
          provider: configData.config.provider,
          model: configData.config.model,
          apiKey: "",
          baseUrl: configData.config.baseUrl ?? "",
          systemPrompt: configData.config.systemPrompt ?? "",
          maxTokens: configData.config.maxTokens?.toString() ?? "",
        });
      }
    }).catch(() => { }).finally(() => setLlmLoading(false));
  }, [did]);

  function openEdit() {
    if (llmConfig?.provider === "openai-compatible") {
      // Check if the current model matches a realm LiteLLM route
      const realmWithModel = realmLlmData?.realms.find((r) =>
        r.hasVirtualKey && r.models.some((m) => m.litellmModelName === llmConfig.model),
      );
      if (realmWithModel) {
        const realmModel = realmWithModel.models.find((m) => m.litellmModelName === llmConfig.model);
        setSelectedRealmId(realmWithModel.realmId);
        setSelectedRealmModelId(realmModel?.id ?? "");
        setConfigMode("realm");
        setLlmEditing(true);
        return;
      }
      // Check if it matches a registry model
      const match = registryModels.find((m) => m.modelId === llmConfig.model);
      if (match) {
        setSelectedRegistryId(match.id);
        setConfigMode("registry");
        setLlmEditing(true);
        return;
      }
      setConfigMode("manual");
    } else if (llmConfig) {
      setConfigMode("manual");
    } else {
      // Default to first available mode
      const hasRealmRouting = realmLlmData?.realms.some((r) => r.hasVirtualKey && r.models.length > 0);
      if (hasRealmRouting) {
        const firstRealm = realmLlmData!.realms.find((r) => r.hasVirtualKey && r.models.length > 0)!;
        setSelectedRealmId(firstRealm.realmId);
        setSelectedRealmModelId(firstRealm.models[0]?.id ?? "");
        setConfigMode("realm");
      } else if (registryModels.length > 0) {
        setConfigMode("registry");
      } else {
        setConfigMode("manual");
      }
    }
    setRegistryLoading(false);
    setLlmEditing(true);
  }

  async function saveRealmRouting() {
    if (!selectedRealmId || !selectedRealmModelId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realmId: selectedRealmId, realmModelId: selectedRealmModelId }),
      });
      if (res.ok) {
        const data = await res.json() as { config: LlmConfigDisplay };
        setLlmConfig(data.config);
        setLlmEditing(false);
        setLlmStatus("saved");
        setTimeout(() => setLlmStatus("idle"), 2500);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        alert(data.error ?? "Failed to save realm routing config");
        setLlmStatus("error");
      }
    } catch { setLlmStatus("error"); } finally { setLlmSaving(false); }
  }

  async function saveRegistryModel() {
    if (!selectedRegistryId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryModelId: selectedRegistryId }),
      });
      if (res.ok) {
        const data = await res.json() as { config: LlmConfigDisplay };
        setLlmConfig(data.config);
        setLlmEditing(false);
        setLlmStatus("saved");
        setTimeout(() => setLlmStatus("idle"), 2500);
      } else {
        setLlmStatus("error");
      }
    } catch { setLlmStatus("error"); } finally { setLlmSaving(false); }
  }

  async function saveManualConfig(e: React.FormEvent) {
    e.preventDefault();
    setLlmSaving(true);
    setLlmStatus("idle");
    try {
      const body: Record<string, unknown> = { provider: llmForm.provider, model: llmForm.model };
      if (llmForm.apiKey) body.apiKey = llmForm.apiKey;
      if (llmForm.baseUrl) body.baseUrl = llmForm.baseUrl;
      if (llmForm.systemPrompt) body.systemPrompt = llmForm.systemPrompt;
      if (llmForm.maxTokens) body.maxTokens = parseInt(llmForm.maxTokens, 10);
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as { config: LlmConfigDisplay };
        setLlmConfig(data.config);
        setLlmEditing(false);
        setLlmStatus("saved");
        setTimeout(() => setLlmStatus("idle"), 2500);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        alert(data.error ?? "Failed to save LLM config");
        setLlmStatus("error");
      }
    } catch { setLlmStatus("error"); } finally { setLlmSaving(false); }
  }

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.value === llmForm.provider)!;
  const activeRegistryModel = llmConfig?.provider === "openai-compatible"
    ? registryModels.find((m) => m.modelId === llmConfig.model)
    : null;

  // Detect realm routing: config model matches a litellm_model_name in a realm
  const activeRealmRoute = llmConfig?.provider === "openai-compatible"
    ? (() => {
      for (const realm of realmLlmData?.realms ?? []) {
        const model = realm.models.find((m) => m.litellmModelName === llmConfig.model);
        if (model) return { realm, model };
      }
      return null;
    })()
    : null;

  const hasRealmRouting = Boolean(
    realmLlmData?.litellmConfigured &&
    realmLlmData.realms.some((r) => r.hasVirtualKey && r.models.length > 0),
  );

  if (llmLoading) return <p className="text-vc-muted text-sm">Loading…</p>;

  return (
    <div className="space-y-5">
      {/* Agent-reported active LLM */}
      {reportedLlm && (
        <div className="bg-vc-raised rounded-lg border border-vc-border px-4 py-3">
          <div className="text-xs text-vc-muted uppercase tracking-wider font-medium mb-1.5">Agent Active LLM</div>
          <div className="flex items-center gap-3">
            <code className="text-sm font-mono text-indigo-400">
              {reportedLlm.provider}/{reportedLlm.model}
            </code>
            <span className="text-xs text-vc-subtle">reported by agent{llmConfig ? "" : " (local env config)"}</span>
          </div>
        </div>
      )}

      {/* Current config display */}
      <div className="rounded-xl border border-vc-border bg-vc-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vc-border">
          <div>
            <h2 className="text-sm font-semibold text-vc-text">LLM Configuration</h2>
            <p className="text-xs text-vc-muted mt-0.5">Pushed to the agent remotely on save</p>
          </div>
          {!llmEditing && (
            <div className="flex items-center gap-2">
              {llmConfig && (
                <button
                  onClick={async () => {
                    if (!confirm("Clear LLM config? The agent will fall back to its local environment variables.")) return;
                    setLlmSaving(true);
                    try {
                      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`, { method: "DELETE" });
                      if (res.ok) { setLlmConfig(null); setLlmStatus("cleared"); setTimeout(() => setLlmStatus("idle"), 2500); }
                      else setLlmStatus("error");
                    } catch { setLlmStatus("error"); } finally { setLlmSaving(false); }
                  }}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={openEdit}
                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-2.5 py-1.5 rounded-md transition-colors"
              >
                {llmConfig ? "Edit" : "Configure"}
              </button>
            </div>
          )}
        </div>

        {llmEditing ? (
          <div className="p-4 space-y-4">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-vc-border overflow-hidden text-sm">
              {[
                { id: "realm" as const, label: "Realm Routing", disabled: !hasRealmRouting, hint: !realmLlmData?.litellmConfigured ? "LiteLLM not configured" : "no models in realm" },
                { id: "registry" as const, label: "From Registry", disabled: registryModels.length === 0, hint: "no models registered" },
                { id: "manual" as const, label: "Configure manually", disabled: false, hint: "" },
              ].map(({ id, label, disabled, hint }) => (
                <button
                  key={id}
                  onClick={() => !disabled && setConfigMode(id)}
                  disabled={disabled}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${configMode === id
                    ? "bg-indigo-600 text-white"
                    : disabled
                      ? "bg-vc-bg text-vc-subtle cursor-not-allowed"
                      : "bg-vc-bg text-vc-muted hover:text-vc-text hover:bg-vc-raised"
                    }`}
                  title={disabled ? hint : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {configMode === "realm" ? (
              <div className="space-y-3">
                <p className="text-xs text-vc-muted">
                  Route this agent through your LiteLLM proxy using a realm-scoped virtual key.
                  The API key is resolved server-side.
                </p>
                {(realmLlmData?.realms ?? [])
                  .filter((r) => r.hasVirtualKey && r.models.length > 0)
                  .map((realm) => (
                    <div key={realm.realmId} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-vc-muted font-medium uppercase tracking-wider">
                        <span>{realm.realmName}</span>
                        {realm.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700 text-[10px] font-semibold">
                            Primary
                          </span>
                        )}
                      </div>
                      {realm.models.map((model) => (
                        <label
                          key={model.id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${selectedRealmId === realm.realmId && selectedRealmModelId === model.id
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                            : "border-vc-border hover:border-vc-ring hover:bg-vc-raised/50"
                            }`}
                        >
                          <input
                            type="radio"
                            name="realm-model"
                            checked={selectedRealmId === realm.realmId && selectedRealmModelId === model.id}
                            onChange={() => { setSelectedRealmId(realm.realmId); setSelectedRealmModelId(model.id); }}
                            className="accent-indigo-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-vc-text">{model.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[model.provider] ?? "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-gray-300 dark:border-zinc-700"}`}>
                                {model.provider}
                              </span>
                            </div>
                            <code className="text-xs text-vc-subtle font-mono">{model.litellmModelName ?? model.modelId}</code>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setLlmEditing(false); setLlmStatus("idle"); }}
                    className="text-sm text-vc-muted hover:text-vc-text px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedRealmId || !selectedRealmModelId || llmSaving}
                    onClick={saveRealmRouting}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use realm routing"}
                  </button>
                  <a href="/models" className="text-xs text-vc-muted hover:text-vc-text ml-auto transition-colors">
                    Manage models →
                  </a>
                </div>
              </div>
            ) : configMode === "registry" ? (
              <div className="space-y-3">
                <p className="text-xs text-vc-muted">
                  Select a model from the registry. Endpoint and credentials are resolved server-side.
                </p>
                {registryLoading ? (
                  <p className="text-xs text-vc-muted py-4 text-center">Loading registry…</p>
                ) : (
                  <div className="space-y-2">
                    {registryModels.filter(m => m.status === "active").map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${selectedRegistryId === m.id
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                          : "border-vc-border hover:border-vc-ring hover:bg-vc-raised/50"
                          }`}
                      >
                        <input
                          type="radio"
                          name="registry-model"
                          value={m.id}
                          checked={selectedRegistryId === m.id}
                          onChange={() => setSelectedRegistryId(m.id)}
                          className="accent-indigo-600 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-vc-text">{m.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[m.provider] ?? "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-gray-300 dark:border-zinc-700"}`}>
                              {m.provider}
                            </span>
                          </div>
                          <code className="text-xs text-vc-subtle font-mono">{m.modelId}</code>
                          {m.description && <p className="text-xs text-vc-muted mt-0.5">{m.description}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setLlmEditing(false); setLlmStatus("idle"); }}
                    className="text-sm text-vc-muted hover:text-vc-text px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedRegistryId || llmSaving}
                    onClick={saveRegistryModel}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use this model"}
                  </button>
                  <a href="/models" className="text-xs text-vc-muted hover:text-vc-text ml-auto transition-colors">
                    Manage registry →
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={saveManualConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-vc-muted uppercase tracking-wider font-medium block mb-1.5">Provider</label>
                    <select
                      value={llmForm.provider}
                      onChange={(e) => setLlmForm((f) => ({ ...f, provider: e.target.value as LlmProviderType }))}
                      className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      {PROVIDER_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-vc-muted uppercase tracking-wider font-medium block mb-1.5">Model</label>
                    <input
                      type="text"
                      required
                      value={llmForm.model}
                      onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))}
                      placeholder={
                        llmForm.provider === "openai" ? "gpt-4o"
                          : llmForm.provider === "anthropic" ? "claude-sonnet-4-5"
                            : llmForm.provider === "google" ? "gemini-2.5-flash"
                              : llmForm.provider === "ollama" ? "llama3.2"
                                : "model-name"
                      }
                      className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                  {selectedProvider.needsKey && (
                    <div>
                      <label className="text-xs text-vc-muted uppercase tracking-wider font-medium block mb-1.5">
                        API Key {llmConfig?.apiKeySet && <span className="text-emerald-500 normal-case">(stored — leave blank to keep)</span>}
                      </label>
                      <input
                        type="password"
                        value={llmForm.apiKey}
                        onChange={(e) => setLlmForm((f) => ({ ...f, apiKey: e.target.value }))}
                        placeholder={llmConfig?.apiKeySet ? "••••••••••••••••" : "sk-…"}
                        className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                  )}
                  {selectedProvider.needsUrl && (
                    <div>
                      <label className="text-xs text-vc-muted uppercase tracking-wider font-medium block mb-1.5">Base URL</label>
                      <input
                        type="url"
                        value={llmForm.baseUrl}
                        onChange={(e) => setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))}
                        placeholder={llmForm.provider === "ollama" ? "http://localhost:11434/api" : "http://localhost:1234/v1"}
                        className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-vc-muted uppercase tracking-wider font-medium block mb-1.5">
                      Max Tokens <span className="normal-case text-vc-subtle">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={llmForm.maxTokens}
                      onChange={(e) => setLlmForm((f) => ({ ...f, maxTokens: e.target.value }))}
                      placeholder="4096"
                      className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-vc-muted uppercase tracking-wider font-medium block mb-1.5">
                    System Prompt <span className="normal-case text-vc-subtle">(optional — overrides default)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={llmForm.systemPrompt}
                    onChange={(e) => setLlmForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                    placeholder="You are a secure agent…"
                    className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setLlmEditing(false); setLlmStatus("idle"); }}
                    className="text-sm text-vc-muted hover:text-vc-text px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={llmSaving}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Save & Push to Agent"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : llmConfig ? (
          <div className="divide-y divide-vc-border">
            {/* Realm routing banner when applicable */}
            {activeRealmRoute && (
              <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-950/30">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 shrink-0">
                  Realm Routing
                </span>
                <span className="text-sm text-vc-text font-medium">{activeRealmRoute.model.name}</span>
                <span className="text-xs text-vc-muted">via {activeRealmRoute.realm.realmName}</span>
                <a href={`/models/${activeRealmRoute.model.id}`} className="ml-auto text-xs text-violet-500 hover:text-violet-400 transition-colors shrink-0">
                  View model →
                </a>
              </div>
            )}
            {/* Registry model banner when applicable */}
            {!activeRealmRoute && activeRegistryModel && (
              <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 shrink-0">
                  Registry
                </span>
                <span className="text-sm text-vc-text font-medium">{activeRegistryModel.name}</span>
                <a href={`/models/${activeRegistryModel.id}`} className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0">
                  View model →
                </a>
              </div>
            )}
            {[
              { label: "Provider", value: PROVIDER_OPTIONS.find((p) => p.value === llmConfig.provider)?.label ?? llmConfig.provider },
              { label: "Model", value: <span className="font-mono">{llmConfig.model}</span> },
              ...(llmConfig.baseUrl ? [{ label: "Base URL", value: <span className="font-mono text-xs">{llmConfig.baseUrl}</span> }] : []),
              { label: "API Key", value: llmConfig.apiKeySet ? <span className="text-emerald-600 dark:text-emerald-500">Stored</span> : <span className="text-vc-subtle">Not set</span> },
              ...(llmConfig.maxTokens ? [{ label: "Max Tokens", value: llmConfig.maxTokens.toString() }] : []),
              ...(llmConfig.systemPrompt ? [{ label: "System Prompt", value: <span className="whitespace-pre-wrap text-vc-text-2 text-xs">{llmConfig.systemPrompt}</span> }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-3">
                <div className="w-28 flex-shrink-0 text-xs text-vc-muted uppercase pt-0.5">{label}</div>
                <div className="flex-1 text-sm text-vc-text">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-vc-muted text-sm">
              No remote config set. The agent uses its local environment variables{" "}
              <code className="text-xs bg-vc-raised px-1.5 py-0.5 rounded">LLM_PROVIDER</code>,{" "}
              <code className="text-xs bg-vc-raised px-1.5 py-0.5 rounded">LLM_MODEL</code>, etc.
            </p>
            {hasRealmRouting && (
              <p className="text-xs text-vc-muted mt-2">
                Realm routing is available — click Configure to route via your LiteLLM proxy.
              </p>
            )}
            {!hasRealmRouting && registryModels.length > 0 && (
              <p className="text-xs text-vc-muted mt-2">
                {registryModels.length} model{registryModels.length !== 1 ? "s" : ""} available in the registry — click Configure to assign one.
              </p>
            )}
          </div>
        )}
      </div>

      {llmStatus === "saved" && <p className="text-emerald-600 dark:text-emerald-500 text-xs">✓ Config saved and pushed to agent</p>}
      {llmStatus === "cleared" && <p className="text-emerald-600 dark:text-emerald-500 text-xs">✓ Config cleared</p>}
      {llmStatus === "error" && <p className="text-red-500 text-xs">Failed to update config</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Automation (Tasks + Schedules)
// ---------------------------------------------------------------------------

function AutomationTab({ agentId }: { agentId: string }) {
  return (
    <div className="space-y-8">
      <TaskSection agentId={agentId} />
      <ScheduleSection agentId={agentId} />
    </div>
  );
}

function TaskSection({ agentId }: { agentId: string }) {
  const [action, setAction] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const enqueue = async () => {
    if (!action.trim()) return;
    setStatus(null);
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setStatus(res.ok ? `Task sent: ${data.action}` : `Error: ${data.error}`);
    if (res.ok) setAction("");
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-vc-text mb-1">Enqueue Task</h2>
      <p className="text-xs text-vc-muted mb-4">Send a one-off action to the agent's task queue.</p>
      <div className="flex gap-2">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enqueue()}
          placeholder="Task action…"
          className="flex-1 px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <button
          onClick={enqueue}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
        >
          Send
        </button>
      </div>
      {status && (
        <p className={`mt-2 text-xs ${status.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{status}</p>
      )}
    </div>
  );
}

function ScheduleSection({ agentId }: { agentId: string }) {
  const [form, setForm] = useState({ id: "", name: "", cron: "", action: "" });
  const [status, setStatus] = useState<string | null>(null);

  const field = (key: keyof typeof form, placeholder: string) => (
    <div>
      <label className="text-xs text-vc-muted uppercase tracking-wider block mb-1">{placeholder}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={key === "cron" ? "*/5 * * * *" : placeholder}
        className="w-full px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      />
    </div>
  );

  const upsert = async () => {
    if (!form.id || !form.name || !form.cron || !form.action) { setStatus("All fields are required"); return; }
    setStatus(null);
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setStatus(res.ok ? `Schedule "${form.name}" sent` : `Error: ${data.error}`);
    if (res.ok) setForm({ id: "", name: "", cron: "", action: "" });
  };

  const del = async () => {
    if (!form.id) { setStatus("Enter schedule ID to delete"); return; }
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/schedules?id=${encodeURIComponent(form.id)}`, { method: "DELETE" });
    const data = await res.json();
    setStatus(res.ok ? `Schedule "${form.id}" deleted` : `Error: ${data.error}`);
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-vc-text mb-1">Manage Schedules</h2>
      <p className="text-xs text-vc-muted mb-4">Create, update, or delete cron-based agent schedules.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {field("id", "ID")}
        {field("name", "Name")}
        {field("cron", "Cron expression")}
        {field("action", "Action")}
      </div>
      <div className="flex gap-2">
        <button onClick={upsert} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors">Upsert</button>
        <button onClick={del} className="px-4 py-2 text-sm bg-red-600/80 text-white rounded-lg hover:bg-red-600 transition-colors">Delete by ID</button>
      </div>
      {status && (
        <p className={`mt-2 text-xs ${status.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{status}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Approvals
// ---------------------------------------------------------------------------

function ApprovalsTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [approvals, setApprovals] = useState<Array<{
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
    agentName?: string;
    createdAt: number;
  }>>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tool-approvals").then((r) => r.json()).catch(() => ({ approvals: [] }));
    const list = res.approvals ?? [];
    setApprovals(list);
    onCountChange(list.length);
  }, [onCountChange]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [refresh]);

  const respond = async (requestId: string, approved: boolean) => {
    await fetch("/api/tool-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, approved }),
    });
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-vc-text">Tool Approvals</h2>
          <p className="text-xs text-vc-muted mt-0.5">Review and approve or reject pending tool use requests.</p>
        </div>
        <button onClick={refresh} className="text-xs text-vc-muted hover:text-vc-text border border-vc-ring px-2.5 py-1 rounded-md transition-colors">
          ↻ Refresh
        </button>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-vc-muted gap-2">
          <ShieldCheck size={36} strokeWidth={1} />
          <p className="text-sm">No pending tool approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div key={a.requestId} className="bg-vc-raised rounded-lg p-4 border border-vc-border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-mono text-sm text-vc-text font-medium">{a.toolName}</span>
                  {a.agentName && <span className="ml-2 text-xs text-vc-muted">from {a.agentName}</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(a.requestId, true)}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => respond(a.requestId, false)}
                    className="px-3 py-1 text-xs bg-red-600/80 text-white rounded-md hover:bg-red-600 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-vc-muted">{a.reason}</p>
              <pre className="mt-2 text-xs font-mono text-vc-text-2 bg-vc-surface border border-vc-border rounded p-2 overflow-x-auto">
                {JSON.stringify(a.args, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Details (VaultysId, Certificate, Graph)
// ---------------------------------------------------------------------------

function DetailsTab({ agent, onNodeClick }: { agent: AgentDetail; onNodeClick: (node: GraphNode) => void }) {
  return (
    <div className="space-y-6">
      {/* Relationships */}
      <section>
        <h2 className="text-base font-semibold text-vc-text mb-3">Relationships</h2>
        <div className="rounded-lg overflow-hidden border border-vc-border">
          <EmbeddedAgentChart
            query={`?agent=${encodeURIComponent(agent.id)}`}
            height={380}
            targetAgentId={`agent:${agent.id}`}
            onNodeClick={onNodeClick}
          />
        </div>
      </section>

      {/* Agent VaultysId */}
      <section>
        <h2 className="text-base font-semibold text-vc-text mb-3">Agent VaultysId</h2>
        {agent.agentVaultysId ? (
          <pre className="bg-vc-raised rounded-lg border border-vc-border p-4 text-xs font-mono text-vc-text-2 overflow-x-auto">
            {JSON.stringify(agent.agentVaultysId, null, 2)}
          </pre>
        ) : (
          <p className="text-vc-muted text-sm">Not available.</p>
        )}
      </section>

      {/* Certificate */}
      <section>
        <h2 className="text-base font-semibold text-vc-text mb-3">Certificate</h2>
        {agent.certificateInfo ? (
          <pre className="bg-vc-raised rounded-lg border border-vc-border p-4 text-xs font-mono text-vc-text-2 overflow-x-auto">
            {JSON.stringify(agent.certificateInfo, null, 2)}
          </pre>
        ) : (
          <p className="text-vc-muted text-sm">No certificate stored. Agent has not completed authentication.</p>
        )}
      </section>

      {/* Activity History */}
      <section>
        <h2 className="text-base font-semibold text-vc-text mb-3">Activity History</h2>
        <p className="text-vc-muted text-sm">
          Intent execution history will be available once intent logging is implemented.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Peer Agents
// ---------------------------------------------------------------------------

interface PeerGrant {
  id: string;
  sourceDid: string;
  targetDid: string;
  targetName: string;
  skillDescription: string;
  capabilities: string[];
  expiresAt?: string;
  createdAt: string;
}

interface AgentOption {
  did: string;
  name: string;
}

function AgentChatErrorBanner({ message, code }: { message: string; code: string | null }) {
  if (code === "llm_unavailable") {
    return (
      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2.5 text-xs">
        <WifiOff size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">LLM provider unreachable</p>
          <p className="text-amber-600/80 dark:text-amber-400/70 mt-0.5 break-words">{message}</p>
          <p className="text-amber-600/60 dark:text-amber-400/50 mt-1">Update the LLM config in the <strong>Settings</strong> tab.</p>
        </div>
      </div>
    );
  }
  if (code === "agent_offline") {
    return (
      <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-lg px-3 py-2 text-xs">
        <WifiOff size={13} className="shrink-0" />
        <span>Agent disconnected — waiting to reconnect</span>
      </div>
    );
  }
  return (
    <div className="text-center text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-2">
      {message}
    </div>
  );
}

function PeerAgentsTab({ did }: { did: string }) {
  const [grants, setGrants] = useState<PeerGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);

  // New grant form
  const [targetDid, setTargetDid] = useState("");
  const [targetName, setTargetName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const fetchGrants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/peers`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { grants: PeerGrant[] };
      setGrants(data.grants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load peer grants");
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    fetchGrants();
    // Load available agents for the dropdown
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: { agents?: Array<{ id: string; name: string }> }) => {
        setAgents((data.agents ?? []).filter((a) => a.id !== did).map((a) => ({ did: a.id, name: a.name })));
      })
      .catch(() => { });
  }, [fetchGrants, did]);

  const handleTargetSelect = (selectedDid: string) => {
    setTargetDid(selectedDid);
    const found = agents.find((a) => a.did === selectedDid);
    if (found) setTargetName(found.name);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDid || !skillDescription) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDid,
          targetName: targetName || targetDid.slice(0, 12),
          skillDescription,
          capabilities: [],
          expiresAt: expiresAt || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setTargetDid("");
      setTargetName("");
      setSkillDescription("");
      setExpiresAt("");
      await fetchGrants();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create peer grant");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grantId: string) => {
    if (!confirm("Revoke this peer grant? The agent will lose access immediately.")) return;
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}/peers/${encodeURIComponent(grantId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchGrants();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke peer grant");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-vc-text mb-1">Peer Agent Communication</h2>
        <p className="text-sm text-vc-muted">
          Grants allow this agent to invoke other agents as transparent LLM tools.
          Each grant becomes a tool the LLM can call directly, with the skill description
          as its tool description.
        </p>
      </div>

      {/* Create new grant */}
      <div className="bg-vc-elevated border border-vc-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-vc-text mb-3">Grant Access to a Remote Agent</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs text-vc-muted mb-1">Target Agent</label>
            {agents.length > 0 ? (
              <select
                value={targetDid}
                onChange={(e) => handleTargetSelect(e.target.value)}
                className="w-full bg-vc-surface border border-vc-border rounded-md px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select an agent…</option>
                {agents.map((a) => (
                  <option key={a.did} value={a.did}>{a.name} ({a.did.slice(0, 16)}…)</option>
                ))}
              </select>
            ) : (
              <input
                value={targetDid}
                onChange={(e) => setTargetDid(e.target.value)}
                placeholder="did:vaultys:…"
                className="w-full bg-vc-surface border border-vc-border rounded-md px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            )}
          </div>
          {targetDid && (
            <div>
              <label className="block text-xs text-vc-muted mb-1">Display Name (for tool naming)</label>
              <input
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="e.g. Research Bot"
                className="w-full bg-vc-surface border border-vc-border rounded-md px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-vc-muted mb-1">Skill Description (shown to the LLM as tool description)</label>
            <textarea
              value={skillDescription}
              onChange={(e) => setSkillDescription(e.target.value)}
              rows={3}
              placeholder="Describe what this remote agent can do. The LLM will see this as the tool description."
              className="w-full bg-vc-surface border border-vc-border rounded-md px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-vc-muted mb-1">Expiry (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="bg-vc-surface border border-vc-border rounded-md px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={saving || !targetDid || !skillDescription}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {saving ? "Creating…" : "Grant Access"}
          </button>
        </form>
      </div>

      {/* Existing grants */}
      <div>
        <h3 className="text-sm font-semibold text-vc-text mb-3">Active Peer Grants</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-vc-muted text-sm py-4">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : grants.length === 0 ? (
          <p className="text-vc-muted text-sm py-4">No peer grants yet. Use the form above to allow this agent to call other agents.</p>
        ) : (
          <div className="space-y-2">
            {grants.map((g) => (
              <div key={g.id} className="bg-vc-elevated border border-vc-border rounded-lg p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Bot size={14} className="text-indigo-400 shrink-0" />
                    <span className="text-sm font-medium text-vc-text">{g.targetName}</span>
                    <span className="text-xs text-vc-muted font-mono">{g.targetDid.slice(0, 20)}…</span>
                  </div>
                  <p className="text-xs text-vc-muted mb-2 line-clamp-2">{g.skillDescription}</p>
                  <div className="flex items-center gap-3 text-xs text-vc-muted">
                    <span>LLM tool: <code className="text-indigo-300">ask_agent_{g.targetName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}</code></span>
                    {g.expiresAt && <span>Expires: {new Date(g.expiresAt).toLocaleDateString()}</span>}
                    <span>Created: {new Date(g.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(g.id)}
                  title="Revoke grant"
                  className="shrink-0 p-1.5 text-vc-muted hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
