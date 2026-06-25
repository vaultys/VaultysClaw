"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  DollarSign,
  Loader2,
  Minimize2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { formatCompactNumber, formatCost } from "@vaultysclaw/shared";
import type { FleetMetrics } from "./metrics";

function useUtcClock(): string {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setClock(
        `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

/**
 * Internal header rendered only in standalone (fullscreen) mode, where the
 * shared app toolbar isn't mounted. In embedded mode the same metrics are
 * surfaced through the toolbar instead.
 */
export function HeaderBar({
  metrics,
  onExitFullscreen,
}: {
  metrics: FleetMetrics;
  onExitFullscreen: () => void;
}) {
  const clock = useUtcClock();
  const {
    onlineAgents,
    totalAgents,
    dailyTokens,
    dailyCost,
    pendingRegs,
    runningWorkflows,
    wsConnected,
  } = metrics;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-background-100 border-b border-neutral-200/50 shrink-0 gap-4">
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

      <div className="flex items-center gap-5 text-xs flex-wrap">
        <div className="flex items-center gap-1.5">
          <Bot size={15} className="text-foreground-600" />
          <span className="text-success-600 font-bold tabular-nums">
            {onlineAgents}
          </span>
          <span className="text-foreground-600">/</span>
          <span className="text-foreground-700 tabular-nums">
            {totalAgents}
          </span>
          <span className="text-foreground-600 text-[10px] ml-0.5">agents</span>
        </div>

        {dailyTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <Zap size={11} className="text-foreground-600" />
            <span className="text-primary-600 font-bold tabular-nums">
              {formatCompactNumber(dailyTokens)}
            </span>
            <span className="text-foreground-600 text-[10px]">tok/day</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <DollarSign size={11} className="text-foreground-600" />
          <span className="text-warning-600 font-bold tabular-nums">
            {formatCost(dailyCost)}
          </span>
          <span className="text-foreground-600 text-[10px]">today</span>
        </div>

        {pendingRegs > 0 && (
          <div className="flex items-center gap-1.5 animate-pulse">
            <AlertTriangle size={11} className="text-warning-600" />
            <span className="text-warning-600 font-bold">{pendingRegs}</span>
            <span className="text-warning-600 text-[10px]">pending</span>
          </div>
        )}

        {runningWorkflows > 0 && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={11} className="text-primary-600 animate-spin" />
            <span className="text-primary-600 font-bold">
              {runningWorkflows}
            </span>
            <span className="text-foreground-600 text-[10px]">running</span>
          </div>
        )}

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

        <span className="text-foreground-700 tabular-nums text-[11px] hidden md:inline">
          {clock}
        </span>

        <button
          onClick={onExitFullscreen}
          className="p-1 rounded hover:bg-background-200 text-foreground-600 hover:text-foreground transition-colors"
          title="Exit fullscreen"
        >
          <Minimize2 size={12} />
        </button>
      </div>
    </div>
  );
}
