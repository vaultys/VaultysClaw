"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Wifi,
  Radio,
  Activity,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Settings2,
  X,
  Link2,
  Map,
  ChevronDown,
  ChevronRight,
  Terminal,
  Package,
  Container,
  HelpCircle,
  RotateCcw,
  Pin,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  Handle,
  Position,
  NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TransportStats {
  messagesIn: number;
  messagesOut: number;
  bytesIn: number;
  bytesOut: number;
  connectionsTotal: number;
  activeAgents: number;
  pendingConnections: number;
}

interface ConnectedAgentRow {
  id: string;
  name: string;
  transport: "ws" | "peerjs";
  connectedAt: string;
  lastHeartbeat: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  transport: "ws" | "peerjs";
  level: "info" | "warn" | "error";
  event: string;
  detail?: string;
}

interface NetworkData {
  stats: {
    startedAt: string;
    ws: TransportStats;
    peerjs: TransportStats;
    agents: ConnectedAgentRow[];
  } | null;
  logs: {
    ws: LogEntry[];
    peerjs: LogEntry[];
  };
  peerjs: {
    peerId: string | null;
    running: boolean;
    startedAt: string | null;
    serverUrl: string | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function shortDid(did: string): string {
  if (did.length <= 20) return did;
  return `${did.slice(0, 12)}…${did.slice(-8)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  sub,
  disabled,
}: {
  label: string;
  value: string | number;
  sub?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "border rounded-lg px-4 py-3 transition-opacity",
        disabled
          ? "bg-vc-bg border-vc-border opacity-40"
          : "bg-vc-bg border-vc-border",
      )}
    >
      <div className="text-xs text-vc-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xl font-bold text-vc-text">{value}</div>
      {sub && <div className="text-xs text-vc-subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-vc-raised border border-vc-border text-vc-muted hover:text-vc-text transition-colors"
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Agents table ──────────────────────────────────────────────────────────────

function AgentsTable({
  agents,
  transport,
}: {
  agents: ConnectedAgentRow[];
  transport: "ws" | "peerjs";
}) {
  const filtered = agents.filter((a) => a.transport === transport);
  const accent = transport === "ws" ? "sky" : "violet";

  return (
    <div className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-vc-border flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-vc-text">Live connections</span>
          <span className="ml-2 text-xs text-vc-subtle">
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-vc-subtle">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          Auto-refreshes every 5s
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-vc-muted">
          No {transport === "ws" ? "WebSocket" : "WebRTC"} agents connected
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vc-border text-left text-xs font-medium text-vc-subtle uppercase tracking-wider">
              <th className="px-5 py-3">Agent</th>
              <th className="px-5 py-3">DID</th>
              <th className="px-5 py-3">Connected</th>
              <th className="px-5 py-3">Last heartbeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vc-border">
            {filtered.map((agent) => (
              <tr key={agent.id} className="hover:bg-vc-raised/30 transition-colors">
                <td className="px-5 py-3 font-medium text-vc-text">{agent.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-vc-muted">
                  <span title={agent.id}>{shortDid(agent.id)}</span>
                </td>
                <td className="px-5 py-3 text-xs text-vc-muted">{timeAgo(agent.connectedAt)}</td>
                <td className="px-5 py-3 text-xs text-vc-muted">
                  {timeAgo(agent.lastHeartbeat)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function LogPanel({ logs }: { logs: LogEntry[] }) {
  const [entries, setEntries] = useState<LogEntry[]>(logs);
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Sync incoming logs into local state
  useEffect(() => {
    setEntries(logs);
  }, [logs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  function handleScroll() {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 24;
    if (atBottom) setAutoScroll(true);
    else setAutoScroll(false);
  }

  function formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  }

  const levelStyle: Record<LogEntry["level"], string> = {
    info: "text-green-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800">
        <Terminal size={14} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-300">Logs</span>
        <span className="text-xs text-gray-600 ml-0.5">({entries.length})</span>
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
          className={cn(
            "p-1 rounded transition-colors",
            autoScroll ? "text-indigo-400 hover:text-indigo-300" : "text-gray-600 hover:text-gray-400",
          )}
        >
          {autoScroll ? <Pin size={12} /> : <ArrowDown size={12} />}
        </button>
        <button
          onClick={() => setEntries([])}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-800"
        >
          Clear
        </button>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        onScroll={handleScroll}
        className="h-52 overflow-y-auto font-mono text-xs px-3 py-2 space-y-0.5"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            No events yet
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 py-0.5">
              <span className="text-gray-600 shrink-0">[{formatTime(entry.timestamp)}]</span>
              <span
                className={cn(
                  "uppercase shrink-0 font-semibold text-[10px] tracking-wider",
                  levelStyle[entry.level],
                )}
              >
                {entry.level}
              </span>
              <span className="text-gray-200">{entry.event}</span>
              {entry.detail && (
                <span className="text-gray-500 truncate">{entry.detail}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── PeerJS control panel ───────────────────────────────────────────────────────

function PeerjsPanel({
  data,
  onAction,
}: {
  data: NetworkData["peerjs"];
  onAction: (action: "start" | "stop" | "restart-peerjs", serverUrl?: string | null) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const [actingAction, setActingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [serverUrl, setServerUrl] = useState(data.serverUrl ?? "");

  async function handle(action: "start" | "stop" | "restart-peerjs") {
    setActing(true);
    setActingAction(action);
    setError(null);
    try {
      await onAction(action, action === "start" ? serverUrl.trim() || null : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActing(false);
      setActingAction(null);
    }
  }

  return (
    <>
      {/* Help Modal */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="relative bg-vc-surface border border-vc-border rounded-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowHelpModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded hover:bg-vc-raised transition-colors text-vc-muted z-10"
            >
              <X size={16} />
            </button>
            <div className="p-5">
              <PeerjsSetupGuide configuredUrl={data.serverUrl} />
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          "rounded-xl border p-5 space-y-4",
          data.running
            ? "bg-violet-50/60 dark:bg-violet-500/5 border-violet-300 dark:border-violet-500/30"
            : "bg-vc-surface border-vc-border",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center border",
              data.running
                ? "bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/30"
                : "bg-vc-raised border-vc-border",
            )}
          >
            <Radio
              size={18}
              className={data.running ? "text-violet-600 dark:text-violet-400" : "text-vc-muted"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-vc-text">WebRTC / PeerJS</span>
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                  data.running
                    ? "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/30"
                    : "bg-vc-raised text-vc-muted border-vc-border",
                )}
              >
                {data.running ? "Running" : "Stopped"}
              </span>
            </div>
            {data.running && data.startedAt && (
              <p className="text-xs text-vc-muted mt-0.5">Started {timeAgo(data.startedAt)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="p-1.5 rounded hover:bg-vc-raised transition-colors text-vc-muted"
              title="Configure"
            >
              <Settings2 size={15} />
            </button>
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-1.5 rounded hover:bg-vc-raised transition-colors text-vc-muted"
              title="Setup guide"
            >
              <HelpCircle size={15} />
            </button>
            {data.running ? (
              <>
                <button
                  onClick={() => handle("restart-peerjs")}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-vc-raised border border-vc-border text-amber-600 dark:text-amber-400 hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 transition-colors"
                >
                  {acting && actingAction === "restart-peerjs" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  Restart
                </button>
                <button
                  onClick={() => handle("stop")}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30 hover:bg-red-200 dark:hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                >
                  {acting && actingAction === "stop" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Square size={12} />
                  )}
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={() => handle("start")}
                disabled={acting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Start
              </button>
            )}
          </div>
        </div>

        {/* Config panel */}
        {showConfig && (
          <div className="bg-vc-bg border border-vc-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-vc-muted uppercase tracking-wide">
                Configuration
              </span>
              <button
                onClick={() => setShowConfig(false)}
                className="text-vc-muted hover:text-vc-text"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-vc-muted">
                Signaling server URL{" "}
                <span className="text-vc-subtle">(leave blank for public relay)</span>
              </label>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://my.peerserver.example"
                className="w-full px-3 py-2 bg-vc-surface border border-vc-border rounded-lg text-sm font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {!data.running && (
              <p className="text-xs text-vc-subtle">URL is applied when you click Start.</p>
            )}
            {data.running && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Stop and restart to apply a new URL.
              </p>
            )}
          </div>
        )}

        {/* Peer ID */}
        {data.peerId && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-vc-muted uppercase tracking-wide flex items-center gap-1.5">
              <Link2 size={11} /> Peer ID
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-vc-text bg-vc-bg border border-vc-border rounded-lg px-3 py-2 break-all">
                {data.peerId}
              </code>
              <CopyButton text={data.peerId} />
            </div>
            <p className="text-xs text-vc-subtle">
              Agents connect with:{" "}
              <code className="font-mono text-vc-muted">--peerjs {data.peerId}</code>
              {data.serverUrl && (
                <>
                  {" "}
                  <code className="font-mono text-vc-muted">
                    --peerjs-server {data.serverUrl}
                  </code>
                </>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle size={12} className="shrink-0" />
            {error}
          </div>
        )}
      </div>
    </>
  );
}

// ── Traffic BarChart ──────────────────────────────────────────────────────────

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--vc-surface, #1e293b)",
  border: "1px solid var(--vc-border, #334155)",
  borderRadius: "8px",
  color: "var(--vc-text, #f1f5f9)",
  fontSize: "12px",
};

function TrafficChart({
  stats,
  color,
}: {
  stats: TransportStats | undefined;
  color: "sky" | "violet";
}) {
  const palette    = color === "sky" ? "#0ea5e9" : "#8b5cf6";
  const paletteDim = color === "sky" ? "#38bdf8" : "#a78bfa";

  const toMB = (bytes: number) => bytes / (1024 * 1024);

  const byteData = [
    { name: "In",  value: toMB(stats?.bytesIn  ?? 0) },
    { name: "Out", value: toMB(stats?.bytesOut ?? 0) },
  ];

  const msgIn  = stats?.messagesIn  ?? 0;
  const msgOut = stats?.messagesOut ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Messages — counters instead of a chart (scale would dwarf byte values) */}
      <div className="bg-vc-bg border border-vc-border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-vc-muted uppercase tracking-wide">Messages</p>
        <div className="flex flex-1 items-center gap-4">
          <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-vc-surface border border-vc-border rounded-lg py-6">
            <span className="text-3xl font-bold tabular-nums" style={{ color: palette }}>
              {msgIn.toLocaleString()}
            </span>
            <span className="text-xs text-vc-muted">received</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-vc-surface border border-vc-border rounded-lg py-6">
            <span className="text-3xl font-bold tabular-nums" style={{ color: paletteDim }}>
              {msgOut.toLocaleString()}
            </span>
            <span className="text-xs text-vc-muted">sent</span>
          </div>
        </div>
      </div>

      {/* Bytes — bar chart scaled to MB */}
      <div className="bg-vc-bg border border-vc-border rounded-xl p-4">
        <p className="text-xs font-medium text-vc-muted uppercase tracking-wide mb-3">
          Data transferred (MB)
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={byteData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vc-border, #334155)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--vc-muted, #94a3b8)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--vc-muted, #94a3b8)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v < 1 ? v.toFixed(2) : v.toFixed(1)}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "var(--vc-raised, #1e293b)", opacity: 0.5 }}
              formatter={(value: number) => [`${value.toFixed(3)} MB`, "Size"]}
            />
            <Bar dataKey="value" name="MB" fill={paletteDim} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── ReactFlow Network Map ──────────────────────────────────────────────────────

interface ServerNodeData {
  wsPort: number;
  peerjsRunning: boolean;
}

interface AgentNodeData {
  label: string;
  transport: "ws" | "peerjs";
}

const ServerNode: React.FC<NodeProps<ServerNodeData>> = ({ data }) => (
  <div
    style={{
      background: "linear-gradient(135deg, #312e81 0%, #4338ca 100%)",
      border: "2px solid #6366f1",
      borderRadius: "12px",
      padding: "14px 18px",
      minWidth: "180px",
      color: "#e0e7ff",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 24px 0 rgba(99,102,241,0.25)",
    }}
  >
    {/* Explicit IDs so edges can pin to the correct side */}
    <Handle type="source" id="left"  position={Position.Left}  style={{ opacity: 0 }} />
    <Handle type="source" id="right" position={Position.Right} style={{ opacity: 0 }} />
    <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>
      Control Plane
    </div>
    <div
      style={{
        fontSize: "11px",
        color: "#a5b4fc",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <span>WebSocket :{data.wsPort}</span>
      <span>
        PeerJS{" "}
        <span
          style={{
            color: data.peerjsRunning ? "#86efac" : "#f87171",
            fontWeight: 600,
          }}
        >
          {data.peerjsRunning ? "● running" : "○ stopped"}
        </span>
      </span>
    </div>
  </div>
);

const AgentNode: React.FC<NodeProps<AgentNodeData>> = ({ data }) => {
  const isWs = data.transport === "ws";
  return (
    <div
      style={{
        background: isWs
          ? "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)"
          : "linear-gradient(135deg, #2e1065 0%, #6d28d9 100%)",
        border: `2px solid ${isWs ? "#0ea5e9" : "#8b5cf6"}`,
        borderRadius: "10px",
        padding: "10px 14px",
        minWidth: "130px",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
        boxShadow: isWs
          ? "0 2px 12px 0 rgba(14,165,233,0.2)"
          : "0 2px 12px 0 rgba(139,92,246,0.2)",
      }}
    >
      {/* WS agents sit to the RIGHT → handle on their left side facing the server.
          PeerJS agents sit to the LEFT → handle on their right side facing the server. */}
      <Handle
        type="target"
        id="conn"
        position={isWs ? Position.Left : Position.Right}
        style={{ opacity: 0 }}
      />
      <div style={{ fontWeight: 600, fontSize: "12px", marginBottom: "3px" }}>
        {data.label}
      </div>
      <div
        style={{
          fontSize: "10px",
          color: isWs ? "#7dd3fc" : "#c4b5fd",
          fontWeight: 500,
        }}
      >
        {isWs ? "WebSocket" : "WebRTC"}
      </div>
    </div>
  );
};

const SERVER_NODE_ID = "__control_plane__";
const SERVER_X = 340;
const SERVER_Y = 0;
const AGENT_GAP = 80;

function buildFlowGraph(
  agents: ConnectedAgentRow[],
  peerjsRunning: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const wsAgents = agents.filter((a) => a.transport === "ws");
  const pjAgents = agents.filter((a) => a.transport === "peerjs");

  const totalRows = Math.max(wsAgents.length, pjAgents.length, 1);
  const totalH = (totalRows - 1) * AGENT_GAP;
  const centerY = SERVER_Y + totalH / 2;

  const nodes: Node[] = [
    {
      id: SERVER_NODE_ID,
      type: "server",
      position: { x: SERVER_X, y: centerY - 40 },
      data: { wsPort: 8080, peerjsRunning },
      connectable: true,
      draggable: true,
    },
  ];

  const edges: Edge[] = [];

  // WS agents on the RIGHT — edge leaves server's right handle, enters agent's left handle
  wsAgents.forEach((agent, i) => {
    const y = i * AGENT_GAP;
    nodes.push({
      id: `ws-${agent.id}`,
      type: "agent",
      position: { x: SERVER_X + 280, y },
      data: { label: agent.name, transport: "ws" },
    });
    edges.push({
      id: `edge-ws-${agent.id}`,
      source: SERVER_NODE_ID,
      sourceHandle: "right",
      target: `ws-${agent.id}`,
      targetHandle: "conn",
      label: "ws",
      style: { stroke: "#0ea5e9", strokeWidth: 2 },
      labelStyle: { fill: "#0ea5e9", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
      animated: true,
    });
  });

  // PeerJS agents on the LEFT — edge leaves server's left handle, enters agent's right handle
  pjAgents.forEach((agent, i) => {
    const y = i * AGENT_GAP;
    nodes.push({
      id: `pj-${agent.id}`,
      type: "agent",
      position: { x: SERVER_X - 260, y },
      data: { label: agent.name, transport: "peerjs" },
    });
    edges.push({
      id: `edge-pj-${agent.id}`,
      source: SERVER_NODE_ID,
      sourceHandle: "left",
      target: `pj-${agent.id}`,
      targetHandle: "conn",
      label: "webrtc",
      style: { stroke: "#8b5cf6", strokeWidth: 2 },
      labelStyle: { fill: "#8b5cf6", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
      animated: true,
    });
  });

  return { nodes, edges };
}

function NetworkMapFlow({
  agents,
  peerjsRunning,
}: {
  agents: ConnectedAgentRow[];
  peerjsRunning: boolean;
}) {
  const nodeTypes = useMemo(() => ({ server: ServerNode, agent: AgentNode }), []);
  const { nodes, edges } = useMemo(
    () => buildFlowGraph(agents, peerjsRunning),
    [agents, peerjsRunning],
  );

  return (
    <div style={{ width: "100%", height: "420px", position: "relative" }}>
      {agents.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              color: "var(--vc-muted, #94a3b8)",
              fontSize: "13px",
              background: "var(--vc-surface, #0f172a)",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--vc-border, #1e293b)",
            }}
          >
            No agents connected — topology will appear here
          </span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Background color="#334155" gap={20} />
      </ReactFlow>
      <style>{`
        .react-flow__controls button {
          background: var(--vc-surface, #1e293b) !important;
          border: 1px solid var(--vc-border, #334155) !important;
          color: var(--vc-muted, #94a3b8) !important;
        }
        .react-flow__controls button:hover {
          background: var(--vc-raised, #1e293b) !important;
          color: var(--vc-text, #f1f5f9) !important;
        }
        .react-flow__edge-label {
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// ── Comparison chart (Map tab) ─────────────────────────────────────────────────

function ComparisonChart({
  ws,
  peerjs,
}: {
  ws: TransportStats | undefined;
  peerjs: TransportStats | undefined;
}) {
  const toMB = (b: number) => b / (1024 * 1024);

  // Messages side — counters per transport
  const msgRows = [
    { label: "Received", ws: ws?.messagesIn ?? 0,  pj: peerjs?.messagesIn  ?? 0 },
    { label: "Sent",     ws: ws?.messagesOut ?? 0, pj: peerjs?.messagesOut ?? 0 },
  ];

  // Bytes side — MB bar chart
  const byteData = [
    { name: "In",  WebSocket: toMB(ws?.bytesIn  ?? 0), WebRTC: toMB(peerjs?.bytesIn  ?? 0) },
    { name: "Out", WebSocket: toMB(ws?.bytesOut ?? 0), WebRTC: toMB(peerjs?.bytesOut ?? 0) },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Message counters */}
      <div className="bg-vc-bg border border-vc-border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-vc-muted uppercase tracking-wide">Messages</p>
        <div className="flex flex-col gap-2">
          {/* Header */}
          <div className="grid grid-cols-3 text-xs text-vc-subtle font-medium px-1">
            <span />
            <span className="text-center text-sky-500">WebSocket</span>
            <span className="text-center text-violet-500">WebRTC</span>
          </div>
          {msgRows.map(({ label, ws: w, pj }) => (
            <div key={label} className="grid grid-cols-3 items-center bg-vc-surface border border-vc-border rounded-lg px-3 py-2">
              <span className="text-xs text-vc-muted">{label}</span>
              <span className="text-center text-lg font-bold tabular-nums text-sky-400">{w.toLocaleString()}</span>
              <span className="text-center text-lg font-bold tabular-nums text-violet-400">{pj.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bytes bar chart in MB */}
      <div className="bg-vc-bg border border-vc-border rounded-xl p-4">
        <p className="text-xs font-medium text-vc-muted uppercase tracking-wide mb-3">
          Data transferred (MB)
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byteData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vc-border, #334155)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--vc-muted, #94a3b8)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--vc-muted, #94a3b8)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v < 1 ? v.toFixed(2) : v.toFixed(1)}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "var(--vc-raised, #1e293b)", opacity: 0.5 }}
              formatter={(value: number) => [`${value.toFixed(3)} MB`, "Size"]}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "var(--vc-muted, #94a3b8)" }} />
            <Bar dataKey="WebSocket" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="WebRTC"    fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Tab components ─────────────────────────────────────────────────────────────

function WsTab({
  stats,
  agents,
  logs,
  onRestartWs,
}: {
  stats: TransportStats | undefined;
  agents: ConnectedAgentRow[];
  logs: LogEntry[];
  onRestartWs: () => Promise<void>;
}) {
  const [restarting, setRestarting] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);

  async function handleRestart() {
    if (
      !window.confirm(
        "Restart the WebSocket server? All agents will be disconnected.",
      )
    )
      return;
    setRestarting(true);
    try {
      await onRestartWs();
      setSuccessBanner(true);
      setTimeout(() => setSuccessBanner(false), 3000);
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Success banner */}
      {successBanner && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/20 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-400">
          <Check size={14} className="shrink-0" />
          WebSocket server restarted successfully.
        </div>
      )}

      {/* Status card */}
      <div className="rounded-xl border bg-sky-50/60 dark:bg-sky-500/5 border-sky-300 dark:border-sky-500/30 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-sky-100 dark:bg-sky-500/20 border border-sky-300 dark:border-sky-500/30">
            <Wifi size={18} className="text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-vc-text">WebSocket</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-500/30">
                Always on
              </span>
            </div>
            <p className="text-xs text-vc-muted mt-0.5">TCP on port 8080 — always running</p>
          </div>
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-vc-raised border border-vc-border text-amber-600 dark:text-amber-400 hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50 transition-colors"
          >
            {restarting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Restart WS
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatBox label="Active agents" value={stats?.activeAgents ?? 0} />
          <StatBox label="Pending" value={stats?.pendingConnections ?? 0} />
          <StatBox label="Total conn." value={stats?.connectionsTotal ?? 0} />
          <StatBox
            label="Messages in"
            value={(stats?.messagesIn ?? 0).toLocaleString()}
          />
          <StatBox
            label="Messages out"
            value={(stats?.messagesOut ?? 0).toLocaleString()}
          />
          <StatBox
            label="Data transferred"
            value={formatBytes((stats?.bytesIn ?? 0) + (stats?.bytesOut ?? 0))}
          />
        </div>
      </div>

      {/* Chart */}
      <TrafficChart stats={stats} color="sky" />

      {/* Table */}
      <AgentsTable agents={agents} transport="ws" />

      {/* Log panel */}
      <LogPanel logs={logs} />
    </div>
  );
}

// ── PeerJS setup guide ────────────────────────────────────────────────────────

type SetupFlavour = "docker" | "kubernetes";

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className={`bg-gray-950 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre lang-${language}`}>
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all"
      >
        {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const DOCKER_QUICKSTART = `docker run -d \\
  --name peerjs-server \\
  --restart unless-stopped \\
  -p 9000:9000 \\
  peerjs/peerjs-server:latest`;

const DOCKER_COMPOSE = `services:
  peerjs-server:
    image: peerjs/peerjs-server:latest
    container_name: peerjs-server
    restart: unless-stopped
    ports:
      - "9000:9000"
    environment:
      # Optional: set a secret so only authorised peers can connect
      # PEERJS_KEY: "your-secret-key"
      PEERJS_EXPIRE_TIMEOUT: "5000"
      PEERJS_ALIVE_TIMEOUT: "60000"`;

const DOCKER_NGINX = `# Reverse-proxy snippet (nginx) — put PeerJS behind TLS
location /peerjs/ {
    proxy_pass         http://peerjs-server:9000/;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host       $host;
}`;

const K8S_MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: peerjs-server
  namespace: default          # change if needed
  labels:
    app: peerjs-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: peerjs-server
  template:
    metadata:
      labels:
        app: peerjs-server
    spec:
      containers:
        - name: peerjs-server
          image: peerjs/peerjs-server:latest
          ports:
            - containerPort: 9000
          env:
            - name: PEERJS_EXPIRE_TIMEOUT
              value: "5000"
            - name: PEERJS_ALIVE_TIMEOUT
              value: "60000"
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: peerjs-server
  namespace: default
spec:
  selector:
    app: peerjs-server
  ports:
    - port: 9000
      targetPort: 9000
  type: ClusterIP          # use LoadBalancer or NodePort to expose externally`;

const K8S_APPLY = `kubectl apply -f peerjs-server.yaml

# Verify it started
kubectl rollout status deployment/peerjs-server
kubectl get pods -l app=peerjs-server`;

const K8S_INGRESS = `# Optional: expose via an Ingress (requires cert-manager for TLS)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: peerjs-server
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # cert-manager.io/cluster-issuer: letsencrypt-prod  # uncomment for TLS
spec:
  rules:
    - host: peerjs.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: peerjs-server
                port:
                  number: 9000`;

function PeerjsSetupGuide({ configuredUrl }: { configuredUrl: string | null }) {
  const [open, setOpen] = useState(!configuredUrl);
  const [flavour, setFlavour] = useState<SetupFlavour>("docker");

  const internalUrl =
    flavour === "docker"
      ? "http://localhost:9000"
      : "http://peerjs-server.default.svc.cluster.local:9000";

  return (
    <div className="rounded-xl border border-vc-border bg-vc-surface overflow-hidden">
      {/* Accordion header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-vc-raised/50 transition-colors"
      >
        <Terminal size={16} className="text-violet-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-vc-text">Self-host a PeerJS signaling server</span>
          <p className="text-xs text-vc-muted mt-0.5">
            Run your own relay for maximum privacy and no rate limits — Docker or Kubernetes
          </p>
        </div>
        {open
          ? <ChevronDown size={15} className="text-vc-muted shrink-0" />
          : <ChevronRight size={15} className="text-vc-muted shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-vc-border px-5 pb-5 pt-4 space-y-5">
          {/* Flavour tabs */}
          <div className="flex gap-1 bg-vc-bg border border-vc-border rounded-lg p-1 w-fit">
            {([
              { id: "docker" as SetupFlavour, icon: <Package size={13} />, label: "Docker" },
              { id: "kubernetes" as SetupFlavour, icon: <Container size={13} />, label: "Kubernetes" },
            ] as const).map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setFlavour(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  flavour === id
                    ? "bg-violet-600 text-white"
                    : "text-vc-muted hover:text-vc-text hover:bg-vc-raised",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Docker instructions */}
          {flavour === "docker" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-vc-text">1. Quick start</p>
                <CodeBlock code={DOCKER_QUICKSTART} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-vc-text">2. Or with Docker Compose</p>
                <p className="text-xs text-vc-muted">Save as <code className="font-mono bg-vc-raised px-1 rounded">docker-compose.yml</code> then run <code className="font-mono bg-vc-raised px-1 rounded">docker compose up -d</code>.</p>
                <CodeBlock code={DOCKER_COMPOSE} language="yaml" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-vc-text">3. Put it behind a reverse proxy (optional but recommended)</p>
                <p className="text-xs text-vc-muted">PeerJS uses WebSocket upgrades — make sure your proxy forwards the <code className="font-mono bg-vc-raised px-1 rounded">Upgrade</code> header.</p>
                <CodeBlock code={DOCKER_NGINX} language="nginx" />
              </div>

              <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-lg px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">4. Point this control plane at your server</p>
                <p className="text-xs text-sky-700/80 dark:text-sky-400/70">
                  Open the configuration panel above (⚙) and set the signaling server URL to:
                </p>
                <code className="block text-xs font-mono bg-sky-100 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/20 rounded px-3 py-1.5 text-sky-800 dark:text-sky-300">
                  {internalUrl}
                </code>
                <p className="text-xs text-sky-700/70 dark:text-sky-400/60">
                  If you added a reverse proxy with TLS, use the <code className="font-mono">https://</code> URL instead. Then click Start.
                </p>
              </div>
            </div>
          )}

          {/* Kubernetes instructions */}
          {flavour === "kubernetes" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-vc-text">1. Apply the manifest</p>
                <p className="text-xs text-vc-muted">Save as <code className="font-mono bg-vc-raised px-1 rounded">peerjs-server.yaml</code> and apply it.</p>
                <CodeBlock code={K8S_MANIFEST} language="yaml" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-vc-text">2. Deploy and verify</p>
                <CodeBlock code={K8S_APPLY} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-vc-text">3. Expose externally (optional)</p>
                <p className="text-xs text-vc-muted">
                  If the control plane runs <em>inside</em> the same cluster, the ClusterIP service is enough and you can skip this step. For external agents, add an Ingress:
                </p>
                <CodeBlock code={K8S_INGRESS} language="yaml" />
              </div>

              <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-lg px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">4. Point this control plane at your server</p>
                <p className="text-xs text-sky-700/80 dark:text-sky-400/70">
                  Open the configuration panel above (⚙) and set the signaling server URL. Use the internal cluster DNS if running in the same cluster:
                </p>
                <code className="block text-xs font-mono bg-sky-100 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/20 rounded px-3 py-1.5 text-sky-800 dark:text-sky-300">
                  {internalUrl}
                </code>
                <p className="text-xs text-sky-700/70 dark:text-sky-400/60">
                  Or use your Ingress hostname (e.g. <code className="font-mono">https://peerjs.your-domain.com</code>) for cross-cluster or external agents. Then click Start.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeerjsTab({
  data,
  stats,
  agents,
  logs,
  onAction,
}: {
  data: NetworkData["peerjs"];
  stats: TransportStats | undefined;
  agents: ConnectedAgentRow[];
  logs: LogEntry[];
  onAction: (action: "start" | "stop" | "restart-peerjs", serverUrl?: string | null) => Promise<void>;
}) {
  const running = data.running;
  return (
    <div className="space-y-5">
      {/* Control card */}
      <PeerjsPanel data={data} onAction={onAction} />

      {/* Not running banner */}
      {!running && (
        <div className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle size={15} className="shrink-0" />
          PeerJS relay is not running. Start it above to accept WebRTC agent connections.
        </div>
      )}

      {/* Stat boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatBox label="Active agents" value={stats?.activeAgents ?? 0} disabled={!running} />
        <StatBox label="Pending" value={stats?.pendingConnections ?? 0} disabled={!running} />
        <StatBox label="Total conn." value={stats?.connectionsTotal ?? 0} disabled={!running} />
        <StatBox
          label="Messages in"
          value={(stats?.messagesIn ?? 0).toLocaleString()}
          disabled={!running}
        />
        <StatBox
          label="Messages out"
          value={(stats?.messagesOut ?? 0).toLocaleString()}
          disabled={!running}
        />
        <StatBox
          label="Data transferred"
          value={formatBytes((stats?.bytesIn ?? 0) + (stats?.bytesOut ?? 0))}
          disabled={!running}
        />
      </div>

      {/* Chart */}
      <TrafficChart stats={stats} color="violet" />

      {/* Table */}
      <AgentsTable agents={agents} transport="peerjs" />

      {/* Log panel */}
      <LogPanel logs={logs} />
    </div>
  );
}

function MapTab({
  stats,
  peerjs,
  agents,
}: {
  stats: NetworkData["stats"] | undefined;
  peerjs: NetworkData["peerjs"];
  agents: ConnectedAgentRow[];
}) {
  return (
    <div className="space-y-5">
      {/* Comparison chart */}
      <ComparisonChart ws={stats?.ws} peerjs={stats?.peerjs} />

      {/* ReactFlow topology */}
      <div className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-vc-border">
          <span className="text-sm font-semibold text-vc-text">Network topology</span>
          <span className="ml-2 text-xs text-vc-subtle">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} connected
          </span>
        </div>
        <NetworkMapFlow agents={agents} peerjsRunning={peerjs.running} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "ws" as const, label: "WebSocket", icon: Wifi },
  { id: "peerjs" as const, label: "WebRTC / PeerJS", icon: Radio },
  { id: "map" as const, label: "Map", icon: Map },
];

export default function NetworkPage() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"ws" | "peerjs" | "map">("ws");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/network");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch network data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    intervalRef.current = setInterval(() => fetchData(true), 5_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  async function handlePeerjsAction(
    action: "start" | "stop" | "restart-peerjs",
    serverUrl?: string | null,
  ) {
    const res = await fetch("/api/network", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, serverUrl }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    await fetchData(false);
  }

  async function handleRestartWs() {
    const res = await fetch("/api/network", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart-ws" }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    await fetchData(false);
  }

  const stats = data?.stats;
  const agents = stats?.agents ?? [];
  const logs = data?.logs ?? { ws: [], peerjs: [] };

  return (
    <div className="p-6 w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-vc-text flex items-center gap-2">
            <Activity size={20} className="text-indigo-400" />
            Network
          </h1>
          <p className="text-sm text-vc-muted mt-0.5">
            Monitor and control transport connections
            {stats?.startedAt && (
              <span className="ml-1.5 text-vc-subtle">
                · server up since {timeAgo(stats.startedAt)}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchData(false)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-vc-surface border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} />
          {error}
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-vc-border">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === id
                    ? "border-indigo-500 text-indigo-500 dark:text-indigo-400"
                    : "border-transparent text-vc-muted hover:text-vc-text",
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          {tab === "ws" && (
            <WsTab
              stats={stats?.ws}
              agents={agents}
              logs={logs.ws}
              onRestartWs={handleRestartWs}
            />
          )}
          {tab === "peerjs" && data && (
            <PeerjsTab
              data={data.peerjs}
              stats={stats?.peerjs}
              agents={agents}
              logs={logs.peerjs}
              onAction={handlePeerjsAction}
            />
          )}
          {tab === "map" && data && (
            <MapTab stats={stats} peerjs={data.peerjs} agents={agents} />
          )}
        </>
      )}
    </div>
  );
}
