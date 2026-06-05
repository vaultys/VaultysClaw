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
  Maximize2,
  Minimize2,
  ExternalLink,
} from "lucide-react";
import { useAdminWS } from "@/hooks/useAdminWS";
import { useRole } from "@/hooks/useRole";
import type { MapMarker } from "@/components/map/WorldMap";

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
  status: "success" | "failed" | "pending";
  sentAt: string;
  completedAt: string | null;
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
}

export interface MissionControlCoreProps {
  /** "embedded" = inside AppShell (h-full, fullscreen button opens new route)
   *  "standalone" = fullscreen route (h-screen, exit button goes back to /mission-control) */
  mode: "embedded" | "standalone";
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
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
  const [mapHeight, setMapHeight] = useState(400);
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
  const pushFeed = useCallback(
    (event: Omit<FeedEvent, "id" | "timestamp">) => {
      setFeed((prev) => [
        {
          ...event,
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
        },
        ...prev.slice(0, 79),
      ]);
    },
    []
  );

  /* ── Watch WS agent connect/disconnect ── */
  useEffect(() => {
    const currentOnline = new Set(
      agentsState.agents.filter((a) => a.online).map((a) => a.id)
    );
    for (const agent of agentsState.agents) {
      const wasOnline = prevOnlineIds.current.has(agent.id);
      if (agent.online && !wasOnline && prevOnlineIds.current.size > 0) {
        pushFeed({
          type: "agent_online",
          message: `${agent.name} connected`,
          detail: agent.reportedLlm?.model,
        });
      } else if (!agent.online && wasOnline) {
        pushFeed({
          type: "agent_offline",
          message: `${agent.name} disconnected`,
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
          intents.forEach((i) => seenIntentIds.current.add(i.intentId));
          intentsInitialized.current = true;
          return;
        }
        for (const intent of [...intents].reverse()) {
          if (seenIntentIds.current.has(intent.intentId)) continue;
          seenIntentIds.current.add(intent.intentId);
          const agentName =
            agentsState.agents.find((a) => a.id === intent.agentDid)?.name ??
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

  /* ── Derived values ── */
  const totalAgents = agentsState.total;
  const onlineAgents = agentsState.online;
  const pendingRegs = registrations.filter((r) => r.status === "pending").length;
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
    for (const realm of agent.realms ?? []) {
      const e = realmMap.get(realm.id) ?? {
        name: realm.name,
        color: realm.color,
        online: 0,
        total: 0,
      };
      e.total++;
      if (agent.online) e.online++;
      realmMap.set(realm.id, e);
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
          <span className="text-foreground-700 text-xs hidden sm:inline">·</span>
          <span className="text-foreground-700 text-xs hidden sm:inline">
            VaultysClaw
          </span>
        </div>

        {/* Metrics strip */}
        <div className="flex items-center gap-5 text-xs flex-wrap">
          {/* Agents online */}
          <div className="flex items-center gap-1.5">
            <Bot size={11} className="text-foreground-600" />
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
                {fmtTokens(dailyTokens)}
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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_260px] overflow-hidden min-h-0">

        {/* ════ LEFT: Fleet + Realms + Token Burn ═══════════════════ */}
        <div className="border-r border-neutral-200/50 flex-col overflow-hidden bg-background-100/20 hidden lg:flex">

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
                  key={agent.id}
                  className={`px-3 py-2 border-b border-neutral-200/40 flex gap-2 cursor-pointer transition-colors hover:bg-background-200/50 ${
                    !agent.online ? "opacity-35" : ""
                  }`}
                  onClick={() =>
                    router.push(`/agents/${encodeURIComponent(agent.id)}`)
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
                      {agent.realms?.slice(0, 1).map((r) => (
                        <span
                          key={r.id}
                          className="text-[10px] px-1 py-px rounded border"
                          style={{
                            color: r.color,
                            borderColor: `${r.color}40`,
                            background: `${r.color}15`,
                          }}
                        >
                          {r.name}
                        </span>
                      ))}
                    </div>

                    {agent.online && (
                      <div className="text-[10px] text-foreground-600 mt-0.5">
                        {agent.dailyTokenUsage
                          ? `${fmtTokens(
                              agent.dailyTokenUsage.promptTokens +
                                agent.dailyTokenUsage.completionTokens
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
                      className="px-3 py-1.5 flex items-center gap-2"
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

          {/* Token burn metrics */}
          {tokenStats && (
            <>
              <PanelHeader
                title="Token Burn"
                className="border-t border-neutral-200/50"
              />
              <div className="px-3 pb-3 space-y-1.5 shrink-0">
                <TokenRow
                  label="Today"
                  value={fmtTokens(
                    tokenStats.daily.promptTokens +
                      tokenStats.daily.completionTokens
                  )}
                  color="text-primary-600"
                />
                <TokenRow
                  label="Month"
                  value={fmtTokens(
                    tokenStats.monthly.promptTokens +
                      tokenStats.monthly.completionTokens
                  )}
                  color="text-secondary-600"
                />
                <TokenRow
                  label="All-time"
                  value={fmtTokens(
                    tokenStats.allTime.promptTokens +
                      tokenStats.allTime.completionTokens
                  )}
                  color="text-foreground-600"
                />
              </div>
            </>
          )}
        </div>

        {/* ════ CENTER: Globe + Workflow Pipeline ════════════════════ */}
        <div className="flex flex-col overflow-hidden min-h-0">
          {/* World map — takes all remaining vertical space */}
          <div
            ref={mapContainerRef}
            className="flex-1 min-h-0 relative bg-background"
          >
            {mapHeight > 0 && (
              <WorldMap
                markers={markers}
                height={mapHeight}
                canEditLocation={false}
              />
            )}
            {markers.length === 0 && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                <span className="text-[10px] text-foreground-600 bg-background-100/80 px-3 py-1 rounded-full border border-neutral-200/50">
                  Set agent locations in agent settings to pin them on the globe
                </span>
              </div>
            )}
          </div>

          {/* Workflow pipeline strip */}
          <div className="shrink-0 border-t border-neutral-200/50 bg-background-100/50">
            <PanelHeader
              title="Workflow Pipeline"
              right={
                runningWorkflows > 0 ? (
                  <span className="flex items-center gap-1 text-[10px] text-primary-600">
                    <Loader2 size={9} className="animate-spin" />
                    {runningWorkflows} active
                  </span>
                ) : (
                  <span className="text-[10px] text-foreground-600">idle</span>
                )
              }
            />
            <div className="flex gap-2 px-3 py-2 overflow-x-auto scrollbar-none">
              {workflowRuns.length === 0 ? (
                <span className="text-[10px] text-foreground-600 py-0.5">
                  No recent workflow runs
                </span>
              ) : (
                workflowRuns.map((run) => <RunPill key={run.id} run={run} />)
              )}
            </div>
          </div>
        </div>

        {/* ════ RIGHT: Live Activity Feed ════════════════════════════ */}
        <div className="border-l border-neutral-200/50 flex-col overflow-hidden bg-background-100/20 hidden lg:flex">
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
                  className={`px-3 py-2 border-b border-neutral-200/50 flex gap-2 ${
                    i === 0 ? "bg-background-200/40 animate-fade-in" : ""
                  }`}
                  style={{ opacity: Math.max(0.15, 1 - i * 0.013) }}
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

          {/* Recent intents summary */}
          {recentIntents.length > 0 && (
            <>
              <PanelHeader
                title="Recent Intents"
                className="border-t border-neutral-200/50"
              />
              <div className="pb-2 shrink-0 max-h-40 overflow-y-auto">
                {recentIntents.map((intent) => {
                  const agent = agentsState.agents.find(
                    (a) => a.id === intent.agentDid
                  );
                  return (
                    <div
                      key={intent.intentId}
                      className="px-3 py-1.5 flex items-center gap-2 border-b border-neutral-200/50"
                    >
                      {intent.status === "success" ? (
                        <CheckCircle
                          size={10}
                          className="text-success-500 shrink-0"
                        />
                      ) : intent.status === "failed" ? (
                        <XCircle
                          size={10}
                          className="text-danger-500 shrink-0"
                        />
                      ) : (
                        <Loader2
                          size={10}
                          className="text-warning-600 animate-spin shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-foreground-600 truncate">
                          {intent.action}
                        </p>
                        <p className="text-[10px] text-foreground-600 truncate">
                          {agent?.name ?? `…${intent.agentDid.slice(-6)}`}
                          {" · "}
                          {timeAgo(intent.sentAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

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
      className={`px-3 py-1.5 border-b border-neutral-200/50 flex items-center justify-between shrink-0 ${className}`}
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

function RunPill({ run }: { run: WorkflowRun }) {
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
      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] cursor-default transition-colors ${styles[run.status]}`}
      title={`${name} · ${run.status}`}
    >
      {run.status === "running" ? (
        <Loader2 size={10} className="animate-spin" />
      ) : run.status === "completed" ? (
        <CheckCircle size={10} />
      ) : (
        <XCircle size={10} />
      )}
      <span className="max-w-[110px] truncate">{name}</span>
    </div>
  );
}
