"use client";

import { formatCompactNumber, formatCost, timeAgo } from "@vaultysclaw/shared";
import type { AgentInfo } from "@/lib/contracts";
import { PanelHeader } from "./ui";

interface RealmSummary {
  name: string;
  color: string;
  online: number;
  total: number;
}

/** Aggregate agents into a per-realm online/total breakdown (top 8 by size). */
function buildRealms(agents: AgentInfo[]): RealmSummary[] {
  const map = new Map<string, RealmSummary>();
  for (const agent of agents) {
    for (const ar of agent.agentRealms ?? []) {
      const e = map.get(ar.realmId) ?? {
        name: ar.realm.name,
        color: ar.realm.color,
        online: 0,
        total: 0,
      };
      e.total++;
      if (agent.online) e.online++;
      map.set(ar.realmId, e);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function dayTokens(agent: AgentInfo): number {
  const day = agent.tokenHistory?.find((th) => th.granularity === "day");
  return (day?.promptTokens ?? 0) + (day?.completionTokens ?? 0);
}

export function FleetPanel({
  agents,
  onlineAgents,
  onSelectAgent,
}: {
  agents: AgentInfo[];
  onlineAgents: number;
  onSelectAgent: (did: string) => void;
}) {
  const realms = buildRealms(agents);

  return (
    <div className="flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 hidden lg:flex min-h-0">
      <PanelHeader
        title="Agent Fleet"
        right={
          <span className="text-[10px] text-foreground-600">
            <span className="text-success-600">{onlineAgents}</span> online
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="px-3 py-6 text-center text-foreground-600 text-[11px]">
            No agents registered
          </div>
        ) : (
          agents.map((agent) => (
            <button
              key={agent.did}
              type="button"
              className={`w-full text-left px-4 py-2.5 border-b border-neutral-200/40 flex gap-2 cursor-pointer transition-colors hover:bg-background-200/50 ${
                !agent.online ? "opacity-35" : ""
              }`}
              onClick={() => onSelectAgent(agent.did)}
            >
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
                        {formatCost(agent.dailyPriceSpent)}
                      </span>
                    )}
                </div>

                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {agent.reportedLlm && (
                    <span className="text-[10px] text-primary-700 bg-primary-500/15 px-1 py-px rounded border border-primary-500/50">
                      {agent.reportedLlm.model.split("/").pop()?.slice(0, 18)}
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
                      ? `${formatCompactNumber(dayTokens(agent))} tokens today`
                      : `hb ${timeAgo(agent.lastHeartbeat)}`}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

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
  );
}
