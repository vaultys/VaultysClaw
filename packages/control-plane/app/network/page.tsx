"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Wifi,
  Radio,
  Activity,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Link2,
  Copy,
  Check,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface NetworkData {
  stats: {
    startedAt: string;
    ws: TransportStats;
    peerjs: TransportStats;
    agents: ConnectedAgentRow[];
  } | null;
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

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-vc-bg border border-vc-border rounded-lg px-4 py-3">
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
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-vc-raised border border-vc-border text-vc-muted hover:text-vc-text transition-colors"
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── PeerJS control panel ───────────────────────────────────────────────────────

function PeerjsPanel({
  data,
  onAction,
}: {
  data: NetworkData["peerjs"];
  onAction: (action: "start" | "stop", serverUrl?: string | null) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(data.serverUrl ?? "");

  async function handle(action: "start" | "stop") {
    setActing(true);
    setError(null);
    try {
      await onAction(action, action === "start" ? (serverUrl.trim() || null) : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className={cn(
      "rounded-xl border p-5 space-y-4",
      data.running
        ? "bg-violet-50/60 dark:bg-violet-500/5 border-violet-300 dark:border-violet-500/30"
        : "bg-vc-surface border-vc-border",
    )}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center border",
          data.running
            ? "bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/30"
            : "bg-vc-raised border-vc-border",
        )}>
          <Radio size={18} className={data.running ? "text-violet-600 dark:text-violet-400" : "text-vc-muted"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-vc-text">WebRTC / PeerJS</span>
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              data.running
                ? "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/30"
                : "bg-vc-raised text-vc-muted border-vc-border",
            )}>
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
          {data.running ? (
            <button
              onClick={() => handle("stop")}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30 hover:bg-red-200 dark:hover:bg-red-500/25 disabled:opacity-50 transition-colors"
            >
              {acting ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
              Stop
            </button>
          ) : (
            <button
              onClick={() => handle("start")}
              disabled={acting || !data.peerId}
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
            <span className="text-xs font-medium text-vc-muted uppercase tracking-wide">Configuration</span>
            <button onClick={() => setShowConfig(false)} className="text-vc-muted hover:text-vc-text">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-vc-muted">Signaling server URL <span className="text-vc-subtle">(leave blank for public relay)</span></label>
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
            <p className="text-xs text-amber-600 dark:text-amber-400">Stop and restart to apply a new URL.</p>
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
            <code className="flex-1 text-xs font-mono text-vc-text-2 bg-vc-bg border border-vc-border rounded-lg px-3 py-2 break-all">
              {data.peerId}
            </code>
            <CopyButton text={data.peerId} />
          </div>
          <p className="text-xs text-vc-subtle">
            Agents connect with:{" "}
            <code className="font-mono text-vc-muted">--peerjs {data.peerId}</code>
            {data.serverUrl && (
              <> <code className="font-mono text-vc-muted">--peerjs-server {data.serverUrl}</code></>
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
  );
}

// ── WebSocket panel ───────────────────────────────────────────────────────────

function WsPanel({ stats }: { stats: TransportStats | undefined }) {
  return (
    <div className="rounded-xl border bg-sky-50/60 dark:bg-sky-500/5 border-sky-300 dark:border-sky-500/30 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-sky-100 dark:bg-sky-500/20 border border-sky-300 dark:border-sky-500/30">
          <Wifi size={18} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-vc-text">WebSocket</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-500/30">
              Always on
            </span>
          </div>
          <p className="text-xs text-vc-muted mt-0.5">TCP on port 8080 — always running</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Active agents" value={stats?.activeAgents ?? 0} />
        <StatBox label="Pending" value={stats?.pendingConnections ?? 0} />
        <StatBox label="Total conn." value={stats?.connectionsTotal ?? 0} />
        <StatBox label="Messages in" value={(stats?.messagesIn ?? 0).toLocaleString()} sub={formatBytes(stats?.bytesIn ?? 0)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-xs text-vc-muted">
          <ArrowDownToLine size={13} className="text-sky-500" />
          <span>{(stats?.bytesIn ?? 0) > 0 ? formatBytes(stats!.bytesIn) : "—"} received</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-vc-muted">
          <ArrowUpFromLine size={13} className="text-sky-500" />
          <span>{(stats?.bytesOut ?? 0) > 0 ? formatBytes(stats!.bytesOut) : "—"} sent</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NetworkPage() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  async function handlePeerjsAction(action: "start" | "stop", serverUrl?: string | null) {
    const res = await fetch("/api/network", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, serverUrl }),
    });
    const body = await res.json() as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    await fetchData(false);
  }

  const stats = data?.stats;
  const agents = stats?.agents ?? [];

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
              <span className="ml-1.5 text-vc-subtle">· server up since {timeAgo(stats.startedAt)}</span>
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
          {/* Transport cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WsPanel stats={stats?.ws} />
            {data && (
              <PeerjsPanel data={data.peerjs} onAction={handlePeerjsAction} />
            )}
          </div>

          {/* PeerJS stats (shown only when running) */}
          {data?.peerjs.running && stats?.peerjs && (
            <div className="rounded-xl border border-violet-200 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/5 p-4">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide mb-3">WebRTC traffic</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label="Active agents" value={stats.peerjs.activeAgents} />
                <StatBox label="Pending" value={stats.peerjs.pendingConnections} />
                <StatBox label="Total conn." value={stats.peerjs.connectionsTotal} />
                <StatBox label="Messages in" value={stats.peerjs.messagesIn.toLocaleString()} sub={formatBytes(stats.peerjs.bytesIn)} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-center gap-2 text-xs text-vc-muted">
                  <ArrowDownToLine size={13} className="text-violet-500" />
                  <span>{stats.peerjs.bytesIn > 0 ? formatBytes(stats.peerjs.bytesIn) : "—"} received</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-vc-muted">
                  <ArrowUpFromLine size={13} className="text-violet-500" />
                  <span>{stats.peerjs.bytesOut > 0 ? formatBytes(stats.peerjs.bytesOut) : "—"} sent</span>
                </div>
              </div>
            </div>
          )}

          {/* Live connections table */}
          <div className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-vc-border flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-vc-text">Live connections</span>
                <span className="ml-2 text-xs text-vc-subtle">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-vc-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Auto-refreshes every 5s
              </div>
            </div>

            {agents.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-vc-muted">
                No agents connected
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vc-border text-left text-xs font-medium text-vc-subtle uppercase tracking-wider">
                    <th className="px-5 py-3">Agent</th>
                    <th className="px-5 py-3">DID</th>
                    <th className="px-5 py-3">Transport</th>
                    <th className="px-5 py-3">Connected</th>
                    <th className="px-5 py-3">Last heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vc-border">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-vc-raised/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-vc-text">{agent.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-vc-muted">
                        <span title={agent.id}>{shortDid(agent.id)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border",
                          agent.transport === "peerjs"
                            ? "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/30"
                            : "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-500/30",
                        )}>
                          {agent.transport === "peerjs"
                            ? <><Radio size={10} /> WebRTC</>
                            : <><Wifi size={10} /> WebSocket</>}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-vc-muted">{timeAgo(agent.connectedAt)}</td>
                      <td className="px-5 py-3 text-xs text-vc-muted">{timeAgo(agent.lastHeartbeat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
