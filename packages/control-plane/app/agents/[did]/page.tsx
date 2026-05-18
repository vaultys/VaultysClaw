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

type TabId = "overview" | "chat" | "tokens" | "config" | "automation" | "approvals" | "details" | "peers";

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
  return parseUTC(iso).toLocaleString();
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

  const { agents: agentsState, lastEvent } = useAdminWS();
  const liveAgent = agentsState.agents.find((a) => a.id === did);

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
        <button onClick={() => router.push("/")} className="text-indigo-400 hover:text-indigo-300 mb-6 inline-block text-sm">
          ← Back to Dashboard
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
    { id: "automation", label: "Automation", icon: <Clock size={15} /> },
    { id: "approvals", label: "Approvals", icon: <ShieldCheck size={15} />, badge: pendingApprovals },
    { id: "peers", label: "Peer Agents", icon: <Bot size={15} /> },
    { id: "details", label: "Details", icon: <FileCode2 size={15} /> },
  ];

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
      {/* ── Page header ── */}
      <div className="mb-4">
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1.5 text-sm text-vc-muted hover:text-vc-text mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Back to Dashboard
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
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-vc-muted bg-vc-raised border border-vc-ring rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-vc-ring rounded-full" />
                  Offline
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-vc-muted mt-0.5 truncate">{agent.id}</p>
          </div>

          {/* Quick stats */}
          <div className="hidden sm:flex gap-6 text-right flex-shrink-0">
            <div>
              <div className="text-xs text-vc-muted uppercase">Last seen</div>
              <div className="text-sm text-vc-text">{timeAgo(agent.lastSeen)}</div>
            </div>
            <div>
              <div className="text-xs text-vc-muted uppercase">Capabilities</div>
              <div className="text-sm text-vc-text">{agent.capabilities.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabbed content ── */}
      <div className="border border-vc-border rounded-xl overflow-hidden bg-vc-surface">
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "overview" && <OverviewTab agent={agent} />}
          {activeTab === "chat" && <ChatTab agentId={agent.id} agentName={agent.name} online={agent.online} />}
          {activeTab === "tokens" && <TokensTab agentId={agent.id} />}
          {activeTab === "config" && <ConfigTab did={did} reportedLlm={agent.reportedLlm} />}
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

function OverviewTab({ agent }: { agent: AgentDetail }) {
  const [editing, setEditing] = useState(false);
  const [editCaps, setEditCaps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-6">
      {/* Connection */}
      <section>
        <h2 className="text-sm font-semibold text-vc-muted uppercase tracking-wider mb-3">Connection</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Status", value: agent.online ? <span className="text-green-400">Connected</span> : <span className="text-vc-muted">Disconnected</span> },
            { label: "Connected Since", value: <span className="text-vc-text">{formatDate(agent.connectedAt)}</span> },
            { label: "Last Heartbeat", value: <span className="text-vc-text">{agent.online ? timeAgo(agent.lastHeartbeat) : "—"}</span> },
          ].map(({ label, value }) => (
            <div key={label} className="bg-vc-raised rounded-lg p-4 border border-vc-border">
              <div className="text-xs text-vc-muted uppercase mb-1">{label}</div>
              <div className="text-sm">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Identity */}
      <section>
        <h2 className="text-sm font-semibold text-vc-muted uppercase tracking-wider mb-3">Identity</h2>
        <div className="bg-vc-raised rounded-lg border border-vc-border divide-y divide-vc-border">
          {[
            { label: "DID", value: <span className="font-mono text-xs break-all text-vc-text-2">{agent.id}</span> },
            { label: "Name", value: <span className="text-vc-text">{agent.name}</span> },
            { label: "Registered At", value: <span className="text-vc-text">{formatDate(agent.registeredAt)}</span> },
            { label: "Last Seen", value: <span className="text-vc-text">{formatDate(agent.lastSeen)} <span className="text-vc-subtle">({timeAgo(agent.lastSeen)})</span></span> },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-vc-muted uppercase pt-0.5">{label}</div>
              <div className="flex-1 text-sm">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-vc-muted uppercase tracking-wider">Capabilities</h2>
          {!editing ? (
            <button
              onClick={() => { setEditCaps([...agent.capabilities]); setEditing(true); }}
              className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-md transition-colors"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-vc-muted hover:text-vc-text px-2.5 py-1">Cancel</button>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ capabilities: editCaps }),
                    });
                    if (!res.ok) throw new Error("Failed to update");
                    setEditing(false);
                  } catch { /* keep editing */ } finally { setSaving(false); }
                }}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1 rounded-md transition-colors"
              >
                {saving ? "Saving…" : "Save & Reissue"}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="flex flex-wrap gap-2">
            {ALL_CAPABILITIES.map((cap) => {
              const active = editCaps.includes(cap.id);
              return (
                <button
                  key={cap.id}
                  onClick={() => setEditCaps(active ? editCaps.filter((c) => c !== cap.id) : [...editCaps, cap.id])}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${active
                    ? "bg-indigo-900/40 border-indigo-500 text-indigo-300"
                    : "bg-vc-raised/40 border-vc-ring text-vc-muted hover:border-vc-muted"
                    }`}
                >
                  {CAPABILITY_ICONS[cap.id] ?? <Zap size={14} />}
                  {cap.label}
                </button>
              );
            })}
          </div>
        ) : agent.capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {agent.capabilities.map((cap) => (
              <span
                key={cap}
                className="relative group bg-indigo-900 border border-indigo-700/50 text-white p-2 rounded-md flex items-center justify-center"
              >
                {CAPABILITY_ICONS[cap] ?? <Zap size={16} />}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] text-white bg-gray-900 rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                  {cap.replace(/_/g, " ")}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-vc-muted text-sm">No capabilities declared.</p>
        )}
      </section>

      {/* Agent-reported LLM */}
      {agent.online && agent.reportedLlm && (
        <section>
          <h2 className="text-sm font-semibold text-vc-muted uppercase tracking-wider mb-3">Active LLM</h2>
          <div className="bg-vc-raised rounded-lg border border-vc-border px-4 py-3 flex items-center gap-3">
            <code className="text-sm font-mono text-indigo-400">
              {agent.reportedLlm.provider}/{agent.reportedLlm.model}
            </code>
            <span className="text-xs text-vc-subtle">reported by agent</span>
          </div>
        </section>
      )}


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
      {tokenError && <p className="text-red-400 text-sm">{tokenError}</p>}
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
  const [configMode, setConfigMode] = useState<"registry" | "manual">("registry");
  const [registryModels, setRegistryModels] = useState<RegistryModel[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = useState("");
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
    ]).then(([configData, modelsData]: [{ config: LlmConfigDisplay | null }, { models?: RegistryModel[] }]) => {
      setLlmConfig(configData.config);
      setRegistryModels(modelsData.models ?? []);
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
    // Pre-select mode: if current config matches a registry model, default to registry
    if (llmConfig?.provider === "openai-compatible") {
      const match = registryModels.find(
        (m) => m.modelId === llmConfig.model
      );
      if (match) {
        setSelectedRegistryId(match.id);
        setConfigMode("registry");
      } else {
        setConfigMode("manual");
      }
    } else if (llmConfig) {
      setConfigMode("manual");
    } else {
      setConfigMode(registryModels.length > 0 ? "registry" : "manual");
    }
    setRegistryLoading(false);
    setLlmEditing(true);
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
                { id: "registry" as const, label: "From Model Registry", disabled: registryModels.length === 0 },
                { id: "manual" as const, label: "Configure manually" },
              ].map(({ id, label, disabled }) => (
                <button
                  key={id}
                  onClick={() => !disabled && setConfigMode(id)}
                  disabled={disabled}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    configMode === id
                      ? "bg-indigo-600 text-white"
                      : disabled
                        ? "bg-vc-bg text-vc-subtle cursor-not-allowed"
                        : "bg-vc-bg text-vc-muted hover:text-vc-text hover:bg-vc-raised"
                  }`}
                >
                  {label}
                  {disabled && <span className="ml-1 opacity-60">(no models registered)</span>}
                </button>
              ))}
            </div>

            {configMode === "registry" ? (
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
                        className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                          selectedRegistryId === m.id
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
            {/* Registry model banner when applicable */}
            {activeRegistryModel && (
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
            {registryModels.length > 0 && (
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
        <p className={`mt-2 text-xs ${status.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>{status}</p>
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
        <p className={`mt-2 text-xs ${status.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>{status}</p>
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
      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-3 py-2.5 text-xs">
        <WifiOff size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">LLM provider unreachable</p>
          <p className="text-amber-400/70 mt-0.5 break-words">{message}</p>
          <p className="text-amber-400/50 mt-1">Update the LLM config in the <strong>Settings</strong> tab.</p>
        </div>
      </div>
    );
  }
  if (code === "agent_offline") {
    return (
      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-xs">
        <WifiOff size={13} className="shrink-0" />
        <span>Agent disconnected — waiting to reconnect</span>
      </div>
    );
  }
  return (
    <div className="text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
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
          {error && <p className="text-red-400 text-xs">{error}</p>}
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
