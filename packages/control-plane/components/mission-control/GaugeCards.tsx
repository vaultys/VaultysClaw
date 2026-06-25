"use client";

import {
  formatBytes,
  formatCompactNumber,
  formatCost,
} from "@vaultysclaw/shared";
import type { NetworkResponse, StatsTokensResponse } from "@/lib/contracts";
import { StatTile } from "./ui";

function GaugeCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background-100 border border-neutral-200/60 rounded-xl px-3 sm:px-4 py-3 shadow-md shadow-black/10 min-w-0">
      <p className="text-[10px] font-bold tracking-[0.18em] text-foreground-500 uppercase mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

function Loading() {
  return <span className="text-[10px] text-foreground-600">Loading…</span>;
}

export function GaugeCards({
  networkStats,
  tokenStats,
  totalAgents,
  dailyCost,
}: {
  networkStats: NetworkResponse | null;
  tokenStats: StatsTokensResponse | null;
  totalAgents: number;
  dailyCost: number;
}) {
  const ns = networkStats?.stats;
  const ws = ns?.ws;
  const pj = ns?.peerjs;

  return (
    <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-background border-b border-neutral-200/50">
      <GaugeCard title="Network">
        {ns && ws && pj ? (
          (() => {
            const totalBytes =
              ws.bytesIn + ws.bytesOut + pj.bytesIn + pj.bytesOut;
            const totalMsgs =
              ws.messagesIn + ws.messagesOut + pj.messagesIn + pj.messagesOut;
            const agentsOnline = ws.activeAgents + pj.activeAgents;
            return (
              <>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center">
                  <StatTile
                    value={String(agentsOnline)}
                    label="agents"
                    color="text-primary-600"
                    pct={agentsOnline / Math.max(1, totalAgents)}
                  />
                  <StatTile
                    value={formatCompactNumber(totalMsgs)}
                    label="messages"
                    color="text-foreground"
                    pct={Math.min(1, totalMsgs / 500_000)}
                  />
                  <StatTile
                    value={formatBytes(totalBytes)}
                    label="data"
                    color="text-foreground"
                    pct={Math.min(1, totalBytes / (50 * 1024 * 1024))}
                  />
                </div>
                <p className="text-[9px] text-foreground-500 mt-3 tabular-nums text-center">
                  ↑&nbsp;{formatBytes(ws.bytesOut + pj.bytesOut)}
                  &ensp;·&ensp; ↓&nbsp;{formatBytes(ws.bytesIn + pj.bytesIn)}
                </p>
              </>
            );
          })()
        ) : (
          <Loading />
        )}
      </GaugeCard>

      <GaugeCard title="Consumption">
        {tokenStats ? (
          (() => {
            const dp = tokenStats.daily.promptTokens;
            const dc = tokenStats.daily.completionTokens;
            const dt = dp + dc;
            const mt =
              tokenStats.monthly.promptTokens +
              tokenStats.monthly.completionTokens;
            return (
              <>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center">
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
                    value={formatCost(dailyCost)}
                    label="cost"
                    color="text-warning-600"
                    pct={Math.min(1, dailyCost / 5)}
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
          <Loading />
        )}
      </GaugeCard>
    </div>
  );
}
