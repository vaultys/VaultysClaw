"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Bot,
  Wifi,
  WifiOff,
  Zap,
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Minimize2,
  ExternalLink,
  X,
  Cpu,
  Globe2,
  Shield,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { useAdminWS } from "@/hooks/useAdminWS";
import { useRole } from "@/hooks/useRole";
import type { MapMarker } from "@/components/map/WorldMap";
import { formatCompactNumber, shortDid } from "@vaultysclaw/shared";
import { AgentInfo } from "@/lib/contracts";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);

/* ─── Types ───────────────────────────────────────────────────── */

interface TokenStats {
  allTime: { promptTokens: number; completionTokens: number };
  daily: { promptTokens: number; completionTokens: number };
  monthly: { promptTokens: number; completionTokens: number };
}

interface Intent {
  intentId: string;
  agentDid: string;
  action: string;
  params?: Record<string, unknown> | null;
  status: "success" | "failed" | "pending";
  output?: Record<string, unknown> | null;
  error?: string | null;
  sentAt: string;
  completedAt: string | null;
}

interface WorkflowStep {
  id: string;
  stepId: string;
  agentId: string | null;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface NetworkTransport {
  messagesIn: number;
  messagesOut: number;
  bytesIn: number;
  bytesOut: number;
  connectionsTotal: number;
  activeAgents: number;
}

interface NetworkStats {
  stats: {
    ws: NetworkTransport;
    peerjs: NetworkTransport;
  } | null;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
}

type FeedEventType =
  | "agent_online"
  | "agent_offline"
  | "intent_success"
  | "intent_failed"
  | "intent_pending"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_running"
  | "registration"
  | "system";

interface FeedEvent {
  id: string;
  type: FeedEventType;
  message: string;
  detail?: string;
  timestamp: Date;
  /** If set, clicking this event opens the detail popup for this entity. */
  entityId?: string;
  entityType?: "agent" | "workflow" | "intent";
}

export interface MissionControlCoreProps {
  mode: "embedded" | "standalone";
}

type DetailItem =
  | { type: "agent"; id: string }
  | { type: "workflow"; id: string }
  | { type: "intent"; id: string };

/* ─── Helpers ─────────────────────────────────────────────────── */

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function duration(start: string, end: string | null): string {
  const s = parseUTC(start);
  const e = end ? parseUTC(end) : new Date();
  const ms = e.getTime() - s.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function timeAgo(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? parseUTC(d) : d;
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(0)} KB`;
  return `${n} B`;
}

const FEED_ICON: Record<FeedEventType, string> = {
  agent_online: "↑",
  agent_offline: "↓",
  intent_success: "✓",
  intent_failed: "✗",
  intent_pending: "⋯",
  workflow_completed: "⊛",
  workflow_failed: "⊘",
  workflow_running: "▷",
  registration: "⊕",
  system: "·",
};

/* Maps event type to design-system color class */
const FEED_COLOR: Record<FeedEventType, string> = {
  agent_online: "text-success-600",
  agent_offline: "text-foreground-600",
  intent_success: "text-success-600",
  intent_failed: "text-danger-600",
  intent_pending: "text-warning-600",
  workflow_completed: "text-success-600",
  workflow_failed: "text-danger-600",
  workflow_running: "text-primary-600",
  registration: "text-warning-600",
  system: "text-foreground-600",
};

/* ─── Core dashboard ──────────────────────────────────────────── */

export function MissionControlCore({ mode }: MissionControlCoreProps) {
  const router = useRouter();
  const { isGlobalAdmin, isLoading } = useRole();
  const {
    agents: agentsState,
    registrations,
    connected: wsConnected,
    lastEvent,
  } = useAdminWS();

  const [clock, setClock] = useState("");
  const [mapHeight, setMapHeight] = useState(200);
  const [selectedDetail, setSelectedDetail] = useState<DetailItem | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const isFirstAgentUpdate = useRef(true);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [recentIntents, setRecentIntents] = useState<Intent[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const seenIntentIds = useRef(new Set<string>());
  const intentsInitialized = useRef(false);
  const prevOnlineIds = useRef(new Set<string>());
  const prevLastEvent = useRef<string | null>(null);

  /* ── Auth guard ── */
  useEffect(() => {
    if (!isLoading && !isGlobalAdmin) router.replace("/");
  }, [isLoading, isGlobalAdmin, router]);

  /* ── Close modal on Escape ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedDetail(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── Map container height via ResizeObserver ── */
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setMapHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Live UTC clock ── */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, "0");
      const mm = String(now.getUTCMinutes()).padStart(2, "0");
      const ss = String(now.getUTCSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss} UTC`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Feed helper ── */
  const pushFeed = useCallback((event: Omit<FeedEvent, "id" | "timestamp">) => {
    setFeed((prev) => [
      {
        ...event,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
      },
      ...prev.slice(0, 79),
    ]);
  }, []);

  /* ── Watch WS agent connect/disconnect ── */
  useEffect(() => {
    const currentOnline = new Set(
      agentsState.agents.filter((a) => a.online).map((a) => a.did)
    );
    // On the very first update, just snapshot the current state without emitting
    // events — we don't want a flood of "connected" for agents already online.
    if (isFirstAgentUpdate.current) {
      isFirstAgentUpdate.current = false;
      prevOnlineIds.current = currentOnline;
      return;
    }
    for (const agent of agentsState.agents) {
      const wasOnline = prevOnlineIds.current.has(agent.did);
      if (agent.online && !wasOnline) {
        pushFeed({
          type: "agent_online",
          message: `${agent.name} connected`,
          detail: agent.reportedLlm?.model,
          entityId: agent.did,
          entityType: "agent",
        });
      } else if (!agent.online && wasOnline) {
        pushFeed({
          type: "agent_offline",
          message: `${agent.name} disconnected`,
          entityId: agent.did,
          entityType: "agent",
        });
      }
    }
    prevOnlineIds.current = currentOnline;
  }, [agentsState.agents, pushFeed]);

  useEffect(() => {
    if (lastEvent && lastEvent !== prevLastEvent.current) {
      if (lastEvent === "registration_requested") {
        const pending = registrations.filter((r) => r.status === "pending");
        if (pending.length > 0) {
          pushFeed({
            type: "registration",
            message: `New registration: ${pending[0].agentName}`,
          });
        }
      }
      prevLastEvent.current = lastEvent;
    }
  }, [lastEvent, registrations, pushFeed]);

  /* ── Poll map markers (30 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/map");
        if (!res.ok) return;
        const d = await res.json();
        setMarkers(Array.isArray(d) ? d : (d.markers ?? []));
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll token stats (30 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/stats/tokens");
        if (res.ok) setTokenStats(await res.json());
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll intents → activity feed (5 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/intents?limit=20");
        if (!res.ok) return;
        const data = await res.json();
        const intents: Intent[] = data.intents ?? [];
        setRecentIntents(intents.slice(0, 8));

        if (!intentsInitialized.current) {
          intentsInitialized.current = true;
          // Seed older intents (5+) as seen without emitting events
          intents
            .slice(5)
            .forEach((i) => seenIntentIds.current.add(i.intentId));
          // Show the most recent 5 as historical feed entries (oldest first)
          for (const intent of [...intents.slice(0, 5)].reverse()) {
            seenIntentIds.current.add(intent.intentId);
            const agentName =
              agentsState.agents.find((a) => a.did === intent.agentDid)?.name ??
              `…${intent.agentDid.slice(-6)}`;
            const type: FeedEventType =
              intent.status === "success"
                ? "intent_success"
                : intent.status === "failed"
                  ? "intent_failed"
                  : "intent_pending";
            pushFeed({
              type,
              message: `${agentName}: ${intent.action}`,
              entityId: intent.intentId,
              entityType: "intent",
            });
          }
          return;
        }
        for (const intent of [...intents].reverse()) {
          if (seenIntentIds.current.has(intent.intentId)) continue;
          seenIntentIds.current.add(intent.intentId);
          const agentName =
            agentsState.agents.find((a) => a.did === intent.agentDid)?.name ??
            `…${intent.agentDid.slice(-6)}`;
          const type: FeedEventType =
            intent.status === "success"
              ? "intent_success"
              : intent.status === "failed"
                ? "intent_failed"
                : "intent_pending";
          pushFeed({ type, message: `${agentName}: ${intent.action}` });
        }
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 5_000);
    return () => clearInterval(id);
  }, [agentsState.agents, pushFeed]);

  /* ── Poll workflow runs (8 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/workflow-runs?pageSize=10&sortDir=desc");
        if (!res.ok) return;
        const data = await res.json();
        setWorkflowRuns(data.runs ?? []);
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 8_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll network stats (5 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/network");
        if (res.ok) setNetworkStats(await res.json());
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 5_000);
    return () => clearInterval(id);
  }, []);

  /* ── Derived values ── */
  const totalAgents = agentsState.total;
  const onlineAgents = agentsState.online;
  const pendingRegs = registrations.filter(
    (r) => r.status === "pending"
  ).length;
  const dailyCost = agentsState.agents.reduce(
    (sum, a) => sum + (a.dailyPriceSpent ?? 0),
    0
  );
  const dailyTokens = tokenStats
    ? tokenStats.daily.promptTokens + tokenStats.daily.completionTokens
    : 0;

  const realmMap = new Map<
    string,
    { name: string; color: string; online: number; total: number }
  >();
  for (const agent of agentsState.agents) {
    for (const agentRealm of agent.agentRealms ?? []) {
      const e = realmMap.get(agentRealm.realmId) ?? {
        name: agentRealm.realm.name,
        color: agentRealm.realm.color,
        online: 0,
        total: 0,
      };
      e.total++;
      if (agent.online) e.online++;
      realmMap.set(agentRealm.realmId, e);
    }
  }
  const realms = Array.from(realmMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const runningWorkflows = workflowRuns.filter(
    (r) => r.status === "running"
  ).length;

  if (isLoading || !isGlobalAdmin) return null;

  const isStandalone = mode === "standalone";

  /* ── Fullscreen toggle ── */
  function handleFullscreenToggle() {
    if (isStandalone) {
      router.push("/mission-control");
    } else {
      router.push("/mission-control/fullscreen");
    }
  }

  return (
    <div
      className={`${isStandalone ? "h-screen" : "h-full"} bg-background text-foreground flex flex-col overflow-hidden`}
      style={{
        fontFamily:
          "'JetBrains Mono','Fira Code','Cascadia Code',ui-monospace,monospace",
      }}
    >
      {/* ═══ HEADER ══════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-4 py-2 bg-background-100 border-b border-neutral-200/50 shrink-0 gap-4">
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success-600" />
          </span>
          <span className="text-xs font-bold tracking-[0.25em] text-success-600 uppercase">
            Mission Control
          </span>
          <span className="text-foreground-700 text-xs hidden sm:inline">
            ·
          </span>
          <span className="text-foreground-700 text-xs hidden sm:inline">
            VaultysClaw
          </span>
        </div>

        {/* Metrics strip */}
        <div className="flex items-center gap-5 text-xs flex-wrap">
          {/* Agents online */}
          <div className="flex items-center gap-1.5">
            <Bot size={15} className="text-foreground-600" />
            <span className="text-success-600 font-bold tabular-nums">
              {onlineAgents}
            </span>
            <span className="text-foreground-600">/</span>
            <span className="text-foreground-700 tabular-nums">
              {totalAgents}
            </span>
            <span className="text-foreground-600 text-[10px] ml-0.5">
              agents
            </span>
          </div>

          {/* Daily tokens */}
          {dailyTokens > 0 && (
            <div className="flex items-center gap-1.5">
              <Zap size={11} className="text-foreground-600" />
              <span className="text-primary-600 font-bold tabular-nums">
                {formatCompactNumber(dailyTokens)}
              </span>
              <span className="text-foreground-600 text-[10px]">tok/day</span>
            </div>
          )}

          {/* Daily cost */}
          <div className="flex items-center gap-1.5">
            <DollarSign size={11} className="text-foreground-600" />
            <span className="text-warning-600 font-bold tabular-nums">
              {fmtCost(dailyCost)}
            </span>
            <span className="text-foreground-600 text-[10px]">today</span>
          </div>

          {/* Pending registrations */}
          {pendingRegs > 0 && (
            <div className="flex items-center gap-1.5 animate-pulse">
              <AlertTriangle size={11} className="text-warning-600" />
              <span className="text-warning-600 font-bold">{pendingRegs}</span>
              <span className="text-warning-600 text-[10px]">pending</span>
            </div>
          )}

          {/* Running workflows */}
          {runningWorkflows > 0 && (
            <div className="flex items-center gap-1.5">
              <Loader2 size={11} className="text-primary-600 animate-spin" />
              <span className="text-primary-600 font-bold">
                {runningWorkflows}
              </span>
              <span className="text-foreground-600 text-[10px]">running</span>
            </div>
          )}

          {/* WS status */}
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <>
                <Wifi size={11} className="text-success-600" />
                <span className="text-success-600 font-bold">LIVE</span>
              </>
            ) : (
              <>
                <WifiOff size={11} className="text-danger-600" />
                <span className="text-danger-600">RECONNECTING</span>
              </>
            )}
          </div>

          {/* Clock */}
          <span className="text-foreground-700 tabular-nums text-[11px] hidden md:inline">
            {clock}
          </span>

          {/* Fullscreen / exit */}
          <button
            onClick={handleFullscreenToggle}
            className="p-1 rounded hover:bg-background-200 text-foreground-600 hover:text-foreground transition-colors"
            title={isStandalone ? "Exit fullscreen" : "Fullscreen"}
          >
            {isStandalone ? (
              <Minimize2 size={12} />
            ) : (
              <ExternalLink size={12} />
            )}
          </button>
        </div>
      </div>

      {/* ═══ MAIN GRID ═══════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] gap-2 p-2 overflow-hidden min-h-0">
        {/* ════ LEFT: Fleet + Realms + Token Burn ═══════════════════ */}
        <div className="flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 hidden lg:flex min-h-0">
          {/* Fleet header */}
          <PanelHeader
            title="Agent Fleet"
            right={
              <span className="text-[10px] text-foreground-600">
                <span className="text-success-600">{onlineAgents}</span> online
              </span>
            }
          />

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto">
            {agentsState.agents.length === 0 ? (
              <div className="px-3 py-6 text-center text-foreground-600 text-[11px]">
                No agents registered
              </div>
            ) : (
              agentsState.agents.map((agent) => (
                <div
                  key={agent.did}
                  className={`px-4 py-2.5 border-b border-neutral-200/40 flex gap-2 cursor-pointer transition-colors hover:bg-background-200/50 ${
                    !agent.online ? "opacity-35" : ""
                  }`}
                  onClick={() =>
                    setSelectedDetail({ type: "agent", id: agent.did })
                  }
                >
                  {/* Status dot with ping */}
                  <div className="mt-[5px] shrink-0">
                    {agent.online ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-success-600" />
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full h-2 w-2 bg-foreground-200/40" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {agent.name}
                      </span>
                      {agent.dailyPriceSpent != null &&
                        agent.dailyPriceSpent > 0.001 && (
                          <span className="text-[10px] text-warning-600 shrink-0">
                            {fmtCost(agent.dailyPriceSpent)}
                          </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {agent.reportedLlm && (
                        <span className="text-[10px] text-primary-700 bg-primary-500/15 px-1 py-px rounded border border-primary-500/50">
                          {agent.reportedLlm.model
                            .split("/")
                            .pop()
                            ?.slice(0, 18)}
                        </span>
                      )}
                      {agent.agentRealms?.slice(0, 1).map((ar) => (
                        <span
                          key={ar.realmId}
                          className="text-[10px] px-1 py-px rounded border"
                          style={{
                            color: ar.realm.color,
                            borderColor: `${ar.realm.color}40`,
                            background: `${ar.realm.color}15`,
                          }}
                        >
                          {ar.realm.name}
                        </span>
                      ))}
                    </div>

                    {agent.online && (
                      <div className="text-[10px] text-foreground-600 mt-0.5">
                        {agent.tokenHistory
                          ? `${formatCompactNumber(
                              (agent.tokenHistory.find(
                                (th) => th.granularity === "day"
                              )?.promptTokens ?? 0) +
                                (agent.tokenHistory.find(
                                  (th) => th.granularity === "day"
                                )?.completionTokens ?? 0)
                            )} tokens today`
                          : `hb ${timeAgo(agent.lastHeartbeat)}`}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Realm breakdown */}
          {realms.length > 0 && (
            <>
              <PanelHeader
                title="Realms"
                className="border-t border-neutral-200/50"
              />
              <div className="pb-2 shrink-0">
                {realms.map((realm) => {
                  const pct =
                    realm.total > 0
                      ? Math.round((realm.online / realm.total) * 100)
                      : 0;
                  return (
                    <div
                      key={realm.name}
                      className="px-4 py-2 flex items-center gap-2"
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: realm.color }}
                      />
                      <span className="text-[11px] text-foreground-600 flex-1 truncate">
                        {realm.name}
                      </span>
                      <div className="w-12 h-1 bg-background-200 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: realm.color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-foreground-700 tabular-nums w-8 text-right shrink-0">
                        {realm.online}/{realm.total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ════ CENTER: [Network|Consumption] → Map → [Workflows|Intents] ═ */}
        <div className="flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* ── Top row: Network | Consumption — gauge tile cards ── */}
          <div className="shrink-0 grid grid-cols-2 gap-2 p-2 bg-background border-b border-neutral-200/50">
            {/* Network card */}
            <div className="bg-background-100 border border-neutral-200/60 rounded-xl px-4 py-3 shadow-md shadow-black/10">
              <p className="text-[10px] font-bold tracking-[0.18em] text-foreground-500 uppercase mb-3">
                Network
              </p>
              {networkStats?.stats ? (
                (() => {
                  const ws = networkStats.stats.ws;
                  const pj = networkStats.stats.peerjs;
                  const totalBytes =
                    ws.bytesIn + ws.bytesOut + pj.bytesIn + pj.bytesOut;
                  const totalMsgs =
                    ws.messagesIn +
                    ws.messagesOut +
                    pj.messagesIn +
                    pj.messagesOut;
                  const agentsOnline = ws.activeAgents + pj.activeAgents;
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <StatTile
                          value={String(agentsOnline)}
                          label="agents"
                          color="text-primary-600"
                          pct={agentsOnline / Math.max(1, agentsState.total)}
                        />
                        <StatTile
                          value={formatCompactNumber(totalMsgs)}
                          label="messages"
                          color="text-foreground"
                          pct={Math.min(1, totalMsgs / 500_000)}
                        />
                        <StatTile
                          value={fmtBytes(totalBytes)}
                          label="data"
                          color="text-foreground"
                          pct={Math.min(1, totalBytes / (50 * 1024 * 1024))}
                        />
                      </div>
                      <p className="text-[9px] text-foreground-500 mt-3 tabular-nums text-center">
                        ↑&nbsp;{fmtBytes(ws.bytesOut + pj.bytesOut)}
                        &ensp;·&ensp; ↓&nbsp;{fmtBytes(ws.bytesIn + pj.bytesIn)}
                      </p>
                    </>
                  );
                })()
              ) : (
                <span className="text-[10px] text-foreground-600">
                  Loading…
                </span>
              )}
            </div>

            {/* Consumption card */}
            <div className="bg-background-100 border border-neutral-200/60 rounded-xl px-4 py-3 shadow-md shadow-black/10">
              <p className="text-[10px] font-bold tracking-[0.18em] text-foreground-500 uppercase mb-3">
                Consumption
              </p>
              {tokenStats ? (
                (() => {
                  const dp = tokenStats.daily.promptTokens;
                  const dc = tokenStats.daily.completionTokens;
                  const dt = dp + dc;
                  const mt =
                    tokenStats.monthly.promptTokens +
                    tokenStats.monthly.completionTokens;
                  const dailyCostVal = agentsState.agents.reduce(
                    (s, a) => s + (a.dailyPriceSpent ?? 0),
                    0
                  );
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <StatTile
                          value={formatCompactNumber(dt)}
                          label="today"
                          color="text-primary-600"
                          pct={Math.min(1, dt / 500_000)}
                        />
                        <StatTile
                          value={formatCompactNumber(mt)}
                          label="month"
                          color="text-foreground"
                          pct={Math.min(1, mt / 10_000_000)}
                        />
                        <StatTile
                          value={fmtCost(dailyCostVal)}
                          label="cost"
                          color="text-warning-600"
                          pct={Math.min(1, dailyCostVal / 5)}
                        />
                      </div>
                      <p className="text-[9px] text-foreground-500 mt-3 tabular-nums text-center">
                        In&nbsp;{formatCompactNumber(dp)}&ensp;·&ensp;Out&nbsp;
                        {formatCompactNumber(dc)}
                      </p>
                    </>
                  );
                })()
              ) : (
                <span className="text-[10px] text-foreground-600">
                  Loading…
                </span>
              )}
            </div>
          </div>

          {/* ── Map ── */}
          <div
            ref={mapContainerRef}
            className="h-[200px] shrink-0 relative bg-background rounded-xl overflow-hidden border border-neutral-200/60 shadow-md shadow-black/10"
          >
            {mapHeight > 0 && (
              <WorldMap
                markers={markers}
                height={mapHeight}
                canEditLocation={false}
              />
            )}
            {markers.length === 0 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <span className="text-[10px] text-foreground-600 bg-background-100/80 px-3 py-1 rounded-full border border-neutral-200/50">
                  Set agent locations to pin them on the globe
                </span>
              </div>
            )}
          </div>

          {/* ── Bottom row: Workflow Runs | Intents ── */}
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 overflow-hidden">
            {/* Workflow Runs */}
            <div className="flex flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 min-h-0">
              <PanelHeader
                title="Workflow Runs"
                right={
                  runningWorkflows > 0 ? (
                    <span className="flex items-center gap-1 text-[10px] text-primary-600">
                      <Loader2 size={8} className="animate-spin" />
                      {runningWorkflows} active
                    </span>
                  ) : (
                    <span className="text-[10px] text-foreground-600">
                      idle
                    </span>
                  )
                }
              />
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {workflowRuns.length === 0 ? (
                  <p className="px-1 py-4 text-center text-[10px] text-foreground-600">
                    No recent runs
                  </p>
                ) : (
                  workflowRuns.map((run) => (
                    <div
                      key={run.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setSelectedDetail({ type: "workflow", id: run.id })
                      }
                    >
                      <RunPill run={run} block />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Intents */}
            <div className="flex flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 min-h-0">
              {(() => {
                const total = recentIntents.length;
                const failed = recentIntents.filter(
                  (i) => i.status === "failed"
                ).length;
                const failRate =
                  total > 0 ? Math.round((failed / total) * 100) : 0;
                return (
                  <PanelHeader
                    title="Intents"
                    right={
                      total > 0 ? (
                        <span
                          className={`text-[10px] font-semibold tabular-nums ${failRate > 20 ? "text-danger-600" : failRate > 5 ? "text-warning-600" : "text-success-600"}`}
                        >
                          {failRate}% fail
                        </span>
                      ) : undefined
                    }
                  />
                );
              })()}
              <div className="flex-1 overflow-y-auto">
                {recentIntents.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[10px] text-foreground-600">
                    No recent intents
                  </p>
                ) : (
                  recentIntents.map((intent) => {
                    const agent = agentsState.agents.find(
                      (a) => a.did === intent.agentDid
                    );
                    return (
                      <div
                        key={intent.intentId}
                        className="px-4 py-2 flex items-start gap-2 border-b border-neutral-200/40 cursor-pointer hover:bg-background-200/30 transition-colors"
                        onClick={() =>
                          setSelectedDetail({
                            type: "intent",
                            id: intent.intentId,
                          })
                        }
                      >
                        <div className="mt-0.5 shrink-0">
                          {intent.status === "success" ? (
                            <CheckCircle
                              size={9}
                              className="text-success-600"
                            />
                          ) : intent.status === "failed" ? (
                            <XCircle size={9} className="text-danger-600" />
                          ) : (
                            <Loader2
                              size={9}
                              className="text-warning-600 animate-spin"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-foreground truncate">
                            {intent.action}
                          </p>
                          <p className="text-[9px] text-foreground-600 truncate">
                            {agent?.name ?? `…${intent.agentDid.slice(-6)}`} ·{" "}
                            {timeAgo(intent.sentAt)}
                          </p>
                          {intent.error && (
                            <p className="text-[9px] text-danger-600 truncate">
                              {intent.error.slice(0, 50)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ════ RIGHT: Live Activity Feed ════════════════════════════ */}
        <div className="flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 hidden lg:flex min-h-0">
          <PanelHeader
            title="Live Activity"
            right={
              <span
                className={`relative flex h-1.5 w-1.5 ${!wsConnected && "opacity-40"}`}
              >
                {wsConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                    wsConnected ? "bg-success-600" : "bg-foreground-200/40"
                  }`}
                />
              </span>
            }
          />

          {/* Scrolling feed */}
          <div className="flex-1 overflow-y-auto">
            {feed.length === 0 ? (
              <div className="px-3 py-6 text-center text-foreground-600 text-[11px]">
                Waiting for activity…
              </div>
            ) : (
              feed.map((event, i) => (
                <div
                  key={event.id}
                  className={`px-4 py-2.5 border-b border-neutral-200/50 flex gap-2 ${
                    i === 0 ? "bg-background-200/40 animate-fade-in" : ""
                  } ${event.entityId ? "cursor-pointer hover:bg-background-200/30 transition-colors" : ""}`}
                  style={{ opacity: Math.max(0.15, 1 - i * 0.013) }}
                  onClick={
                    event.entityId && event.entityType
                      ? () =>
                          setSelectedDetail({
                            type: event.entityType!,
                            id: event.entityId!,
                          })
                      : undefined
                  }
                >
                  <span
                    className={`shrink-0 text-[11px] font-bold w-3 text-center ${FEED_COLOR[event.type]}`}
                  >
                    {FEED_ICON[event.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[11px] leading-snug break-words ${FEED_COLOR[event.type]}`}
                    >
                      {event.message}
                    </p>
                    {event.detail && (
                      <p className="text-[10px] text-foreground-600 mt-px">
                        {event.detail}
                      </p>
                    )}
                    <p className="text-[10px] text-foreground-700 mt-0.5">
                      {timeAgo(event.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Detail popup ── */}
      {selectedDetail && (
        <DetailModal
          item={selectedDetail}
          agents={agentsState.agents}
          workflowRuns={workflowRuns}
          recentIntents={recentIntents}
          onClose={() => setSelectedDetail(null)}
          router={router}
        />
      )}
    </div>
  );
}

/* ─── Detail modal ────────────────────────────────────────────── */

function DetailModal({
  item,
  agents,
  workflowRuns,
  recentIntents,
  onClose,
  router,
}: {
  item: DetailItem;
  agents: AgentInfo[];
  workflowRuns: WorkflowRun[];
  recentIntents: Intent[];
  onClose: () => void;
  router: ReturnType<typeof import("next/navigation").useRouter>;
}) {
  // Fetch run steps when a workflow modal opens
  const [runSteps, setRunSteps] = useState<WorkflowStep[] | null>(null);
  const [stepsLoading, setStepsLoading] = useState(false);

  useEffect(() => {
    if (item.type !== "workflow") return;
    setStepsLoading(true);
    fetch(`/api/workflow-runs/${item.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRunSteps(data?.steps ?? []))
      .catch(() => setRunSteps([]))
      .finally(() => setStepsLoading(false));
  }, [item]);

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="relative w-full max-w-md bg-background border border-neutral-200/60 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{
          fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-foreground-600 hover:text-foreground hover:bg-background-200 transition-colors z-10"
        >
          <X size={14} />
        </button>

        {item.type === "agent" &&
          (() => {
            const agent = agents.find((a) => a.did === item.id);
            if (!agent)
              return (
                <p className="p-6 text-foreground-600 text-sm">
                  Agent not found.
                </p>
              );
            const todayTokenUsage = agent.tokenHistory?.find(
              (th) => th.granularity === "day"
            );
            const totalDaily =
              (todayTokenUsage?.promptTokens ?? 0) +
              (todayTokenUsage?.completionTokens ?? 0);
            return (
              <>
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-neutral-200/40">
                  <div className="flex items-center gap-3 pr-6">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      {agent.online && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
                      )}
                      <span
                        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${agent.online ? "bg-success-600" : "bg-foreground-300"}`}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {agent.name}
                      </p>
                      <p className="text-[10px] text-foreground-500 font-mono truncate">
                        {shortDid(agent.did)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3 text-[11px]">
                  {/* LLM */}
                  {agent.reportedLlm && (
                    <Row icon={<Cpu size={11} />} label="Model">
                      <span className="text-primary-600 font-semibold">
                        {agent.reportedLlm.model}
                      </span>
                      <span className="text-foreground-500 ml-1">
                        via {agent.reportedLlm.provider}
                      </span>
                    </Row>
                  )}
                  {/* Realms */}
                  {(agent.agentRealms ?? []).length > 0 && (
                    <Row icon={<Globe2 size={11} />} label="Realms">
                      <div className="flex flex-wrap gap-1">
                        {(agent.agentRealms ?? []).map((r) => (
                          <span
                            key={r.realmId}
                            className="px-1.5 py-0.5 rounded text-[10px] border"
                            style={{
                              color: r.realm.color,
                              borderColor: `${r.realm.color}50`,
                              background: `${r.realm.color}18`,
                            }}
                          >
                            {r.realm.name}
                          </span>
                        ))}
                      </div>
                    </Row>
                  )}
                  {/* Capabilities */}
                  <Row icon={<Shield size={11} />} label="Capabilities">
                    <div className="flex flex-wrap gap-1">
                      {agent.capabilities.map((c) => (
                        <span
                          key={c}
                          className="px-1.5 py-0.5 rounded bg-background-200 text-foreground-600 text-[10px]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </Row>
                  {/* Tokens */}
                  {totalDaily > 0 && (
                    <Row icon={<Zap size={11} />} label="Tokens today">
                      <span className="text-foreground">
                        {formatCompactNumber(totalDaily)}
                      </span>
                      {agent.dailyPriceSpent != null &&
                        agent.dailyPriceSpent > 0 && (
                          <span className="ml-2 text-warning-600">
                            ${agent.dailyPriceSpent.toFixed(4)}
                          </span>
                        )}
                    </Row>
                  )}
                  {/* Heartbeat */}
                  <Row icon={<Clock size={11} />} label="Last heartbeat">
                    <span className="text-foreground-600">
                      {timeAgo(agent.lastHeartbeat)}
                    </span>
                    {agent.connectedAt && (
                      <span className="text-foreground-500 ml-2">
                        · connected {timeAgo(agent.connectedAt)}
                      </span>
                    )}
                  </Row>
                </div>

                {/* Footer */}
                <div className="px-5 pb-4 pt-2 border-t border-neutral-200/40 flex items-center justify-between">
                  <span className="text-[10px] text-foreground-500">
                    {agent.online ? "● online" : "○ offline"}
                  </span>
                  <button
                    onClick={() => {
                      onClose();
                      router.push(`/agents/${encodeURIComponent(agent.did)}`);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    View full agent <ArrowUpRight size={11} />
                  </button>
                </div>
              </>
            );
          })()}

        {item.type === "workflow" &&
          (() => {
            const run = workflowRuns.find((r) => r.id === item.id);
            if (!run)
              return (
                <p className="p-6 text-foreground-600 text-sm">
                  Run not found.
                </p>
              );
            const sc = {
              running: "text-primary-600",
              completed: "text-success-600",
              failed: "text-danger-600",
            };
            const stepIcon = (s: string) => {
              if (s === "success" || s === "completed")
                return (
                  <CheckCircle
                    size={10}
                    className="text-success-600 shrink-0"
                  />
                );
              if (s === "failed")
                return (
                  <XCircle size={10} className="text-danger-600 shrink-0" />
                );
              if (s === "running")
                return (
                  <Loader2
                    size={10}
                    className="text-primary-600 animate-spin shrink-0"
                  />
                );
              return (
                <Clock size={10} className="text-foreground-500 shrink-0" />
              );
            };
            return (
              <>
                <div className="px-5 pt-5 pb-3 border-b border-neutral-200/40 pr-10 shrink-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {run.workflowName ?? "Workflow"}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[10px]">
                    <span className={`font-semibold ${sc[run.status]}`}>
                      {run.status}
                    </span>
                    <span className="text-foreground-500">
                      {timeAgo(run.startedAt)}
                    </span>
                    <span className="text-foreground-600">
                      {duration(run.startedAt, run.completedAt)}
                    </span>
                  </div>
                </div>
                {/* Steps timeline */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
                  {stepsLoading ? (
                    <div className="flex items-center gap-2 text-[11px] text-foreground-600 py-2">
                      <Loader2 size={11} className="animate-spin" /> Loading
                      steps…
                    </div>
                  ) : runSteps && runSteps.length > 0 ? (
                    runSteps.map((step, idx) => (
                      <div
                        key={step.id}
                        className={`rounded-lg border px-3 py-2 text-[11px] ${
                          step.status === "failed"
                            ? "border-danger-500/40 bg-danger-500/5"
                            : step.status === "success" ||
                                step.status === "completed"
                              ? "border-success-500/30 bg-success-500/5"
                              : step.status === "running"
                                ? "border-primary-500/40 bg-primary-500/5"
                                : "border-neutral-200/40 bg-background-100/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {stepIcon(step.status)}
                          <span className="font-medium text-foreground flex-1 truncate">
                            {step.stepId}
                          </span>
                          {step.startedAt && step.completedAt && (
                            <span className="text-[10px] text-foreground-600 shrink-0">
                              {duration(step.startedAt, step.completedAt)}
                            </span>
                          )}
                        </div>
                        {step.agentId && (
                          <p className="text-[10px] text-foreground-500 mt-0.5 pl-5 truncate">
                            {agents.find((a) => a.did === step.agentId)?.name ??
                              step.agentId.slice(0, 20)}
                          </p>
                        )}
                        {step.error && (
                          <p className="text-[10px] text-danger-600 mt-1 pl-5 font-mono leading-snug break-all">
                            ✗ {step.error.slice(0, 120)}
                            {step.error.length > 120 ? "…" : ""}
                          </p>
                        )}
                        {step.output && step.status !== "pending" && (
                          <pre className="text-[9px] text-foreground-600 mt-1 pl-5 leading-snug overflow-hidden max-h-10 font-mono">
                            {JSON.stringify(step.output).slice(0, 150)}
                          </pre>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-foreground-600 py-2">
                      No step data available.
                    </p>
                  )}
                </div>
                <div className="px-5 pb-4 pt-2 border-t border-neutral-200/40 flex items-center justify-between shrink-0">
                  <span className="text-[10px] text-foreground-500 font-mono">
                    {run.id.slice(0, 8)}…
                  </span>
                  <button
                    onClick={() => {
                      onClose();
                      router.push(`/workflows/${run.workflowId}`);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    View workflow <ArrowUpRight size={11} />
                  </button>
                </div>
              </>
            );
          })()}

        {item.type === "intent" &&
          (() => {
            const intent = recentIntents.find((i) => i.intentId === item.id);
            if (!intent)
              return (
                <p className="p-6 text-foreground-600 text-sm">
                  Intent not found.
                </p>
              );
            const agentName =
              agents.find((a) => a.did === intent.agentDid)?.name ??
              `…${intent.agentDid.slice(-8)}`;
            const sc = {
              success: "text-success-600",
              failed: "text-danger-600",
              pending: "text-warning-600",
            };
            const statusColor =
              sc[intent.status as keyof typeof sc] ?? "text-foreground-600";
            const paramsStr = intent.params
              ? JSON.stringify(intent.params, null, 2)
              : null;
            const outputStr = intent.output
              ? JSON.stringify(intent.output, null, 2)
              : null;
            return (
              <>
                <div className="px-5 pt-5 pb-3 border-b border-neutral-200/40 pr-10 shrink-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {intent.action}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[10px]">
                    <span className={`font-semibold ${statusColor}`}>
                      {intent.status}
                    </span>
                    <span className="text-foreground-500">
                      {timeAgo(intent.sentAt)}
                    </span>
                    {intent.completedAt && (
                      <span className="text-foreground-600">
                        {duration(intent.sentAt, intent.completedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 min-h-0 text-[11px]">
                  <Row icon={<Bot size={11} />} label="Agent">
                    <span className="text-foreground">{agentName}</span>
                  </Row>
                  <Row icon={<ArrowUpRight size={11} />} label="Intent ID">
                    <span className="font-mono text-foreground-600">
                      {intent.intentId.slice(0, 16)}…
                    </span>
                  </Row>
                  {paramsStr && (
                    <div>
                      <p className="text-[10px] text-foreground-500 mb-1 font-semibold">
                        Params
                      </p>
                      <pre className="text-[10px] font-mono bg-background-200 rounded-lg p-2.5 overflow-auto max-h-24 text-foreground-600 leading-snug">
                        {paramsStr.slice(0, 400)}
                        {paramsStr.length > 400 ? "\n…" : ""}
                      </pre>
                    </div>
                  )}
                  {intent.error && (
                    <div>
                      <p className="text-[10px] text-danger-600 mb-1 font-semibold">
                        Error
                      </p>
                      <pre className="text-[10px] font-mono bg-danger-500/5 border border-danger-500/30 rounded-lg p-2.5 overflow-auto max-h-20 text-danger-600 leading-snug">
                        {intent.error.slice(0, 300)}
                      </pre>
                    </div>
                  )}
                  {outputStr && !intent.error && (
                    <div>
                      <p className="text-[10px] text-foreground-500 mb-1 font-semibold">
                        Output
                      </p>
                      <pre className="text-[10px] font-mono bg-background-200 rounded-lg p-2.5 overflow-auto max-h-32 text-foreground-600 leading-snug">
                        {outputStr.slice(0, 500)}
                        {outputStr.length > 500 ? "\n…" : ""}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="px-5 pb-4 pt-2 border-t border-neutral-200/40 flex items-center justify-end shrink-0">
                  <button
                    onClick={() => {
                      onClose();
                      router.push(
                        `/agents/${encodeURIComponent(intent.agentDid)}`
                      );
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    View agent <ArrowUpRight size={11} />
                  </button>
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
}

/** Compact label+value row used inside the modal */
function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-foreground-500 mt-0.5 shrink-0">{icon}</span>
      <span className="text-foreground-500 shrink-0 w-24">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

/**
 * Circular gauge tile — ring shows pct (0–1), value sits inside, label below.
 * r=20, circumference ≈ 125.66  (2π × 20)
 */
function StatTile({
  value,
  label,
  color = "text-foreground",
  pct = 0,
}: {
  value: string;
  label: string;
  color?: string;
  pct?: number;
}) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(1, Math.max(0, pct)) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center w-32 h-32">
        {/* Gauge ring */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 80 80"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="3.5"
            className="stroke-background-200"
          />
          {/* Fill */}
          {fill > 0 && (
            <circle
              cx="40"
              cy="40"
              r={r}
              fill="none"
              strokeWidth="3.5"
              stroke="currentColor"
              className={color}
              strokeLinecap="round"
              strokeDasharray={`${fill} ${circ}`}
            />
          )}
        </svg>
        {/* Number */}
        <div className="flex flex-col items-center gap-2">
          <span
            className={`relative z-10 text-sm font-bold tabular-nums leading-none ${color}`}
          >
            {value}
          </span>
          <span className="text-[9px] text-foreground-500 uppercase tracking-wider">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  right,
  className = "",
}: {
  title: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-4 py-2.5 border-b border-neutral-200/50 flex items-center justify-between shrink-0 ${className}`}
    >
      <span className="text-[10px] font-bold tracking-[0.18em] text-foreground-700 uppercase">
        {title}
      </span>
      {right}
    </div>
  );
}

function TokenRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-foreground-600">{label}</span>
      <span className={`${color} tabular-nums font-semibold`}>{value}</span>
    </div>
  );
}

function RunPill({
  run,
  block = false,
}: {
  run: WorkflowRun;
  block?: boolean;
}) {
  const name =
    run.workflowName ?? run.workflowId?.slice(0, 8) ?? run.id.slice(0, 8);

  const styles = {
    running:
      "border-primary-500/60 bg-primary-500/15 text-primary-700 hover:border-primary-600/80",
    completed:
      "border-success-500/50 bg-success-600/10 text-success-700 hover:border-success-600/70",
    failed:
      "border-danger-500/50 bg-danger-500/10 text-danger-600 hover:border-danger-500/70",
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] cursor-default transition-colors ${styles[run.status]} ${block ? "w-full" : "shrink-0"}`}
      title={`${name} · ${run.status}`}
    >
      {run.status === "running" ? (
        <Loader2 size={10} className="animate-spin shrink-0" />
      ) : run.status === "completed" ? (
        <CheckCircle size={10} className="shrink-0" />
      ) : (
        <XCircle size={10} className="shrink-0" />
      )}
      <span className={`truncate ${block ? "flex-1" : "max-w-[110px]"}`}>
        {name}
      </span>
      {block && (
        <span className="ml-auto text-[10px] opacity-60 shrink-0">
          {run.status}
        </span>
      )}
    </div>
  );
}
