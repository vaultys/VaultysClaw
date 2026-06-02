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
  BookOpen,
  RefreshCw,
  Globe2,
  ChevronDown,
  ChevronUp,
  Upload,
  File,
  FileType2,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={16} />,
  internet_access: <Globe size={16} />,
  browser_control: <Monitor size={16} />,
  api_call: <Plug size={16} />,
  mail_send: <Mail size={16} />,
  code_execution: <Code size={16} />,
  system_command: <Terminal size={16} />,
  agent_communication: <Bot size={16} />,
  knowledge_search: <BookOpen size={16} />,
};

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), {
  ssr: false,
});
const EmbeddedAgentChart = dynamic(
  () => import("@/components/graph/EmbeddedAgentChart"),
  { ssr: false }
);
const AgentEnvironmentGraph = dynamic(
  () => import("@/components/graph/AgentEnvironmentGraph"),
  { ssr: false }
);

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
  { id: "agent_communication", label: "Agent Communication" },
  { id: "knowledge_search", label: "Knowledge Search" },
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
  transport?: "ws" | "peerjs" | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
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
  thinkingContent?: string;
}

interface PendingApproval {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "pending" | "submitting" | "approved" | "rejected";
}

type TabId =
  | "overview"
  | "chat"
  | "tokens"
  | "config"
  | "governance"
  | "automation"
  | "approvals"
  | "graph"
  | "knowledge";

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
  if (!iso) return "—";
  const date = parseUTC(iso);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
    <div className="flex gap-1 border-b border-neutral-200 px-1 bg-background-100 rounded-t-xl overflow-x-auto flex-shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-primary-500 text-primary-400"
              : "border-transparent text-foreground-500 hover:text-foreground hover:border-neutral-300"
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full bg-danger-500 text-white text-[10px] font-bold px-1">
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
    if (
      !confirm(
        "⚠️ Are you sure you want to delete this agent? This action cannot be undone. The agent will be permanently removed from the system."
      )
    ) {
      return;
    }
    setDeletingAgent(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`, {
        method: "DELETE",
      });
      console.log("Delete response status:", res.status, "ok:", res.ok);
      if (res.ok) {
        router.push("/agents");
      } else {
        let errorMsg = "Failed to delete agent";
        try {
          const data = (await res.json()) as { error?: string };
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
      if (res.status === 404) {
        setError("Agent not found");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgent(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent");
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

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
    if (
      lastEvent === "agent_reconnected" ||
      lastEvent === "capabilities_updated"
    ) {
      fetchAgent();
    }
  }, [lastEvent, fetchAgent]);

  // Poll approval count for badge
  useEffect(() => {
    const refresh = async () => {
      const res = await fetch("/api/tool-approvals")
        .then((r) => r.json())
        .catch(() => ({ approvals: [] }));
      setPendingApprovals((res.approvals ?? []).length);
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-foreground-500">Loading agent details…</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button
          onClick={() => router.push("/agents")}
          className="text-primary-400 hover:text-primary-300 mb-6 inline-block text-sm"
        >
          ← Back to Agents list
        </button>
        <div className="bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-danger-600">
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
    {
      id: "approvals",
      label: "Approvals",
      icon: <AlertTriangle size={15} />,
      badge: pendingApprovals,
    },
    { id: "knowledge", label: "Knowledge", icon: <BookOpen size={15} /> },
    { id: "graph", label: "Graph", icon: <Activity size={15} /> },
  ];

  return (
    <div
      className={`p-6 w-full max-w-7xl mx-auto ${activeTab === "chat" ? "flex flex-col flex-1 min-h-0 pb-0" : "space-y-0"}`}
    >
      {/* ── Page header ── */}
      <div className="mb-4">
        <button
          onClick={() => router.push("/agents")}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Back to Agents List
        </button>

        <div className="bg-background-100 border border-neutral-200 rounded-xl px-5 py-4 flex items-center gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
            <Bot size={22} className="text-primary-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">
                {agent.name}
              </h1>
              {agent.online ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-700 bg-success-100 border border-success-300 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full" />
                  Offline
                </span>
              )}
              {agent.online && agent.transport && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 border ${
                    agent.transport === "peerjs"
                      ? "text-secondary-700 bg-secondary-100 border-secondary-300"
                      : "text-primary-700 bg-primary-100 border-primary-300"
                  }`}
                >
                  {agent.transport === "peerjs" ? "WebRTC" : "WebSocket"}
                </span>
              )}
              {(agent.reportedLlm ?? agent.storedLlm) &&
                (() => {
                  const llm = agent.reportedLlm ?? agent.storedLlm!;
                  return (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-2.5 py-0.5">
                      <Zap size={11} className="text-warning-500" />
                      <span className="text-foreground-700">
                        {llm.provider}
                      </span>
                      <span className="text-foreground-400">/</span>
                      <span className="font-mono">{llm.model}</span>
                    </span>
                  );
                })()}
            </div>
            <p className="text-xs font-mono text-foreground-500 mt-0.5 truncate">
              {agent.id}
            </p>
          </div>

          {/* Quick stats */}
          <div className="hidden sm:flex gap-6 text-right flex-shrink-0">
            <div>
              <div className="text-xs text-foreground-500 uppercase">
                Last seen
              </div>
              <div className="text-sm text-foreground">
                {timeAgo(agent.lastSeen)}
              </div>
            </div>
            {(agent.reportedLlm ?? agent.storedLlm) &&
              (() => {
                const llm = agent.reportedLlm ?? agent.storedLlm!;
                return (
                  <div>
                    <div className="text-xs text-foreground-500 uppercase">
                      LLM
                    </div>
                    <div className="text-sm text-foreground font-mono">
                      {llm.model}
                    </div>
                    <div className="text-[10px] text-foreground-400">
                      {llm.provider}
                    </div>
                  </div>
                );
              })()}
            <div>
              <div className="text-xs text-foreground-500 uppercase">
                Capabilities
              </div>
              <div className="text-sm text-foreground">
                {agent.capabilities.length}
              </div>
            </div>
            <button
              onClick={handleDeleteAgent}
              disabled={deletingAgent}
              className="ml-4 px-3 py-2 rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-500/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              title="Delete agent"
            >
              {deletingAgent ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabbed content ── */}
      <div
        className={`border border-neutral-200 rounded-xl overflow-hidden bg-background-100 ${activeTab === "chat" ? "flex flex-col flex-1 min-h-0" : ""}`}
      >
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div
          className={
            activeTab === "chat"
              ? "flex flex-col flex-1 min-h-0 overflow-hidden"
              : "p-6"
          }
        >
          {activeTab === "overview" && (
            <OverviewTab agent={agent} onTabChange={setActiveTab} />
          )}
          {activeTab === "chat" && (
            <ChatTab
              agentId={agent.id}
              agentName={agent.name}
              online={agent.online}
            />
          )}
          {activeTab === "tokens" && <TokensTab agentId={agent.id} />}
          {activeTab === "config" && (
            <ConfigTab did={did} reportedLlm={agent.reportedLlm} />
          )}
          {activeTab === "governance" && (
            <GovernanceTab did={did} agentCapabilities={agent.capabilities} />
          )}
          {activeTab === "automation" && <AutomationTab agentId={agent.id} />}
          {activeTab === "approvals" && (
            <ApprovalsTab onCountChange={setPendingApprovals} />
          )}
          {activeTab === "knowledge" && (
            <KnowledgeTab
              did={did}
              agentName={agent.name}
              online={agent.online}
              capabilities={agent.capabilities}
            />
          )}
          {activeTab === "graph" && (
            <AgentEnvironmentGraph
              agentId={agent.id}
              agentName={agent.name}
              transport={agent.transport}
              online={agent.online}
              reportedLlm={agent.reportedLlm}
              storedLlm={agent.storedLlm}
              capabilities={agent.capabilities}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  agent,
  onTabChange,
}: {
  agent: AgentDetail;
  onTabChange: (tab: TabId) => void;
}) {
  const [recentEvents, setRecentEvents] = useState<AuditEntry[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [activePolicy, setActivePolicy] = useState<PolicyEntry | null>(null);
  const [intentStats, setIntentStats] = useState<{
    success: number;
    failed: number;
    pending: number;
  } | null>(null);

  const overviewRouter = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const [auditRes, policyRes] = await Promise.all([
          fetch(
            `/api/governance/audit?agentDid=${encodeURIComponent(agent.id)}&limit=50`
          ),
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

  function TokenBar({
    used,
    budget,
    label,
  }: {
    used: number;
    budget: number | null;
    label: string;
  }) {
    const pct = budget
      ? Math.min(100, Math.round((used / budget) * 100))
      : null;
    const danger = pct !== null && pct >= 90;
    const warn = pct !== null && pct >= 70 && !danger;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-foreground-500">{label}</span>
          <span
            className={`font-mono ${danger ? "text-danger-600" : warn ? "text-warning-600" : "text-foreground"}`}
          >
            {used.toLocaleString()}
            {budget ? ` / ${budget.toLocaleString()}` : ""}
          </span>
        </div>
        {budget && (
          <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${danger ? "bg-danger-500" : warn ? "bg-warning-500" : "bg-primary-500"}`}
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
    const secs = Math.floor(
      (Date.now() - parseUTC(agent.connectedAt).getTime()) / 1000
    );
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    const h = Math.floor(secs / 3600),
      m = Math.floor((secs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const uptime = sessionUptime();

  const totalIntents = intentStats
    ? intentStats.success + intentStats.failed + intentStats.pending
    : 0;
  const successRate =
    totalIntents > 0 && intentStats
      ? Math.round((intentStats.success / totalIntents) * 100)
      : null;

  return (
    <div className="space-y-5">
      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Session uptime */}
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-foreground-500 uppercase mb-1">
            Session uptime
          </div>
          {uptime ? (
            <>
              <div className="text-2xl font-bold text-foreground">{uptime}</div>
              <div className="text-xs text-foreground-400 mt-0.5">
                since {timeAgo(agent.connectedAt)}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-foreground-500">
                Offline
              </div>
              <div className="text-xs text-foreground-400 mt-0.5">
                last seen {timeAgo(agent.lastSeen)}
              </div>
            </>
          )}
        </div>

        {/* Tokens today */}
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-foreground-500 uppercase mb-2">
            Tokens today
          </div>
          <div className="text-2xl font-bold text-foreground">
            {todayUsed.toLocaleString()}
          </div>
          {agent.tokenBudgetDaily && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-foreground-400 mb-1">
                <span>budget</span>
                <span>
                  {Math.round((todayUsed / agent.tokenBudgetDaily) * 100)}%
                </span>
              </div>
              <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    todayUsed / agent.tokenBudgetDaily >= 0.9
                      ? "bg-danger-500"
                      : todayUsed / agent.tokenBudgetDaily >= 0.7
                        ? "bg-warning-500"
                        : "bg-primary-500"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round((todayUsed / agent.tokenBudgetDaily) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
          {!agent.tokenBudgetDaily && (
            <div className="text-xs text-foreground-400 mt-1">
              no daily limit
            </div>
          )}
        </div>

        {/* Tokens this month */}
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-foreground-500 uppercase mb-2">
            Tokens this month
          </div>
          <div className="text-2xl font-bold text-foreground">
            {monthUsed.toLocaleString()}
          </div>
          {agent.tokenBudgetMonthly && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-foreground-400 mb-1">
                <span>budget</span>
                <span>
                  {Math.round((monthUsed / agent.tokenBudgetMonthly) * 100)}%
                </span>
              </div>
              <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    monthUsed / agent.tokenBudgetMonthly >= 0.9
                      ? "bg-danger-500"
                      : monthUsed / agent.tokenBudgetMonthly >= 0.7
                        ? "bg-warning-500"
                        : "bg-primary-500"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.round((monthUsed / agent.tokenBudgetMonthly) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
          {!agent.tokenBudgetMonthly && (
            <div className="text-xs text-foreground-400 mt-1">
              no monthly limit
            </div>
          )}
        </div>

        {/* Intent success rate */}
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-foreground-500 uppercase mb-1">
            Intents (recent 50)
          </div>
          {eventsLoading ? (
            <div className="flex items-center gap-1.5 text-foreground-500 text-sm mt-1">
              <Loader2 size={12} className="animate-spin" /> —
            </div>
          ) : intentStats && totalIntents > 0 ? (
            <>
              <div className="text-2xl font-bold text-foreground">
                {successRate}%
                <span className="text-sm font-normal text-foreground-500 ml-1">
                  success
                </span>
              </div>
              <div className="flex gap-3 mt-1.5 text-xs">
                <span className="flex items-center gap-1 text-success-700">
                  <CheckCircle2 size={10} />
                  {intentStats.success}
                </span>
                {intentStats.failed > 0 && (
                  <span className="flex items-center gap-1 text-danger-600">
                    <XCircle size={10} />
                    {intentStats.failed}
                  </span>
                )}
                {intentStats.pending > 0 && (
                  <span className="flex items-center gap-1 text-foreground-500">
                    <Clock size={10} />
                    {intentStats.pending}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-foreground-500">—</div>
              <div className="text-xs text-foreground-400 mt-0.5">
                no intents yet
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Lower two-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent activity */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Activity size={14} className="text-foreground-500" /> Recent
              Activity
            </h2>
            <button
              onClick={() => onTabChange("governance")}
              className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-0.5 transition-colors"
            >
              Full audit <ChevronRight size={12} />
            </button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm py-4 justify-center">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="text-xs text-foreground-400 text-center py-6">
              No activity recorded yet.
            </p>
          ) : (
            <div className="space-y-0">
              {recentEvents.map((ev, i) => {
                const isActivity = ev.source === "activity";
                return (
                  <button
                    key={ev.id}
                    onClick={() =>
                      overviewRouter.push(
                        `/governance/audit/${encodeURIComponent(ev.id)}`
                      )
                    }
                    className="w-full flex items-start gap-3 py-2.5 hover:bg-background-200 rounded-lg px-2 -mx-2 transition-colors text-left group"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          ev.status === "failed"
                            ? "bg-danger-500"
                            : ev.status === "success"
                              ? "bg-success-500"
                              : isActivity
                                ? "bg-primary-500"
                                : "bg-secondary-500"
                        }`}
                      />
                      {i < recentEvents.length - 1 && (
                        <div className="w-px flex-1 bg-neutral-200 mt-1 min-h-[12px]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate">
                          {AUDIT_LABELS[ev.event] ??
                            ev.event.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-foreground-400 flex-shrink-0">
                          {timeAgo(ev.timestamp)}
                        </span>
                      </div>
                      {ev.status === "failed" && ev.error && (
                        <p className="text-[10px] text-danger-600 truncate mt-0.5">
                          {ev.error}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active policy snapshot */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-foreground-500" /> Active
              Policy
            </h2>
            <button
              onClick={() => onTabChange("governance")}
              className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-0.5 transition-colors"
            >
              Manage <ChevronRight size={12} />
            </button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm py-4 justify-center">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : !activePolicy ? (
            <div className="text-center py-6 space-y-2">
              <ShieldCheck size={26} className="mx-auto text-neutral-200" />
              <p className="text-xs text-foreground-400">
                No policy — agent is locked and cannot execute actions.
              </p>
              <button
                onClick={() => onTabChange("governance")}
                className="text-xs text-primary-500 hover:text-primary-400 transition-colors"
              >
                Create a policy →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Capabilities */}
              <div>
                <p className="text-[10px] text-foreground-400 uppercase tracking-wider mb-2">
                  Capabilities
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activePolicy.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                    >
                      {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                      {cap.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Resource limits */}
              {activePolicy.resourceLimits &&
                Object.keys(activePolicy.resourceLimits).length > 0 && (
                  <div>
                    <p className="text-[10px] text-foreground-400 uppercase tracking-wider mb-2">
                      Resource limits
                    </p>
                    <div className="space-y-2">
                      {activePolicy.resourceLimits.maxTokensPerDay != null && (
                        <TokenBar
                          used={todayUsed}
                          budget={activePolicy.resourceLimits.maxTokensPerDay}
                          label="Tokens today"
                        />
                      )}
                      {activePolicy.resourceLimits.maxRequestsPerHour !=
                        null && (
                        <div className="flex justify-between text-xs">
                          <span className="text-foreground-500">
                            Max requests / hour
                          </span>
                          <span className="font-mono text-foreground">
                            {activePolicy.resourceLimits.maxRequestsPerHour}
                          </span>
                        </div>
                      )}
                      {activePolicy.resourceLimits.allowedDomains &&
                        activePolicy.resourceLimits.allowedDomains.length >
                          0 && (
                          <div className="flex justify-between text-xs gap-4">
                            <span className="text-foreground-500 flex-shrink-0">
                              Allowed domains
                            </span>
                            <span className="font-mono text-foreground text-right text-[11px] break-all">
                              {activePolicy.resourceLimits.allowedDomains.join(
                                ", "
                              )}
                            </span>
                          </div>
                        )}
                    </div>
                  </div>
                )}

              {/* Expiry */}
              {activePolicy.expiresAt && (
                <div
                  className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                    new Date(activePolicy.expiresAt) < new Date()
                      ? "bg-danger-50 border-danger-200 text-danger-600"
                      : "bg-warning-50 border-warning-200 text-warning-700"
                  }`}
                >
                  <CalendarDays size={12} />
                  {formatExpiry(activePolicy.expiresAt)}
                </div>
              )}

              {/* Policy meta */}
              <p className="text-[10px] font-mono text-foreground-400">
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

const EMPTY_LIMITS = {
  maxTokensPerDay: "",
  maxRequestsPerHour: "",
  allowedDomains: "",
};

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

function GovernanceTab({
  did,
  agentCapabilities,
}: {
  did: string;
  agentCapabilities: string[];
}) {
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
      const rl =
        renewTarget.resourceLimits &&
        Object.keys(renewTarget.resourceLimits).length > 0
          ? renewTarget.resourceLimits
          : undefined;
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: renewTarget.agentDid,
          capabilities: renewTarget.capabilities,
          resourceLimits: rl,
          expiresAt: renewExpiry
            ? new Date(renewExpiry).toISOString()
            : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setRenewError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      if (renewRevokeOriginal) {
        await fetch(`/api/policies/${encodeURIComponent(renewTarget.id)}`, {
          method: "DELETE",
        });
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
  const [auditSourceFilter, setAuditSourceFilter] = useState<
    "" | "activity" | "intent"
  >("");
  const [auditStatusFilter, setAuditStatusFilter] = useState<
    "" | "success" | "failed"
  >("");
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

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/policies?agentDid=${encodeURIComponent(did)}`
      );
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
      }
    } finally {
      setLoadingPolicies(false);
    }
  }, [did]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const openForm = () => {
    setFormCaps([...agentCapabilities]);
    setFormLimits(EMPTY_LIMITS);
    setFormExpiry("");
    setFormError(null);
    setShowForm(true);
  };

  const savePolicy = async () => {
    if (formCaps.length === 0) {
      setFormError("Select at least one capability.");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const resourceLimits: Record<string, unknown> = {};
      if (formLimits.maxTokensPerDay !== "")
        resourceLimits.maxTokensPerDay = Number(formLimits.maxTokensPerDay);
      if (formLimits.maxRequestsPerHour !== "")
        resourceLimits.maxRequestsPerHour = Number(
          formLimits.maxRequestsPerHour
        );
      if (formLimits.allowedDomains.trim() !== "") {
        resourceLimits.allowedDomains = formLimits.allowedDomains
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
      }
      const body: Record<string, unknown> = {
        agentDid: did,
        capabilities: formCaps,
        resourceLimits:
          Object.keys(resourceLimits).length > 0 ? resourceLimits : undefined,
        expiresAt:
          formExpiry !== "" ? new Date(formExpiry).toISOString() : undefined,
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
      await fetch(`/api/policies/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
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
          <h2 className="text-sm font-semibold text-foreground">Policies</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Policies define which capabilities and resource limits are embedded
            in the agent&apos;s certificate. Creating or revoking a policy
            immediately triggers a certificate reissue for connected agents.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openForm}
            className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus size={13} /> New Policy
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              New Policy
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-foreground-500 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-xs text-foreground-500 uppercase mb-2">
              Capabilities
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => {
                const active = formCaps.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() =>
                      setFormCaps(
                        active
                          ? formCaps.filter((c) => c !== cap.id)
                          : [...formCaps, cap.id]
                      )
                    }
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${
                      active
                        ? "bg-primary-100 border-primary-500 text-primary-700"
                        : "bg-background-100 border-neutral-300 text-foreground-500 hover:border-foreground-500"
                    }`}
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
            <p className="text-xs text-foreground-500 uppercase mb-2">
              Resource Limits{" "}
              <span className="normal-case text-foreground-400">
                (optional)
              </span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-foreground-500">
                  Max tokens / day
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  value={formLimits.maxTokensPerDay}
                  onChange={(e) =>
                    setFormLimits((l) => ({
                      ...l,
                      maxTokensPerDay: e.target.value,
                    }))
                  }
                  className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-foreground-500">
                  Max requests / hour
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 60"
                  value={formLimits.maxRequestsPerHour}
                  onChange={(e) =>
                    setFormLimits((l) => ({
                      ...l,
                      maxRequestsPerHour: e.target.value,
                    }))
                  }
                  className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-foreground-500">
                  Allowed domains{" "}
                  <span className="text-foreground-400">(comma-separated)</span>
                </span>
                <input
                  type="text"
                  placeholder="e.g. api.openai.com, example.com"
                  value={formLimits.allowedDomains}
                  onChange={(e) =>
                    setFormLimits((l) => ({
                      ...l,
                      allowedDomains: e.target.value,
                    }))
                  }
                  className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
                />
              </label>
            </div>
          </div>

          {/* Expiry */}
          <label className="block space-y-1">
            <span className="text-xs text-foreground-500 uppercase">
              Expiry{" "}
              <span className="normal-case text-foreground-400">
                (optional)
              </span>
            </span>
            <input
              type="datetime-local"
              value={formExpiry}
              onChange={(e) => setFormExpiry(e.target.value)}
              className="bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
            />
          </label>

          {formError && (
            <p className="text-xs text-danger-600 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              {formError}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-foreground-500 hover:text-foreground px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={savePolicy}
              disabled={formSaving}
              className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors"
            >
              {formSaving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ShieldCheck size={13} />
              )}
              {formSaving ? "Applying…" : "Apply Policy"}
            </button>
          </div>
        </div>
      )}

      {/* Policy list */}
      {loadingPolicies ? (
        <div className="flex items-center gap-2 text-foreground-500 text-sm py-4">
          <Loader2 size={14} className="animate-spin" /> Loading policies…
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-10 text-foreground-500 text-sm border border-dashed border-neutral-200 rounded-xl">
          <ShieldCheck size={28} className="mx-auto mb-2 opacity-30" />
          No active policies. Create one above to grant capabilities and set
          limits.
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div
              key={p.id}
              className="bg-background-200 border border-neutral-200 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 flex-1 min-w-0">
                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1.5">
                    {p.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                      >
                        {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                        {cap.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>

                  {/* Resource limits */}
                  {p.resourceLimits &&
                    Object.keys(p.resourceLimits).length > 0 && (
                      <div className="flex flex-wrap gap-3 text-xs text-foreground-500">
                        {p.resourceLimits.maxTokensPerDay != null && (
                          <span className="flex items-center gap-1">
                            <TrendingUp
                              size={11}
                              className="text-warning-600"
                            />
                            {p.resourceLimits.maxTokensPerDay.toLocaleString()}{" "}
                            tokens/day
                          </span>
                        )}
                        {p.resourceLimits.maxRequestsPerHour != null && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} className="text-warning-600" />
                            {p.resourceLimits.maxRequestsPerHour} req/h
                          </span>
                        )}
                        {p.resourceLimits.allowedDomains &&
                          p.resourceLimits.allowedDomains.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Globe size={11} className="text-warning-600" />
                              {p.resourceLimits.allowedDomains.join(", ")}
                            </span>
                          )}
                      </div>
                    )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-foreground-400">
                    <span>Created {timeAgo(p.createdAt)}</span>
                    {p.createdBy && (
                      <span>
                        by{" "}
                        <code className="font-mono">
                          {p.createdBy.slice(0, 20)}…
                        </code>
                      </span>
                    )}
                    {p.expiresAt && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {formatExpiry(p.expiresAt)}
                      </span>
                    )}
                    <code className="font-mono text-foreground-400/60">
                      {p.id}
                    </code>
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1.5">
                  <button
                    onClick={() => openRenew(p)}
                    className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-500 border border-primary-300 hover:border-primary-400 px-2.5 py-1.5 rounded-md transition-colors"
                    title="Renew policy"
                  >
                    <RotateCcw size={12} /> Renew
                  </button>
                  <button
                    onClick={() => revokePolicy(p.id)}
                    disabled={revoking === p.id}
                    className="flex items-center gap-1.5 text-xs text-danger-600 hover:text-danger-500:text-danger-300 border border-danger-300 hover:border-danger-400:border-danger-500/40 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
                  >
                    {revoking === p.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
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
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <RotateCcw size={15} className="text-primary-500" /> Renew
                policy
              </span>
              <button
                onClick={() => setRenewTarget(null)}
                className="text-foreground-400 hover:text-foreground p-1 rounded-lg hover:bg-background-200 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Capabilities summary */}
              <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {renewTarget.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                    >
                      {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                      {cap.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                {renewTarget.resourceLimits &&
                  (renewTarget.resourceLimits.maxTokensPerDay ||
                    renewTarget.resourceLimits.maxRequestsPerHour) && (
                    <p className="text-xs text-foreground-500">
                      {renewTarget.resourceLimits.maxTokensPerDay
                        ? `${renewTarget.resourceLimits.maxTokensPerDay.toLocaleString()} tok/d`
                        : ""}
                      {renewTarget.resourceLimits.maxTokensPerDay &&
                      renewTarget.resourceLimits.maxRequestsPerHour
                        ? " · "
                        : ""}
                      {renewTarget.resourceLimits.maxRequestsPerHour
                        ? `${renewTarget.resourceLimits.maxRequestsPerHour} req/h`
                        : ""}
                    </p>
                  )}
                {renewTarget.expiresAt && (
                  <p className="text-xs text-warning-600">
                    Original expiry:{" "}
                    {new Date(
                      renewTarget.expiresAt.endsWith("Z")
                        ? renewTarget.expiresAt
                        : renewTarget.expiresAt + "Z"
                    ).toLocaleString()}
                  </p>
                )}
              </div>
              {/* New expiry */}
              <div className="space-y-1.5">
                <label className="text-xs text-foreground-500 font-medium">
                  New expiry date
                </label>
                <input
                  type="datetime-local"
                  value={renewExpiry}
                  onChange={(e) => setRenewExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex gap-1.5 mt-1">
                  {([7, 30, 90, 365] as const).map((days) => {
                    const pad = (n: number) => String(n).padStart(2, "0");
                    const d = new Date(Date.now() + days * 86_400_000);
                    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setRenewExpiry(val)}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600:text-primary-400 hover:border-primary-400 transition-colors"
                      >
                        +{days}d
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Revoke original */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={renewRevokeOriginal}
                  onChange={(e) => setRenewRevokeOriginal(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary-600"
                />
                <span className="text-xs text-foreground-500 group-hover:text-foreground transition-colors">
                  Revoke original policy after renewal
                </span>
              </label>
              {renewError && (
                <p className="text-xs text-danger-500">{renewError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button
                onClick={() => setRenewTarget(null)}
                className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRenew}
                disabled={renewSaving || !renewExpiry}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {renewSaving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RotateCcw size={13} />
                )}
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
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Activity size={14} className="text-foreground-500" /> Audit Trail
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              All activity and intent events for this agent. Click any row for
              full detail.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Source filter */}
            <div className="flex rounded-md overflow-hidden border border-neutral-300 text-xs">
              {(["", "activity", "intent"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditSourceFilter(s)}
                  className={`px-2.5 py-1 transition-colors ${
                    auditSourceFilter === s
                      ? "bg-primary-600 text-white"
                      : "bg-background-100 text-foreground-500 hover:text-foreground"
                  }`}
                >
                  {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex rounded-md overflow-hidden border border-neutral-300 text-xs">
              {(["", "success", "failed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditStatusFilter(s)}
                  className={`px-2.5 py-1 transition-colors ${
                    auditStatusFilter === s
                      ? "bg-primary-600 text-white"
                      : "bg-background-100 text-foreground-500 hover:text-foreground"
                  }`}
                >
                  {s === ""
                    ? "Any status"
                    : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAudit}
              className="text-xs text-foreground-500 hover:text-foreground px-2 py-1 rounded-md border border-neutral-300 bg-background-100 transition-colors"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Table */}
        {auditLoading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm py-6 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading audit trail…
          </div>
        ) : auditEntries.length === 0 ? (
          <div className="text-center py-10 text-foreground-500 text-sm border border-dashed border-neutral-200 rounded-xl">
            <Activity size={28} className="mx-auto mb-2 opacity-30" />
            No audit events found for this agent.
          </div>
        ) : (
          (() => {
            const totalPages = Math.ceil(auditEntries.length / AUDIT_PAGE_SIZE);
            const page = Math.min(auditPage, totalPages - 1);
            const slice = auditEntries.slice(
              page * AUDIT_PAGE_SIZE,
              (page + 1) * AUDIT_PAGE_SIZE
            );
            return (
              <div className="space-y-2">
                <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium w-24">
                          Source
                        </th>
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium">
                          Event
                        </th>
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium w-24">
                          Status
                        </th>
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium w-36">
                          Time
                        </th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {slice.map((entry) => {
                        const isActivity = entry.source === "activity";
                        return (
                          <tr
                            key={entry.id}
                            onClick={() =>
                              router.push(
                                `/governance/audit/${encodeURIComponent(entry.id)}`
                              )
                            }
                            className="cursor-pointer hover:bg-background-200 transition-colors group"
                          >
                            {/* Source badge */}
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                  isActivity
                                    ? "bg-primary-100 text-primary-700 border-primary-300"
                                    : "bg-secondary-100 text-secondary-700 border-secondary-300"
                                }`}
                              >
                                {isActivity ? (
                                  <Activity size={9} />
                                ) : (
                                  <FileText size={9} />
                                )}
                                {entry.source}
                              </span>
                            </td>
                            {/* Event name */}
                            <td className="px-3 py-2.5 text-foreground">
                              {AUDIT_LABELS[entry.event] ??
                                entry.event.replace(/_/g, " ")}
                            </td>
                            {/* Status */}
                            <td className="px-3 py-2.5">
                              {entry.status === "success" && (
                                <span className="flex items-center gap-1 text-success-700">
                                  <CheckCircle2 size={11} /> success
                                </span>
                              )}
                              {entry.status === "failed" && (
                                <span className="flex items-center gap-1 text-danger-600">
                                  <XCircle size={11} /> failed
                                </span>
                              )}
                              {entry.status &&
                                entry.status !== "success" &&
                                entry.status !== "failed" && (
                                  <span className="flex items-center gap-1 text-warning-600">
                                    <Clock size={11} /> {entry.status}
                                  </span>
                                )}
                              {!entry.status && (
                                <span className="text-foreground-400">—</span>
                              )}
                            </td>
                            {/* Timestamp */}
                            <td className="px-3 py-2.5 text-foreground-500">
                              {timeAgo(entry.timestamp)}
                            </td>
                            {/* Arrow */}
                            <td className="pr-3">
                              <ChevronRight
                                size={13}
                                className="text-foreground-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-foreground-500 px-1">
                    <span>
                      {auditEntries.length} events · page {page + 1} of{" "}
                      {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setAuditPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                        className="px-2.5 py-1 rounded border border-neutral-300 bg-background-100 hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        ‹ Prev
                      </button>
                      <button
                        onClick={() =>
                          setAuditPage(Math.min(totalPages - 1, page + 1))
                        }
                        disabled={page >= totalPages - 1}
                        className="px-2.5 py-1 rounded border border-neutral-300 bg-background-100 hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
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

  const fetchData = useCallback(
    async (g: TokenGranularity, p: TokenPeriod) => {
      setLoading(true);
      setTokenError(null);
      try {
        const today = new Date();
        let from: string;
        if (p === "7d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 6);
          from = d.toISOString().slice(0, 10);
        } else if (p === "30d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 29);
          from = d.toISOString().slice(0, 10);
        } else if (p === "3m") {
          const d = new Date(today);
          d.setMonth(d.getMonth() - 2);
          from =
            g === "month"
              ? d.toISOString().slice(0, 7)
              : d.toISOString().slice(0, 10);
        } else {
          const d = new Date(today);
          d.setMonth(d.getMonth() - 11);
          from =
            g === "month"
              ? d.toISOString().slice(0, 7)
              : d.toISOString().slice(0, 10);
        }
        const to =
          g === "month"
            ? today.toISOString().slice(0, 7)
            : today.toISOString().slice(0, 10);
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
    },
    [agentId]
  );

  useEffect(() => {
    fetchData(granularity, period);
  }, [fetchData, granularity, period]);

  const total = data.reduce(
    (acc, r) => ({
      prompt: acc.prompt + r.promptTokens,
      completion: acc.completion + r.completionTokens,
    }),
    { prompt: 0, completion: 0 }
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-background-100 p-0.5">
          {(["7d", "30d", "3m", "12m"] as TokenPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p === "3m" || p === "12m") setGranularity("month");
                else setGranularity("day");
              }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                period === p
                  ? "bg-primary text-white"
                  : "text-foreground-500 hover:text-foreground hover:bg-background-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-background-100 p-0.5">
          {(["day", "month"] as TokenGranularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${
                granularity === g
                  ? "bg-primary text-white"
                  : "text-foreground-500 hover:text-foreground hover:bg-background-100"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <p className="text-xs text-foreground-500 mb-1">Input tokens</p>
          <p className="text-xl font-semibold text-foreground">
            {total.prompt.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <p className="text-xs text-foreground-500 mb-1">Output tokens</p>
          <p className="text-xl font-semibold text-foreground">
            {total.completion.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <p className="text-xs text-foreground-500 mb-1">Total tokens</p>
          <p className="text-xl font-semibold text-foreground">
            {(total.prompt + total.completion).toLocaleString()}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-foreground-500">
          <Loader2 className="animate-spin w-5 h-5 mr-2" /> Loading…
        </div>
      )}
      {tokenError && <p className="text-danger-600 text-sm">{tokenError}</p>}
      {!loading && !tokenError && data.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.07)"
              />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v: string) =>
                  granularity === "month" ? v.slice(0, 7) : v.slice(5)
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1f",
                  border: "1px solid #2d2d35",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="promptTokens"
                name="Input"
                fill="primary"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="completionTokens"
                name="Output"
                fill="#818cf8"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !tokenError && data.length === 0 && (
        <div className="text-center py-12 text-foreground-500 text-sm">
          No token data for this period.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThinkingBlock
// ---------------------------------------------------------------------------

function ThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  return (
    <details className="mb-2 text-xs border border-neutral-200/50 rounded-lg overflow-hidden">
      <summary className="px-3 py-1.5 cursor-pointer select-none flex items-center gap-1.5 bg-background-100/50 hover:bg-background-100 transition-colors list-none text-foreground-500">
        {isStreaming ? (
          <span className="animate-pulse">Thinking…</span>
        ) : (
          <span>View reasoning</span>
        )}
      </summary>
      <pre className="whitespace-pre-wrap font-mono text-xs text-foreground-500 bg-background-100 p-3 m-0 leading-relaxed">
        {content}
      </pre>
    </details>
  );
}

// ---------------------------------------------------------------------------
// ToolApprovalCard
// ---------------------------------------------------------------------------

function ToolApprovalCard({
  approval,
  onRespond,
}: {
  approval: PendingApproval;
  onRespond: (approved: boolean) => Promise<void>;
}) {
  const isDone =
    approval.status === "approved" || approval.status === "rejected";
  const isSubmitting = approval.status === "submitting";
  return (
    <div className="mx-auto max-w-[75%] rounded-xl border border-warning-500/30 bg-warning-950/20 p-3 text-sm">
      <p className="text-xs font-medium text-warning-400 mb-2">
        Tool approval required:{" "}
        <span className="font-mono">{approval.toolName}</span>
      </p>
      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-foreground-500 hover:text-foreground select-none list-none">
          View arguments
        </summary>
        <pre className="mt-1 text-xs font-mono bg-background border border-neutral-200 rounded p-2 overflow-x-auto text-foreground whitespace-pre-wrap">
          {JSON.stringify(approval.args, null, 2)}
        </pre>
      </details>
      {isDone ? (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            approval.status === "approved"
              ? "bg-success-950/40 text-success-400 border border-success-500/30"
              : "bg-danger-950/40 text-danger-400 border border-danger-500/30"
          }`}
        >
          {approval.status === "approved" ? (
            <CheckCircle2 size={11} />
          ) : (
            <XCircle size={11} />
          )}
          {approval.status === "approved" ? "Approved" : "Rejected"}
        </span>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={isSubmitting}
            onClick={() => onRespond(true)}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-success-600 text-white hover:bg-success-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <CheckCircle2 size={11} />
            )}
            Approve
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => onRespond(false)}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-danger-700 text-white hover:bg-danger-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <XCircle size={11} />
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatTab
// ---------------------------------------------------------------------------

function ChatTab({
  agentId,
  agentName,
  online,
}: {
  agentId: string;
  agentName: string;
  online: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  );
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
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/chat-sessions`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { sessions: ChatSessionMeta[] };
      setSessions(data.sessions ?? []);
    } catch {
      /* non-fatal */
    }
  }, [agentId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/chat-sessions?session=${encodeURIComponent(sessionId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: Array<{ role: string; content: string }>;
        };
        setMessages(
          (data.messages ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
        );
        setActiveSessionId(sessionId);
        setError(null);
      } catch {
        /* non-fatal */
      }
    },
    [agentId]
  );

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
          body: JSON.stringify({
            agentDid: agentId,
            messages: updatedMessages,
            sessionId: activeSessionId ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = (await res
            .json()
            .catch(() => ({ error: "Request failed" }))) as {
            error?: string;
            errorCode?: string;
          };
          setErrorCode(errBody.errorCode ?? null);
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let assistantContent = "";
        let currentThinkingContent = "";
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
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) {
              if (line === "") eventType = "message";
              continue;
            }
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (eventType === "session") {
                if (typeof parsed.conversationId === "string")
                  setActiveSessionId(parsed.conversationId);
                eventType = "message";
                continue;
              }
              if (eventType === "tool_approval") {
                setPendingApprovals((prev) => [
                  ...prev,
                  {
                    requestId: parsed.requestId,
                    toolName: parsed.toolName,
                    args: parsed.args ?? {},
                    status: "pending" as const,
                  },
                ]);
                eventType = "message";
                continue;
              }
              if (parsed.error) {
                setErrorCode(parsed.errorCode ?? null);
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                if (parsed.thinking) {
                  currentThinkingContent += parsed.text;
                } else {
                  assistantContent += parsed.text;
                }
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                    ...(currentThinkingContent
                      ? { thinkingContent: currentThinkingContent }
                      : {}),
                  };
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
          prev[prev.length - 1]?.role === "assistant" &&
          !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        fetchSessions().catch(() => {});
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
    setPendingApprovals([]);
  };

  if (!online) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-foreground-500">
        <Bot size={40} strokeWidth={1} />
        <p className="text-sm">{agentName} is offline — chat unavailable</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sessions sidebar */}
      <div className="w-44 flex-shrink-0 flex flex-col border-r border-neutral-200 bg-background-200 rounded-l-lg overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2 border-b border-neutral-200">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-widest">
            History
          </span>
          <button
            onClick={startNew}
            className="text-xs text-primary-400 hover:text-primary-300 transition-colors font-medium"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-[10px] text-foreground-400 text-center mt-4 px-2">
              No past sessions
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full text-left px-2 py-2 border-b border-neutral-200/50 hover:bg-background-100 transition-colors ${
                activeSessionId === s.id
                  ? "bg-primary-900/20 border-l-2 border-l-indigo-500"
                  : ""
              }`}
            >
              <p className="text-[11px] text-foreground truncate leading-tight">
                {s.title ?? "Untitled"}
              </p>
              <p className="text-[9px] text-foreground-400 mt-0.5">
                {s.messageCount} msg · {s.source}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 flex-shrink-0">
          <p className="text-xs text-foreground-500">
            {activeSessionId ? (
              <span>
                Session{" "}
                <span className="font-mono text-foreground-400">
                  {activeSessionId.slice(0, 8)}…
                </span>
              </span>
            ) : (
              <span>
                New conversation with{" "}
                <span className="text-foreground font-medium">{agentName}</span>
              </span>
            )}
          </p>
          {messages.length > 0 && (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-danger-400 transition-colors"
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 p-3">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-foreground-500">
              <Bot size={36} strokeWidth={1} />
              <p className="text-sm">
                Send a message to start the conversation
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed prose prose-sm prose-invert max-w-none ${
                  msg.role === "user"
                    ? "bg-primary-600/25 text-foreground rounded-br-sm prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-primary-950/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-primary-950/30 prose-pre:border prose-pre:border-primary-500/20 prose-pre:text-primary-100"
                    : "bg-background-200 border border-neutral-200 text-foreground rounded-bl-sm prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-background prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-background prose-pre:border prose-pre:border-neutral-200 prose-pre:text-foreground"
                }`}
              >
                {msg.role === "assistant" && msg.thinkingContent && (
                  <ThinkingBlock
                    content={msg.thinkingContent}
                    isStreaming={isStreaming && i === messages.length - 1}
                  />
                )}
                {msg.content ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="m-0">{children}</p>,
                      ul: ({ children }) => (
                        <ul className="m-0 pl-4 list-disc">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="m-0 pl-4 list-decimal">{children}</ol>
                      ),
                      li: ({ children }) => <li className="m-0">{children}</li>,
                      code: ({ children }) => (
                        <code
                          className={`px-1 py-0.5 rounded text-sm font-mono ${
                            msg.role === "user"
                              ? "bg-primary-950/30 text-primary-200"
                              : "bg-background text-foreground"
                          }`}
                        >
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre
                          className={`p-2 rounded text-xs overflow-x-auto my-1 border ${
                            msg.role === "user"
                              ? "bg-primary-950/30 border-primary-500/20 text-primary-100"
                              : "bg-background border-neutral-200 text-foreground"
                          }`}
                        >
                          {children}
                        </pre>
                      ),
                      h1: ({ children }) => (
                        <h1 className="text-base font-bold mt-2 mb-1">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-sm font-bold mt-2 mb-1">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-xs font-bold mt-1 mb-0.5">
                          {children}
                        </h3>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote
                          className={`pl-2 border-l-2 my-1 ${
                            msg.role === "user"
                              ? "border-primary-500/50"
                              : "border-neutral-200"
                          }`}
                        >
                          {children}
                        </blockquote>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          className="text-primary-400 underline hover:text-primary-300"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.role === "assistant" &&
                  isStreaming && (
                    <span className="inline-flex gap-1 text-foreground-500">
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      >
                        ·
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      >
                        ·
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      >
                        ·
                      </span>
                    </span>
                  )
                )}
              </div>
            </div>
          ))}

          {pendingApprovals.map((a) => (
            <ToolApprovalCard
              key={a.requestId}
              approval={a}
              onRespond={async (approved) => {
                setPendingApprovals((prev) =>
                  prev.map((x) =>
                    x.requestId === a.requestId
                      ? { ...x, status: "submitting" as const }
                      : x
                  )
                );
                try {
                  const res = await fetch("/api/tool-approvals", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ requestId: a.requestId, approved }),
                  });
                  if (!res.ok) throw new Error("Request failed");
                  setPendingApprovals((prev) =>
                    prev.map((x) =>
                      x.requestId === a.requestId
                        ? {
                            ...x,
                            status: approved
                              ? ("approved" as const)
                              : ("rejected" as const),
                          }
                        : x
                    )
                  );
                } catch {
                  setPendingApprovals((prev) =>
                    prev.map((x) =>
                      x.requestId === a.requestId
                        ? { ...x, status: "pending" as const }
                        : x
                    )
                  );
                }
              }}
            />
          ))}

          {error && <AgentChatErrorBanner message={error} code={errorCode} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-neutral-200 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-background-200 border border-neutral-200 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-500 transition-colors"
            >
              {isStreaming ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Send size={17} />
              )}
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

const PROVIDER_OPTIONS: {
  value: LlmProviderType;
  label: string;
  needsKey: boolean;
  needsUrl: boolean;
}[] = [
  { value: "openai", label: "OpenAI", needsKey: true, needsUrl: false },
  { value: "anthropic", label: "Anthropic", needsKey: true, needsUrl: false },
  { value: "google", label: "Google Gemini", needsKey: true, needsUrl: false },
  { value: "ollama", label: "Ollama (local)", needsKey: false, needsUrl: true },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible",
    needsKey: true,
    needsUrl: true,
  },
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
  openai: "bg-success-100 text-success-700 border-success-300",
  "openai-compatible": "bg-primary-100 text-primary-700 border-primary-300",
  anthropic: "bg-warning-100 text-warning-700 border-warning-300",
  google: "bg-warning-100 text-warning-700 border-warning-300",
  ollama: "bg-secondary-100 text-secondary-700 border-secondary-300",
};

function ConfigTab({
  did,
  reportedLlm,
}: {
  did: string;
  reportedLlm: { provider: string; model: string } | null;
}) {
  const [llmConfig, setLlmConfig] = useState<LlmConfigDisplay | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmEditing, setLlmEditing] = useState(false);
  const [configMode, setConfigMode] = useState<"realm" | "registry" | "manual">(
    "realm"
  );
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
  const [llmStatus, setLlmStatus] = useState<
    "idle" | "saved" | "cleared" | "error"
  >("idle");

  useEffect(() => {
    Promise.all([
      fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`).then((r) =>
        r.json()
      ),
      fetch("/api/models").then((r) => r.json()),
      fetch(`/api/agents/${encodeURIComponent(did)}/realm-llm`).then((r) =>
        r.json()
      ),
    ])
      .then(
        ([configData, modelsData, realmData]: [
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
        }
      )
      .catch(() => {})
      .finally(() => setLlmLoading(false));
  }, [did]);

  function openEdit() {
    if (llmConfig?.provider === "openai-compatible") {
      // Check if the current model matches a realm LiteLLM route
      const realmWithModel = realmLlmData?.realms.find(
        (r) =>
          r.hasVirtualKey &&
          r.models.some((m) => m.litellmModelName === llmConfig.model)
      );
      if (realmWithModel) {
        const realmModel = realmWithModel.models.find(
          (m) => m.litellmModelName === llmConfig.model
        );
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
      const hasRealmRouting = realmLlmData?.realms.some(
        (r) => r.hasVirtualKey && r.models.length > 0
      );
      if (hasRealmRouting) {
        const firstRealm = realmLlmData!.realms.find(
          (r) => r.hasVirtualKey && r.models.length > 0
        )!;
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
      const res = await fetch(
        `/api/agents/${encodeURIComponent(did)}/llm-config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId: selectedRealmId,
            realmModelId: selectedRealmModelId,
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { config: LlmConfigDisplay };
        setLlmConfig(data.config);
        setLlmEditing(false);
        setLlmStatus("saved");
        setTimeout(() => setLlmStatus("idle"), 2500);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Failed to save realm routing config");
        setLlmStatus("error");
      }
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveRegistryModel() {
    if (!selectedRegistryId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(did)}/llm-config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registryModelId: selectedRegistryId }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { config: LlmConfigDisplay };
        setLlmConfig(data.config);
        setLlmEditing(false);
        setLlmStatus("saved");
        setTimeout(() => setLlmStatus("idle"), 2500);
      } else {
        setLlmStatus("error");
      }
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveManualConfig(e: React.FormEvent) {
    e.preventDefault();
    setLlmSaving(true);
    setLlmStatus("idle");
    try {
      const body: Record<string, unknown> = {
        provider: llmForm.provider,
        model: llmForm.model,
      };
      if (llmForm.apiKey) body.apiKey = llmForm.apiKey;
      if (llmForm.baseUrl) body.baseUrl = llmForm.baseUrl;
      if (llmForm.systemPrompt) body.systemPrompt = llmForm.systemPrompt;
      if (llmForm.maxTokens) body.maxTokens = parseInt(llmForm.maxTokens, 10);
      const res = await fetch(
        `/api/agents/${encodeURIComponent(did)}/llm-config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { config: LlmConfigDisplay };
        setLlmConfig(data.config);
        setLlmEditing(false);
        setLlmStatus("saved");
        setTimeout(() => setLlmStatus("idle"), 2500);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Failed to save LLM config");
        setLlmStatus("error");
      }
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  const selectedProvider = PROVIDER_OPTIONS.find(
    (p) => p.value === llmForm.provider
  )!;
  const activeRegistryModel =
    llmConfig?.provider === "openai-compatible"
      ? registryModels.find((m) => m.modelId === llmConfig.model)
      : null;

  // Detect realm routing: config model matches a litellm_model_name in a realm
  const activeRealmRoute =
    llmConfig?.provider === "openai-compatible"
      ? (() => {
          for (const realm of realmLlmData?.realms ?? []) {
            const model = realm.models.find(
              (m) => m.litellmModelName === llmConfig.model
            );
            if (model) return { realm, model };
          }
          return null;
        })()
      : null;

  const hasRealmRouting = Boolean(
    realmLlmData?.litellmConfigured &&
    realmLlmData.realms.some((r) => r.hasVirtualKey && r.models.length > 0)
  );

  if (llmLoading)
    return <p className="text-foreground-500 text-sm">Loading…</p>;

  return (
    <div className="space-y-5">
      {/* Agent-reported active LLM */}
      {reportedLlm && (
        <div className="bg-background-200 rounded-lg border border-neutral-200 px-4 py-3">
          <div className="text-xs text-foreground-500 uppercase tracking-wider font-medium mb-1.5">
            Agent Active LLM
          </div>
          <div className="flex items-center gap-3">
            <code className="text-sm font-mono text-primary-400">
              {reportedLlm.provider}/{reportedLlm.model}
            </code>
            <span className="text-xs text-foreground-400">
              reported by agent{llmConfig ? "" : " (local env config)"}
            </span>
          </div>
        </div>
      )}

      {/* Current config display */}
      <div className="rounded-xl border border-neutral-200 bg-background-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              LLM Configuration
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              Pushed to the agent remotely on save
            </p>
          </div>
          {!llmEditing && (
            <div className="flex items-center gap-2">
              {llmConfig && (
                <button
                  onClick={async () => {
                    if (
                      !confirm(
                        "Clear LLM config? The agent will fall back to its local environment variables."
                      )
                    )
                      return;
                    setLlmSaving(true);
                    try {
                      const res = await fetch(
                        `/api/agents/${encodeURIComponent(did)}/llm-config`,
                        { method: "DELETE" }
                      );
                      if (res.ok) {
                        setLlmConfig(null);
                        setLlmStatus("cleared");
                        setTimeout(() => setLlmStatus("idle"), 2500);
                      } else setLlmStatus("error");
                    } catch {
                      setLlmStatus("error");
                    } finally {
                      setLlmSaving(false);
                    }
                  }}
                  className="text-xs text-danger-400 hover:text-danger-300 border border-danger-500/30 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={openEdit}
                className="text-xs text-primary-400 hover:text-primary-300 border border-primary-500/30 px-2.5 py-1.5 rounded-md transition-colors"
              >
                {llmConfig ? "Edit" : "Configure"}
              </button>
            </div>
          )}
        </div>

        {llmEditing ? (
          <div className="p-4 space-y-4">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-sm">
              {[
                {
                  id: "realm" as const,
                  label: "Realm Routing",
                  disabled: !hasRealmRouting,
                  hint: !realmLlmData?.litellmConfigured
                    ? "LiteLLM not configured"
                    : "no models in realm",
                },
                {
                  id: "registry" as const,
                  label: "From Registry",
                  disabled: registryModels.length === 0,
                  hint: "no models registered",
                },
                {
                  id: "manual" as const,
                  label: "Configure manually",
                  disabled: false,
                  hint: "",
                },
              ].map(({ id, label, disabled, hint }) => (
                <button
                  key={id}
                  onClick={() => !disabled && setConfigMode(id)}
                  disabled={disabled}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    configMode === id
                      ? "bg-primary-600 text-white"
                      : disabled
                        ? "bg-background text-foreground-400 cursor-not-allowed"
                        : "bg-background text-foreground-500 hover:text-foreground hover:bg-background-200"
                  }`}
                  title={disabled ? hint : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {configMode === "realm" ? (
              <div className="space-y-3">
                <p className="text-xs text-foreground-500">
                  Route this agent through your LiteLLM proxy using a
                  realm-scoped virtual key. The API key is resolved server-side.
                </p>
                {(realmLlmData?.realms ?? [])
                  .filter((r) => r.hasVirtualKey && r.models.length > 0)
                  .map((realm) => (
                    <div key={realm.realmId} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-foreground-500 font-medium uppercase tracking-wider">
                        <span>{realm.realmName}</span>
                        {realm.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300 text-[10px] font-semibold">
                            Primary
                          </span>
                        )}
                      </div>
                      {realm.models.map((model) => (
                        <label
                          key={model.id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                            selectedRealmId === realm.realmId &&
                            selectedRealmModelId === model.id
                              ? "border-primary-500 bg-primary-50"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="realm-model"
                            checked={
                              selectedRealmId === realm.realmId &&
                              selectedRealmModelId === model.id
                            }
                            onChange={() => {
                              setSelectedRealmId(realm.realmId);
                              setSelectedRealmModelId(model.id);
                            }}
                            className="accent-primary-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {model.name}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[model.provider] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
                              >
                                {model.provider}
                              </span>
                            </div>
                            <code className="text-xs text-foreground-400 font-mono">
                              {model.litellmModelName ?? model.modelId}
                            </code>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmEditing(false);
                      setLlmStatus("idle");
                    }}
                    className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={
                      !selectedRealmId || !selectedRealmModelId || llmSaving
                    }
                    onClick={saveRealmRouting}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use realm routing"}
                  </button>
                  <a
                    href="/models"
                    className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
                  >
                    Manage models →
                  </a>
                </div>
              </div>
            ) : configMode === "registry" ? (
              <div className="space-y-3">
                <p className="text-xs text-foreground-500">
                  Select a model from the registry. Endpoint and credentials are
                  resolved server-side.
                </p>
                {registryLoading ? (
                  <p className="text-xs text-foreground-500 py-4 text-center">
                    Loading registry…
                  </p>
                ) : (
                  <div className="space-y-2">
                    {registryModels
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                            selectedRegistryId === m.id
                              ? "border-primary-500 bg-primary-50"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="registry-model"
                            value={m.id}
                            checked={selectedRegistryId === m.id}
                            onChange={() => setSelectedRegistryId(m.id)}
                            className="accent-primary-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {m.name}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[m.provider] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
                              >
                                {m.provider}
                              </span>
                            </div>
                            <code className="text-xs text-foreground-400 font-mono">
                              {m.modelId}
                            </code>
                            {m.description && (
                              <p className="text-xs text-foreground-500 mt-0.5">
                                {m.description}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmEditing(false);
                      setLlmStatus("idle");
                    }}
                    className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedRegistryId || llmSaving}
                    onClick={saveRegistryModel}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use this model"}
                  </button>
                  <a
                    href="/models"
                    className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
                  >
                    Manage registry →
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={saveManualConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                      Provider
                    </label>
                    <select
                      value={llmForm.provider}
                      onChange={(e) =>
                        setLlmForm((f) => ({
                          ...f,
                          provider: e.target.value as LlmProviderType,
                        }))
                      }
                      className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    >
                      {PROVIDER_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                      Model
                    </label>
                    <input
                      type="text"
                      required
                      value={llmForm.model}
                      onChange={(e) =>
                        setLlmForm((f) => ({ ...f, model: e.target.value }))
                      }
                      placeholder={
                        llmForm.provider === "openai"
                          ? "gpt-4o"
                          : llmForm.provider === "anthropic"
                            ? "claude-sonnet-4-5"
                            : llmForm.provider === "google"
                              ? "gemini-2.5-flash"
                              : llmForm.provider === "ollama"
                                ? "llama3.2"
                                : "model-name"
                      }
                      className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                  {selectedProvider.needsKey && (
                    <div>
                      <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                        API Key{" "}
                        {llmConfig?.apiKeySet && (
                          <span className="text-success-500 normal-case">
                            (stored — leave blank to keep)
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={llmForm.apiKey}
                        onChange={(e) =>
                          setLlmForm((f) => ({ ...f, apiKey: e.target.value }))
                        }
                        placeholder={
                          llmConfig?.apiKeySet ? "••••••••••••••••" : "sk-…"
                        }
                        className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>
                  )}
                  {selectedProvider.needsUrl && (
                    <div>
                      <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                        Base URL
                      </label>
                      <input
                        type="url"
                        value={llmForm.baseUrl}
                        onChange={(e) =>
                          setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))
                        }
                        placeholder={
                          llmForm.provider === "ollama"
                            ? "http://localhost:11434/api"
                            : "http://localhost:1234/v1"
                        }
                        className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                      Max Tokens{" "}
                      <span className="normal-case text-foreground-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={llmForm.maxTokens}
                      onChange={(e) =>
                        setLlmForm((f) => ({ ...f, maxTokens: e.target.value }))
                      }
                      placeholder="4096"
                      className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                    System Prompt{" "}
                    <span className="normal-case text-foreground-400">
                      (optional — overrides default)
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    value={llmForm.systemPrompt}
                    onChange={(e) =>
                      setLlmForm((f) => ({
                        ...f,
                        systemPrompt: e.target.value,
                      }))
                    }
                    placeholder="You are a secure agent…"
                    className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-y"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmEditing(false);
                      setLlmStatus("idle");
                    }}
                    className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={llmSaving}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Save & Push to Agent"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : llmConfig ? (
          <div className="divide-y divide-neutral-200">
            {/* Realm routing banner when applicable */}
            {activeRealmRoute && (
              <div className="flex items-center gap-3 px-4 py-3 bg-secondary-50">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-700 border border-secondary-300 shrink-0">
                  Realm Routing
                </span>
                <span className="text-sm text-foreground font-medium">
                  {activeRealmRoute.model.name}
                </span>
                <span className="text-xs text-foreground-500">
                  via {activeRealmRoute.realm.realmName}
                </span>
                <a
                  href={`/models/${activeRealmRoute.model.id}`}
                  className="ml-auto text-xs text-secondary-500 hover:text-secondary-400 transition-colors shrink-0"
                >
                  View model →
                </a>
              </div>
            )}
            {/* Registry model banner when applicable */}
            {!activeRealmRoute && activeRegistryModel && (
              <div className="flex items-center gap-3 px-4 py-3 bg-primary-50">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300 shrink-0">
                  Registry
                </span>
                <span className="text-sm text-foreground font-medium">
                  {activeRegistryModel.name}
                </span>
                <a
                  href={`/models/${activeRegistryModel.id}`}
                  className="ml-auto text-xs text-primary-400 hover:text-primary-300 transition-colors shrink-0"
                >
                  View model →
                </a>
              </div>
            )}
            {[
              {
                label: "Provider",
                value:
                  PROVIDER_OPTIONS.find((p) => p.value === llmConfig.provider)
                    ?.label ?? llmConfig.provider,
              },
              {
                label: "Model",
                value: <span className="font-mono">{llmConfig.model}</span>,
              },
              ...(llmConfig.baseUrl
                ? [
                    {
                      label: "Base URL",
                      value: (
                        <span className="font-mono text-xs">
                          {llmConfig.baseUrl}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                label: "API Key",
                value: llmConfig.apiKeySet ? (
                  <span className="text-success-600">Stored</span>
                ) : (
                  <span className="text-foreground-400">Not set</span>
                ),
              },
              ...(llmConfig.maxTokens
                ? [
                    {
                      label: "Max Tokens",
                      value: llmConfig.maxTokens.toString(),
                    },
                  ]
                : []),
              ...(llmConfig.systemPrompt
                ? [
                    {
                      label: "System Prompt",
                      value: (
                        <span className="whitespace-pre-wrap text-foreground-700 text-xs">
                          {llmConfig.systemPrompt}
                        </span>
                      ),
                    },
                  ]
                : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-3">
                <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                  {label}
                </div>
                <div className="flex-1 text-sm text-foreground">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-foreground-500 text-sm">
              No remote config set. The agent uses its local environment
              variables{" "}
              <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">
                LLM_PROVIDER
              </code>
              ,{" "}
              <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">
                LLM_MODEL
              </code>
              , etc.
            </p>
            {hasRealmRouting && (
              <p className="text-xs text-foreground-500 mt-2">
                Realm routing is available — click Configure to route via your
                LiteLLM proxy.
              </p>
            )}
            {!hasRealmRouting && registryModels.length > 0 && (
              <p className="text-xs text-foreground-500 mt-2">
                {registryModels.length} model
                {registryModels.length !== 1 ? "s" : ""} available in the
                registry — click Configure to assign one.
              </p>
            )}
          </div>
        )}
      </div>

      {llmStatus === "saved" && (
        <p className="text-success-600 text-xs">
          ✓ Config saved and pushed to agent
        </p>
      )}
      {llmStatus === "cleared" && (
        <p className="text-success-600 text-xs">✓ Config cleared</p>
      )}
      {llmStatus === "error" && (
        <p className="text-danger-500 text-xs">Failed to update config</p>
      )}
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
    const res = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }
    );
    const data = await res.json();
    setStatus(res.ok ? `Task sent: ${data.action}` : `Error: ${data.error}`);
    if (res.ok) setAction("");
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-1">
        Enqueue Task
      </h2>
      <p className="text-xs text-foreground-500 mb-4">
        Send a one-off action to the agent's task queue.
      </p>
      <div className="flex gap-2">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enqueue()}
          placeholder="Task action…"
          className="flex-1 px-3 py-2 text-sm bg-background-200 border border-neutral-200 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500/50"
        />
        <button
          onClick={enqueue}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
        >
          Send
        </button>
      </div>
      {status && (
        <p
          className={`mt-2 text-xs ${status.startsWith("Error") ? "text-danger-600" : "text-success-700"}`}
        >
          {status}
        </p>
      )}
    </div>
  );
}

function ScheduleSection({ agentId }: { agentId: string }) {
  const [form, setForm] = useState({ id: "", name: "", cron: "", action: "" });
  const [status, setStatus] = useState<string | null>(null);

  const field = (key: keyof typeof form, placeholder: string) => (
    <div>
      <label className="text-xs text-foreground-500 uppercase tracking-wider block mb-1">
        {placeholder}
      </label>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={key === "cron" ? "*/5 * * * *" : placeholder}
        className="w-full px-3 py-2 text-sm bg-background-200 border border-neutral-200 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500/50"
      />
    </div>
  );

  const upsert = async () => {
    if (!form.id || !form.name || !form.cron || !form.action) {
      setStatus("All fields are required");
      return;
    }
    setStatus(null);
    const res = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/schedules`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }
    );
    const data = await res.json();
    setStatus(res.ok ? `Schedule "${form.name}" sent` : `Error: ${data.error}`);
    if (res.ok) setForm({ id: "", name: "", cron: "", action: "" });
  };

  const del = async () => {
    if (!form.id) {
      setStatus("Enter schedule ID to delete");
      return;
    }
    const res = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/schedules?id=${encodeURIComponent(form.id)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    setStatus(
      res.ok ? `Schedule "${form.id}" deleted` : `Error: ${data.error}`
    );
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-1">
        Manage Schedules
      </h2>
      <p className="text-xs text-foreground-500 mb-4">
        Create, update, or delete cron-based agent schedules.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {field("id", "ID")}
        {field("name", "Name")}
        {field("cron", "Cron expression")}
        {field("action", "Action")}
      </div>
      <div className="flex gap-2">
        <button
          onClick={upsert}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
        >
          Upsert
        </button>
        <button
          onClick={del}
          className="px-4 py-2 text-sm bg-danger-600/80 text-white rounded-lg hover:bg-danger-600 transition-colors"
        >
          Delete by ID
        </button>
      </div>
      {status && (
        <p
          className={`mt-2 text-xs ${status.startsWith("Error") ? "text-danger-600" : "text-success-700"}`}
        >
          {status}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Approvals
// ---------------------------------------------------------------------------

function ApprovalsTab({
  onCountChange,
}: {
  onCountChange: (n: number) => void;
}) {
  const [approvals, setApprovals] = useState<
    Array<{
      requestId: string;
      toolName: string;
      args: Record<string, unknown>;
      reason: string;
      agentName?: string;
      createdAt: number;
    }>
  >([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tool-approvals")
      .then((r) => r.json())
      .catch(() => ({ approvals: [] }));
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
          <h2 className="text-base font-semibold text-foreground">
            Tool Approvals
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Review and approve or reject pending tool use requests.
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-foreground-500 hover:text-foreground border border-neutral-300 px-2.5 py-1 rounded-md transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground-500 gap-2">
          <ShieldCheck size={36} strokeWidth={1} />
          <p className="text-sm">No pending tool approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div
              key={a.requestId}
              className="bg-background-200 rounded-lg p-4 border border-neutral-200"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-mono text-sm text-foreground font-medium">
                    {a.toolName}
                  </span>
                  {a.agentName && (
                    <span className="ml-2 text-xs text-foreground-500">
                      from {a.agentName}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(a.requestId, true)}
                    className="px-3 py-1 text-xs bg-success-600 text-white rounded-md hover:bg-success-500 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => respond(a.requestId, false)}
                    className="px-3 py-1 text-xs bg-danger-600/80 text-white rounded-md hover:bg-danger-600 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-foreground-500">{a.reason}</p>
              <pre className="mt-2 text-xs font-mono text-foreground-700 bg-background-100 border border-neutral-200 rounded p-2 overflow-x-auto">
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

// DetailsTab removed — replaced by Graph tab (AgentEnvironmentGraph component).

function AgentChatErrorBanner({
  message,
  code,
}: {
  message: string;
  code: string | null;
}) {
  if (code === "llm_unavailable") {
    return (
      <div className="flex items-start gap-2 bg-warning-50 border border-warning-300 text-warning-700 rounded-lg px-3 py-2.5 text-xs">
        <WifiOff size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">LLM provider unreachable</p>
          <p className="text-warning-600/80 mt-0.5 break-words">{message}</p>
          <p className="text-warning-600/60 mt-1">
            Update the LLM config in the <strong>Settings</strong> tab.
          </p>
        </div>
      </div>
    );
  }
  if (code === "agent_offline") {
    return (
      <div className="flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg px-3 py-2 text-xs">
        <WifiOff size={13} className="shrink-0" />
        <span>Agent disconnected — waiting to reconnect</span>
      </div>
    );
  }
  return (
    <div className="text-center text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Knowledge (cards + file upload)
// ---------------------------------------------------------------------------

interface KnowledgeSource {
  id: string;
  realm_id: string;
  agent_did: string;
  name: string;
  source_type: string;
  config: string;
  status: "idle" | "syncing" | "ready" | "error";
  doc_count: number;
  chunk_count: number;
  last_synced_at: string | null;
  error: string | null;
  created_at: string;
}

interface KsRealmOption {
  id: string;
  name: string;
}

interface KnowledgeFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
}

function KsStatusBadge({ status }: { status: KnowledgeSource["status"] }) {
  const map = {
    idle: {
      icon: <Clock size={12} />,
      label: "Idle",
      cls: "bg-neutral-100 text-neutral-500 border-neutral-300",
    },
    syncing: {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: "Syncing",
      cls: "bg-primary-100 text-primary-700 border-primary-300",
    },
    ready: {
      icon: <CheckCircle2 size={12} />,
      label: "Ready",
      cls: "bg-success-100 text-success-700 border-success-300",
    },
    error: {
      icon: <XCircle size={12} />,
      label: "Error",
      cls: "bg-danger-100 text-danger-700 border-danger-300",
    },
  };
  const { icon, label, cls } = map[status] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}
    >
      {icon} {label}
    </span>
  );
}

function KsTypeBadge({ type }: { type: string }) {
  const map: Record<
    string,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    url: {
      icon: <Globe size={12} />,
      label: "URL",
      cls: "bg-primary-100 text-primary-700 border-primary-300",
    },
    text: {
      icon: <FileText size={12} />,
      label: "Text",
      cls: "bg-warning-100 text-warning-700 border-warning-300",
    },
    files: {
      icon: <FileType2 size={12} />,
      label: "Documents",
      cls: "bg-success-100 text-success-700 border-success-300",
    },
  };
  const { icon, label, cls } = map[type] ?? map.url;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}
    >
      {icon} {label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const iso = isoString;
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function mimeIcon(mime: string): React.ReactNode {
  if (mime === "application/pdf")
    return <FileType2 size={13} className="text-danger-400 shrink-0" />;
  if (mime.includes("word") || mime.includes("document"))
    return <FileText size={13} className="text-primary-400 shrink-0" />;
  if (mime === "text/markdown" || mime === "text/plain")
    return <FileText size={13} className="text-neutral-400 shrink-0" />;
  if (mime === "text/csv")
    return <Layers size={13} className="text-success-400 shrink-0" />;
  return <File size={13} className="text-foreground-400 shrink-0" />;
}

// ---------------------------------------------------------------------------
// FileDropzone
// ---------------------------------------------------------------------------

interface FileDropzoneProps {
  files: File[];
  onAdd: (added: File[]) => void;
  onRemove: (index: number) => void;
}

function FileDropzone({ files, onAdd, onRemove }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    onAdd(dropped);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      onAdd(Array.from(e.target.files));
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          dragging
            ? "border-primary-500 bg-primary-50"
            : "border-neutral-200 hover:border-primary-400 hover:bg-background-200/40 bg-background"
        }`}
      >
        <Upload
          size={22}
          className={dragging ? "text-primary-500" : "text-foreground-400"}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-foreground-500 mt-0.5">
            PDF, DOCX, TXT, Markdown, CSV — up to 10 MB each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.csv"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => {
            const oversized = f.size > 10 * 1024 * 1024;
            return (
              <li
                key={`${f.name}-${i}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                  oversized
                    ? "border-danger-300 bg-danger-50"
                    : "border-neutral-200 bg-background-200/40"
                }`}
              >
                <File
                  size={13}
                  className={
                    oversized
                      ? "text-danger-400 shrink-0"
                      : "text-foreground-400 shrink-0"
                  }
                />
                <span
                  className={`flex-1 truncate ${oversized ? "text-danger-600" : "text-foreground"}`}
                >
                  {f.name}
                </span>
                <span
                  className={`shrink-0 ${oversized ? "text-danger-500" : "text-foreground-500"}`}
                >
                  {formatBytes(f.size)}
                </span>
                {oversized && (
                  <span className="shrink-0 text-danger-500 font-medium">
                    Too large
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="shrink-0 text-foreground-400 hover:text-danger-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KsSourceCard
// ---------------------------------------------------------------------------

interface KsSourceCardProps {
  source: KnowledgeSource;
  realmName: string;
  isSyncing: boolean;
  isDeleting: boolean;
  isExpanded: boolean;
  online: boolean;
  onToggleExpand: () => void;
  onSync: () => void;
  onDelete: () => void;
}

function KsSourceCard({
  source,
  realmName,
  isSyncing,
  isDeleting,
  isExpanded,
  online,
  onToggleExpand,
  onSync,
  onDelete,
}: KsSourceCardProps) {
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(source.config);
  } catch {
    /**/
  }

  const typeIconMap: Record<string, React.ReactNode> = {
    url: <Globe size={16} className="text-primary-400" />,
    text: <FileText size={16} className="text-warning-400" />,
    files: <FileType2 size={16} className="text-success-400" />,
  };
  const typeIcon = typeIconMap[source.source_type] ?? (
    <File size={16} className="text-foreground-400" />
  );

  async function loadFiles() {
    if (files !== null || source.source_type !== "files") return;
    setLoadingFiles(true);
    try {
      const res = await fetch(
        `/api/knowledge/files?sourceId=${encodeURIComponent(source.id)}`
      );
      const data = (await res.json()) as { files?: KnowledgeFile[] };
      setFiles(data.files ?? []);
    } finally {
      setLoadingFiles(false);
    }
  }

  function handleExpand() {
    if (!isExpanded && source.source_type === "files") {
      loadFiles();
    }
    onToggleExpand();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-background-100 overflow-hidden transition-all">
      {/* Card header */}
      <div
        className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-background-200/30 transition-colors"
        onClick={handleExpand}
      >
        {/* Type icon */}
        <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-background border border-neutral-200 flex items-center justify-center">
          {typeIcon}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {source.name}
            </span>
            <KsStatusBadge status={source.status} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-foreground-500 flex-wrap">
            <Globe2 size={11} className="shrink-0" />
            <span>{realmName}</span>
            <span className="text-foreground-400">·</span>
            <Layers size={11} className="shrink-0" />
            <span>
              {source.chunk_count > 0
                ? `${source.chunk_count.toLocaleString()} chunks`
                : "No chunks yet"}
            </span>
            <span className="text-foreground-400">·</span>
            <span>{relativeTime(source.last_synced_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onSync}
            disabled={isSyncing || isDeleting || !online}
            title={online ? "Sync now" : "Agent offline"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-500 hover:text-primary-500 hover:bg-primary-50:bg-primary-900/20 disabled:opacity-40 border border-neutral-200 hover:border-primary-300:border-primary-700 transition-colors"
          >
            {isSyncing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Sync
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            title="Delete source"
            className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-500 hover:bg-danger-50:bg-danger-900/20 disabled:opacity-40 border border-transparent hover:border-danger-200:border-danger-800 transition-colors"
          >
            {isDeleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
          <div className="pl-1 text-foreground-400">
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-neutral-200 px-4 pb-4 pt-3 space-y-3 bg-background">
          {/* Error */}
          {source.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200">
              <XCircle size={14} className="text-danger-500 mt-0.5 shrink-0" />
              <p className="text-xs text-danger-600 font-mono break-all">
                {source.error}
              </p>
            </div>
          )}

          {/* URL list */}
          {source.source_type === "url" && Array.isArray(config.urls) && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
                Indexed URLs
              </p>
              <ul className="space-y-1">
                {(config.urls as string[]).map((url) => (
                  <li
                    key={url}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <Globe size={11} className="text-foreground-400 shrink-0" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary-500 truncate"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Text documents list */}
          {source.source_type === "text" && Array.isArray(config.texts) && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
                Documents
              </p>
              <ul className="space-y-1">
                {(config.texts as { title: string }[]).map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <FileText
                      size={11}
                      className="text-foreground-400 shrink-0"
                    />
                    {t.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Uploaded files list */}
          {source.source_type === "files" && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
                Uploaded Files
              </p>
              {loadingFiles ? (
                <div className="flex items-center gap-2 py-2 text-xs text-foreground-500">
                  <Loader2 size={12} className="animate-spin" /> Loading files…
                </div>
              ) : files && files.length > 0 ? (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-foreground"
                    >
                      {mimeIcon(f.mime_type)}
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-foreground-500 shrink-0">
                        {formatBytes(f.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-foreground-400 italic">
                  No files found.
                </p>
              )}
            </div>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap gap-4 text-xs text-foreground-500 pt-1 border-t border-neutral-200/60">
            {config.chunkSize != null && (
              <span>
                Chunk size:{" "}
                <span className="text-foreground">
                  {String(config.chunkSize)}
                </span>
              </span>
            )}
            <span>
              Created:{" "}
              <span className="text-foreground">
                {new Date(
                  source.created_at.endsWith("Z")
                    ? source.created_at
                    : source.created_at + "Z"
                ).toLocaleDateString()}
              </span>
            </span>
            <span>
              ID: <span className="text-foreground font-mono">{source.id}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KsAddSourceModal
// ---------------------------------------------------------------------------

type KsSourceType = "url" | "text" | "files";

interface KsAddSourceModalProps {
  did: string;
  realms: KsRealmOption[];
  doclingConfigured: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function KsAddSourceModal({
  did,
  realms,
  doclingConfigured,
  onClose,
  onCreated,
}: KsAddSourceModalProps) {
  const [name, setName] = useState("");
  const [realmId, setRealmId] = useState(realms[0]?.id ?? "");
  const [sourceType, setSourceType] = useState<KsSourceType>("url");
  const [urls, setUrls] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [chunkSize, setChunkSize] = useState("1000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasOversizedFile = selectedFiles.some((f) => f.size > 10 * 1024 * 1024);

  function handleAddFiles(added: File[]) {
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const next = [...prev, ...added.filter((f) => !existing.has(f.name))];
      // Auto-fill name from first file added if the field is still empty
      if (!name.trim() && next.length > 0) {
        const firstName = next[0].name.replace(/\.[^.]+$/, ""); // strip extension
        setName(firstName);
      }
      return next;
    });
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Source name is required.");
      return;
    }
    if (!realmId) {
      setError("Please select a realm.");
      return;
    }
    if (hasOversizedFile) {
      setError("Remove files that exceed the 10 MB limit.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (sourceType === "url") {
        const list = urls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);
        if (!list.length) {
          setError("Enter at least one URL.");
          setSaving(false);
          return;
        }
        const config = {
          chunkSize: parseInt(chunkSize, 10) || 1000,
          urls: list,
        };
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId,
            agentDid: did,
            name: name.trim(),
            sourceType: "url",
            config,
          }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to create source");
        }
      } else if (sourceType === "text") {
        if (!textTitle.trim() || !textContent.trim()) {
          setError("Title and content are required for text sources.");
          setSaving(false);
          return;
        }
        const config = {
          chunkSize: parseInt(chunkSize, 10) || 1000,
          texts: [{ title: textTitle.trim(), content: textContent.trim() }],
        };
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId,
            agentDid: did,
            name: name.trim(),
            sourceType: "text",
            config,
          }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to create source");
        }
      } else {
        // files source type — multi-step
        if (!selectedFiles.length) {
          setError("Select at least one file to upload.");
          setSaving(false);
          return;
        }

        // Step 1: create source record
        const sourceRes = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId,
            agentDid: did,
            name: name.trim(),
            sourceType: "files",
            config: { chunkSize: parseInt(chunkSize, 10) || 1000 },
          }),
        });
        if (!sourceRes.ok) {
          const d = (await sourceRes.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to create source");
        }
        const { source } = (await sourceRes.json()) as {
          source: { id: string };
        };

        // Step 2: upload each file
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setUploadProgress(
            `Uploading ${i + 1}/${selectedFiles.length}: ${file.name}`
          );
          const fd = new FormData();
          fd.append("sourceId", source.id);
          fd.append("file", file);
          const uploadRes = await fetch("/api/knowledge/files", {
            method: "POST",
            body: fd,
          });
          if (!uploadRes.ok) {
            const d = (await uploadRes.json()) as { error?: string };
            throw new Error(d.error ?? `Failed to upload ${file.name}`);
          }
        }
        setUploadProgress(null);
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setUploadProgress(null);
    } finally {
      setSaving(false);
    }
  }

  const sourceTypeOptions: {
    value: KsSourceType;
    icon: React.ReactNode;
    label: string;
    description: string;
  }[] = [
    {
      value: "url",
      icon: <Globe size={18} className="text-primary-400" />,
      label: "URL Sources",
      description: "Fetch and index web pages or API docs",
    },
    {
      value: "text",
      icon: <FileText size={18} className="text-warning-400" />,
      label: "Inline Text",
      description: "Paste text directly from any source",
    },
    {
      value: "files",
      icon: <FileType2 size={18} className="text-success-400" />,
      label: "Documents",
      description: "Upload PDF, DOCX, TXT or Markdown files",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-500" />
            <h2 className="text-sm font-semibold text-foreground">
              Add Knowledge Source
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-500 hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SharePoint Contracts"
              className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          {/* Realm */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Realm
            </label>
            <select
              value={realmId}
              onChange={(e) => setRealmId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              <option value="">Select realm…</option>
              {realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Source type selector — option cards */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Source type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {sourceTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSourceType(opt.value)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-colors ${
                    sourceType === opt.value
                      ? "border-primary-500 bg-primary-50"
                      : "border-neutral-200 bg-background hover:border-primary-400 hover:bg-background-200/40"
                  }`}
                >
                  {opt.icon}
                  <span
                    className={`text-xs font-medium leading-tight ${sourceType === opt.value ? "text-primary-600" : "text-foreground"}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-foreground-500 leading-tight">
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Docling notice for files type */}
          {sourceType === "files" && !doclingConfigured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200">
              <AlertTriangle
                size={14}
                className="text-warning-500 mt-0.5 shrink-0"
              />
              <p className="text-xs text-warning-700">
                PDF and DOCX files require Docling to be configured. Plain text
                (.txt, .md) files can be indexed without Docling.
              </p>
            </div>
          )}

          {/* URL input */}
          {sourceType === "url" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                URLs{" "}
                <span className="normal-case font-normal text-foreground-400">
                  (one per line)
                </span>
              </label>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={
                  "https://example.com/docs\nhttps://example.com/policy"
                }
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
              />
            </div>
          )}

          {/* Text input */}
          {sourceType === "text" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Document title
                </label>
                <input
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="e.g. Company Policy v2"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Content
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste document content here…"
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>
            </div>
          )}

          {/* File dropzone */}
          {sourceType === "files" && (
            <FileDropzone
              files={selectedFiles}
              onAdd={handleAddFiles}
              onRemove={handleRemoveFile}
            />
          )}

          {/* Advanced settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-xs text-foreground-500 hover:text-foreground transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              Advanced settings
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Chunk size{" "}
                  <span className="normal-case font-normal text-foreground-400">
                    (chars)
                  </span>
                </label>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(e.target.value)}
                  min={100}
                  max={8000}
                  className="w-32 px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <p className="text-xs text-foreground-400">
                  Default 1000. Larger = more context per chunk, fewer results.
                </p>
              </div>
            )}
          </div>

          {/* Upload progress */}
          {uploadProgress && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary-50 border border-primary-200">
              <Loader2
                size={14}
                className="animate-spin text-primary-500 shrink-0"
              />
              <p className="text-xs text-primary-700">{uploadProgress}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200">
              <AlertTriangle
                size={14}
                className="text-danger-500 mt-0.5 shrink-0"
              />
              <p className="text-xs text-danger-600">{error}</p>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 text-sm text-foreground-500 hover:text-foreground hover:border-foreground-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {sourceType === "files" ? "Upload & create" : "Create source"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeTab
// ---------------------------------------------------------------------------

function KnowledgeTab({
  did,
  online,
  capabilities,
}: {
  did: string;
  agentName: string;
  online: boolean;
  capabilities: string[];
}) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [realms, setRealms] = useState<KsRealmOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [doclingConfigured, setDoclingConfigured] = useState(false);
  const [granting, setGranting] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, rlRes] = await Promise.all([
        fetch(`/api/knowledge?agentDid=${encodeURIComponent(did)}`),
        fetch("/api/realms"),
      ]);
      const ksData = (await ksRes.json()) as { sources?: KnowledgeSource[] };
      const rlData = (await rlRes.json()) as { realms?: KsRealmOption[] };
      setSources(ksData.sources ?? []);
      setRealms(rlData.realms ?? []);
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch Docling config on mount
  useEffect(() => {
    fetch("/api/settings/docling")
      .then((r) => r.json())
      .then((d: { configured?: boolean; url?: string }) => {
        setDoclingConfigured(d.configured === true || Boolean(d.url));
      })
      .catch(() => {
        /* Docling config unavailable */
      });
  }, []);

  // Poll while any source is syncing
  useEffect(() => {
    if (!sources.some((s) => s.status === "syncing")) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [sources, load]);

  async function handleSync(source: KnowledgeSource) {
    if (!online) {
      showToast("Agent is offline — cannot sync", false);
      return;
    }
    setSyncingIds((s) => new Set(s).add(source.id));
    try {
      const res = await fetch(`/api/knowledge/${source.id}/sync`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      showToast(`Sync started for "${source.name}"`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed", false);
    } finally {
      setSyncingIds((s) => {
        const n = new Set(s);
        n.delete(source.id);
        return n;
      });
    }
  }

  async function handleDelete(source: KnowledgeSource) {
    const isSyncing = syncingIds.has(source.id) || source.status === "syncing";
    const msg = isSyncing
      ? `"${source.name}" is currently syncing.\nDelete it anyway? The in-progress sync will be abandoned.`
      : `Delete "${source.name}"?\nAll indexed chunks will be removed from this agent.`;
    if (!confirm(msg)) return;
    setDeletingIds((s) => new Set(s).add(source.id));
    try {
      const res = await fetch(`/api/knowledge/${source.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      showToast(`"${source.name}" deleted`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", false);
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(source.id);
        return n;
      });
    }
  }

  // Grant knowledge_search by creating a new policy (with old policy revoked)
  async function handleGrantKnowledgeSearch() {
    setGranting(true);
    try {
      // 1. Fetch current active policies for this agent
      const policiesRes = await fetch(
        `/api/policies?agentDid=${encodeURIComponent(did)}`
      );
      const policiesData = (await policiesRes.json()) as {
        policies?: Array<{
          id: string;
          capabilities: string[];
          resourceLimits: Record<string, unknown> | null;
          expiresAt: string | null;
          createdAt: string;
        }>;
      };
      const activePolicies = (policiesData.policies ?? [])
        .filter((p) => !p.expiresAt || new Date(p.expiresAt) > new Date())
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      const latestPolicy = activePolicies[0] ?? null;

      // 2. Build new capabilities list (base: latest policy caps if any, else current agent caps)
      const baseCaps: string[] = latestPolicy?.capabilities ?? [
        ...capabilities,
      ];
      const newCaps = baseCaps.includes("knowledge_search")
        ? baseCaps
        : [...baseCaps, "knowledge_search"];

      // 3. Delete old policy first so the POST is the final applied state
      if (latestPolicy) {
        await fetch(`/api/policies/${encodeURIComponent(latestPolicy.id)}`, {
          method: "DELETE",
        });
      }

      // 4. Create new policy (this triggers immediate cert reissue with knowledge_search)
      const createRes = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: did,
          capabilities: newCaps,
          resourceLimits: latestPolicy?.resourceLimits ?? undefined,
          // No expiry on replacement policy (admin can set one later via governance tab)
        }),
      });
      if (!createRes.ok) {
        const err = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${createRes.status}`);
      }

      showToast("knowledge_search granted — new policy applied");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to grant capability",
        false
      );
    } finally {
      setGranting(false);
    }
  }

  const getRealmName = (id: string) =>
    realms.find((r) => r.id === id)?.name ?? id;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const readyCount = sources.filter((s) => s.status === "ready").length;
  const hasFileSources = sources.some((s) => s.source_type === "files");
  const hasReadySources = readyCount > 0;
  const hasKnowledgeCapability = capabilities.includes("knowledge_search");

  return (
    <div className="space-y-5">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? "bg-success-600" : "bg-danger-600"}`}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Knowledge Sources
            </h3>
            {hasFileSources && (
              <span
                title={
                  doclingConfigured
                    ? "Docling configured — PDF/DOCX parsing enabled"
                    : "Docling not configured — PDF/DOCX parsing unavailable"
                }
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                  doclingConfigured
                    ? "bg-success-100 text-success-700 border-success-300"
                    : "bg-warning-100 text-warning-700 border-warning-300"
                }`}
              >
                <FileType2 size={10} />
                {doclingConfigured ? "Docling on" : "Docling off"}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-500 mt-0.5">
            {sources.length === 0
              ? "No sources yet — add one to enable RAG search"
              : `${readyCount}/${sources.length} ready · ${totalChunks.toLocaleString()} chunks indexed`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add source
        </button>
      </div>

      {/* Offline warning */}
      {!online && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-700">
          <WifiOff size={14} className="shrink-0" />
          Agent is offline. You can manage sources but syncing requires the
          agent to be connected.
        </div>
      )}

      {/* Missing knowledge_search capability warning */}
      {hasReadySources && !hasKnowledgeCapability && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-50 border border-warning-200">
          <AlertTriangle
            size={16}
            className="shrink-0 mt-0.5 text-warning-600"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning-800">
              Knowledge sources are ready but the agent cannot use them
            </p>
            <p className="text-xs text-warning-700 mt-1">
              The{" "}
              <code className="bg-warning-100 px-1 rounded font-mono">
                knowledge_search
              </code>{" "}
              capability is not granted in this agent&apos;s active policy. The
              LLM will not have access to the{" "}
              {readyCount === 1
                ? "indexed document"
                : `${readyCount} indexed documents`}{" "}
              during conversations.
            </p>
            <p className="text-xs text-warning-600 mt-1">
              Granting this capability will create a new policy (replacing the
              current one) and immediately reissue the agent&apos;s certificate.
            </p>
          </div>
          <button
            onClick={handleGrantKnowledgeSearch}
            disabled={granting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-600 hover:bg-warning-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            {granting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ShieldCheck size={13} />
            )}
            {granting ? "Applying…" : "Grant capability"}
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}

      {/* Empty state */}
      {!loading && sources.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 border-dashed bg-background/40 p-10 text-center space-y-3">
          <BookOpen className="w-7 h-7 text-foreground-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            No knowledge sources yet
          </p>
          <p className="text-xs text-foreground-500 max-w-sm mx-auto">
            Connect URLs, paste inline text, or upload documents. Once synced
            and the{" "}
            <code className="bg-background-200 px-1 rounded text-primary-400">
              knowledge_search
            </code>{" "}
            capability is granted, the agent will use indexed content in every
            conversation.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Add first source
          </button>
        </div>
      )}

      {/* Source cards */}
      {!loading && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((source) => (
            <KsSourceCard
              key={source.id}
              source={source}
              realmName={getRealmName(source.realm_id)}
              isSyncing={
                syncingIds.has(source.id) || source.status === "syncing"
              }
              isDeleting={deletingIds.has(source.id)}
              isExpanded={expandedId === source.id}
              online={online}
              onToggleExpand={() =>
                setExpandedId(expandedId === source.id ? null : source.id)
              }
              onSync={() => handleSync(source)}
              onDelete={() => handleDelete(source)}
            />
          ))}
        </div>
      )}

      {/* Add source modal */}
      {showCreate && (
        <KsAddSourceModal
          did={did}
          realms={realms}
          doclingConfigured={doclingConfigured}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
