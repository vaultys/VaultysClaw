import type { AgentInfo } from "@/lib/contracts";
import type { StatsTokensResponse } from "@/lib/contracts";
import type { WorkflowRun } from "./types";

/** Fleet-wide headline numbers shown in the header / toolbar. */
export interface FleetMetrics {
  totalAgents: number;
  onlineAgents: number;
  dailyCost: number;
  dailyTokens: number;
  pendingRegs: number;
  runningWorkflows: number;
  wsConnected: boolean;
}

export function computeFleetMetrics({
  agents,
  total,
  online,
  pendingRegs,
  tokenStats,
  workflowRuns,
  wsConnected,
}: {
  agents: AgentInfo[];
  total: number;
  online: number;
  pendingRegs: number;
  tokenStats: StatsTokensResponse | null;
  workflowRuns: WorkflowRun[];
  wsConnected: boolean;
}): FleetMetrics {
  return {
    totalAgents: total,
    onlineAgents: online,
    pendingRegs,
    wsConnected,
    dailyCost: agents.reduce((sum, a) => sum + (a.dailyPriceSpent ?? 0), 0),
    dailyTokens: tokenStats
      ? tokenStats.daily.promptTokens + tokenStats.daily.completionTokens
      : 0,
    runningWorkflows: workflowRuns.filter((r) => r.status === "running").length,
  };
}
