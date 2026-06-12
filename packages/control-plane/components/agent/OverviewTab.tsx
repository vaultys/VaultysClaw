"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Loader2,
  Activity,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  CalendarDays,
  MapPin,
} from "lucide-react";
import { formatDateTime, parseUTC, timeAgo } from "@vaultysclaw/shared";
import { CAPABILITY_ICONS } from "./capability-icons";
import { AUDIT_LABELS } from "./constants";
import type { PolicyEntry, AuditEntry } from "./types";
import { AgentInfo } from "@/lib/contracts";

const LocationEditor = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.LocationEditor),
  { ssr: false }
);

function TokenBar({
  used,
  budget,
  label,
}: {
  used: number;
  budget: number | null;
  label: string;
}) {
  const pct = budget ? Math.min(100, Math.round((used / budget) * 100)) : null;
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

// ── Location row ──────────────────────────────────────────────────────────────

function AgentLocationRow({
  did,
  lat,
  lon,
  label,
}: {
  did: string;
  lat: number | null;
  lon: number | null;
  label: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(
    lat != null && lon != null ? { lat, lon, label: label ?? "" } : null
  );

  const handleSave = useCallback(
    async (loc: { lat: number; lon: number; label: string } | null) => {
      const body =
        loc === null
          ? { lat: null }
          : { lat: loc.lat, lon: loc.lon, label: loc.label };
      const res = await fetch(
        `/api/agents/${encodeURIComponent(did)}/location`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(d?.error ?? "Failed to save location");
      }
      setCurrent(loc);
    },
    [did]
  );

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <MapPin size={14} className="text-foreground-500" /> Location
        </h2>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-primary-500 hover:text-primary-400 flex items-center gap-0.5 transition-colors"
        >
          {current ? "Edit" : "Set location"}
        </button>
      </div>
      {current ? (
        <div className="text-sm text-foreground">
          <span className="font-medium">
            {current.label || "Custom location"}
          </span>
          <span className="text-foreground-400 font-mono text-xs ml-2">
            {current.lat.toFixed(4)}, {current.lon.toFixed(4)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-foreground-400">
          No location set. Agents are auto-located on connect, or you can set
          one manually.
        </p>
      )}
      {editing && (
        <LocationEditor
          current={current}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

export function OverviewTab({
  agent,
  onTabChange,
}: {
  agent: AgentInfo;
  onTabChange: (tab: string) => void;
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
            `/api/governance/audit?agentDid=${encodeURIComponent(agent.did)}&limit=50`
          ),
          fetch(`/api/policies?agentDid=${encodeURIComponent(agent.did)}`),
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
  }, [agent.did]);
  const todayUsageToken = agent.tokenHistory.find(
    (th) => th.granularity === "day"
  );
  const monthUsageToken = agent.tokenHistory.find(
    (th) => th.granularity === "month"
  );
  const todayUsed = todayUsageToken
    ? todayUsageToken.completionTokens + todayUsageToken.promptTokens
    : 0;

  const monthUsed = monthUsageToken
    ? monthUsageToken.completionTokens + monthUsageToken.promptTokens
    : 0;

  function sessionUptime() {
    if (!agent.online || !agent.connectedAt) return null;
    const secs = agent.connectedAt
      ? Math.floor(
          (Date.now() - parseUTC(agent.connectedAt.toString()).getTime()) / 1000
        )
      : -1;
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
      {/* ── KPI row ── */}
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
                since {timeAgo(agent.connectedAt?.toString() ?? null)}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold text-foreground-500">
                Offline
              </div>
              <div className="text-xs text-foreground-400 mt-0.5">
                last seen {timeAgo(agent.lastSeen?.toString() ?? null)}
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
            {todayUsed.toString()}
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

      {/* ── Lower two-column grid ── */}
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

              {activePolicy.expiresAt && (
                <div
                  className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                    new Date(activePolicy.expiresAt) < new Date()
                      ? "bg-danger-50 border-danger-200 text-danger-600"
                      : "bg-warning-50 border-warning-200 text-warning-700"
                  }`}
                >
                  <CalendarDays size={12} />
                  {formatDateTime(activePolicy.expiresAt)}
                </div>
              )}

              <p className="text-[10px] font-mono text-foreground-400">
                {activePolicy.id} · created {timeAgo(activePolicy.createdAt)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Location ── */}
      <AgentLocationRow
        did={agent.id}
        lat={agent.locationLat}
        lon={agent.locationLon}
        label={agent.locationLabel}
      />
    </div>
  );
}
