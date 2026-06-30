"use client";

import {
  AlertTriangle,
  Bot,
  DollarSign,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { formatCompactNumber, formatCost } from "@vaultysclaw/shared";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  useToolbar,
  type ToolbarAction,
} from "@/components/layout/ToolbarContext";
import type { FleetMetrics } from "../components/mission-control/metrics";

/**
 * Wires Mission Control into the shared TopBar breadcrumb and page toolbar
 * (embedded mode). In standalone/fullscreen mode no provider is mounted, so
 * these hooks resolve to no-ops and the internal HeaderBar is used instead.
 */
export function useMissionControlChrome(
  metrics: FleetMetrics,
  onFullscreen: () => void
) {
  const {
    onlineAgents,
    totalAgents,
    dailyTokens,
    dailyCost,
    pendingRegs,
    runningWorkflows,
    wsConnected,
  } = metrics;

  useBreadcrumbs([{ label: "Mission Control" }], []);

  const actions: ToolbarAction[] = [
    {
      kind: "badge",
      id: "agents",
      label: `${onlineAgents}/${totalAgents} agents`,
      tone: "success",
      icon: <Bot className="w-3 h-3" />,
    },
    ...(dailyTokens > 0
      ? [
          {
            kind: "badge" as const,
            id: "tokens",
            label: `${formatCompactNumber(dailyTokens)} tok/day`,
            tone: "neutral" as const,
            icon: <Zap className="w-3 h-3" />,
          },
        ]
      : []),
    {
      kind: "badge",
      id: "cost",
      label: `${formatCost(dailyCost)} today`,
      tone: "warning",
      icon: <DollarSign className="w-3 h-3" />,
    },
    ...(pendingRegs > 0
      ? [
          {
            kind: "badge" as const,
            id: "pending",
            label: `${pendingRegs} pending`,
            tone: "warning" as const,
            icon: <AlertTriangle className="w-3 h-3" />,
          },
        ]
      : []),
    ...(runningWorkflows > 0
      ? [
          {
            kind: "badge" as const,
            id: "running",
            label: `${runningWorkflows} running`,
            tone: "neutral" as const,
            icon: <Loader2 className="w-3 h-3 animate-spin" />,
          },
        ]
      : []),
    {
      kind: "badge",
      id: "ws",
      label: wsConnected ? "Live" : "Reconnecting",
      tone: wsConnected ? "success" : "danger",
      icon: wsConnected ? (
        <Wifi className="w-3 h-3" />
      ) : (
        <WifiOff className="w-3 h-3" />
      ),
    },
    {
      kind: "button",
      id: "fullscreen",
      label: "Fullscreen",
      variant: "default",
      icon: <ExternalLink className="w-3.5 h-3.5" />,
      onClick: onFullscreen,
    },
  ];

  useToolbar({ title: "Mission Control", actions }, [
    onlineAgents,
    totalAgents,
    dailyTokens,
    dailyCost,
    pendingRegs,
    runningWorkflows,
    wsConnected,
    onFullscreen,
  ]);
}
