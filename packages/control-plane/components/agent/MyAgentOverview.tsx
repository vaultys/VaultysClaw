"use client";
import { useState, useEffect } from "react";
import { Zap, Cpu, BookOpen, MapPin, Loader2 } from "lucide-react";
import { parseUTC, timeAgo } from "@vaultysclaw/shared";
import { CAPABILITY_ICONS } from "./capability-icons";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { UserAgentDetail } from "@/lib/contracts";

/**
 * Read-only overview for the member-facing "My Agents" detail page. Shows only
 * information a workspace member is allowed to see: capabilities, token usage,
 * configured model, a knowledge summary and location. It intentionally makes NO
 * admin-only calls (no governance/policies) and shows neither policy nor the
 * recent-activity audit stream.
 */
export function MyAgentOverview({ agent }: { agent: UserAgentDetail }) {
  const [knowledge, setKnowledge] = useState<{
    total: number;
    ready: number;
  } | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setKnowledgeLoading(true);
      try {
        // Knowledge sources for this agent across the workspaces the caller can
        // access (the endpoint scopes by the caller's own memberships).
        const r = await userApi.knowledge
          .list({ query: { agentDid: agent.did } })
          .then(unwrap)
          .catch(() => null);
        if (cancelled) return;
        const sources = r?.sources ?? [];
        setKnowledge({
          total: sources.length,
          ready: sources.filter((s) => s.status === "ready").length,
        });
      } finally {
        if (!cancelled) setKnowledgeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    const secs = Math.floor(
      (Date.now() - parseUTC(agent.connectedAt.toString()).getTime()) / 1000
    );
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    const h = Math.floor(secs / 3600),
      m = Math.floor((secs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const uptime = sessionUptime();
  const hasLocation = agent.locationLat != null && agent.locationLon != null;

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
            {todayUsed.toLocaleString()}
          </div>
          {agent.tokenBudgetDaily ? (
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
          ) : (
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
          {agent.tokenBudgetMonthly ? (
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
          ) : (
            <div className="text-xs text-foreground-400 mt-1">
              no monthly limit
            </div>
          )}
        </div>

        {/* Configured model */}
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-foreground-500 uppercase mb-1 flex items-center gap-1">
            <Cpu size={12} /> Model
          </div>
          {agent.reportedLlm ? (
            <>
              <div className="text-sm font-semibold text-foreground truncate">
                {agent.reportedLlm.model}
              </div>
              <div className="text-xs text-foreground-400 mt-0.5">
                {agent.reportedLlm.provider}
              </div>
            </>
          ) : (
            <div className="text-lg font-semibold text-foreground-500">—</div>
          )}
        </div>
      </div>

      {/* ── Lower grid: capabilities + knowledge ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Capabilities */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-4">
            <Zap size={14} className="text-foreground-500" /> Capabilities
          </h2>
          {agent.capabilities.length === 0 ? (
            <p className="text-xs text-foreground-400 text-center py-6">
              No capabilities declared.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                >
                  {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                  {cap.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Knowledge summary */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-4">
            <BookOpen size={14} className="text-foreground-500" /> Knowledge
          </h2>
          {knowledgeLoading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm py-4 justify-center">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : !knowledge || knowledge.total === 0 ? (
            <p className="text-xs text-foreground-400 text-center py-6">
              No knowledge sources configured.
            </p>
          ) : (
            <div className="flex items-baseline gap-4">
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {knowledge.total}
                </div>
                <div className="text-xs text-foreground-400">sources</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-success-600">
                  {knowledge.ready}
                </div>
                <div className="text-xs text-foreground-400">ready</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Location (read-only) ── */}
      {hasLocation && (
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <MapPin size={14} className="text-foreground-500" /> Location
          </h2>
          <p className="text-sm text-foreground">
            {agent.locationLabel ?? (
              <span className="font-mono">
                {agent.locationLat}, {agent.locationLon}
              </span>
            )}
          </p>
          {agent.locationLabel && (
            <p className="text-xs font-mono text-foreground-400 mt-0.5">
              {agent.locationLat}, {agent.locationLon}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
