import type {
  ConnectedAgentRow,
  NetworkStats,
  PeerjsState,
} from "@/lib/contracts";
import { ComparisonChart } from "./ComparisonChart";
import { NetworkMapFlow } from "./NetworkMapFlow";

export function MapTab({
  stats,
  peerjs,
  agents,
}: {
  stats: NetworkStats | null | undefined;
  peerjs: PeerjsState;
  agents: ConnectedAgentRow[];
}) {
  return (
    <div className="space-y-5">
      {/* Comparison chart */}
      <ComparisonChart ws={stats?.ws} peerjs={stats?.peerjs} />

      {/* ReactFlow topology */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-200">
          <span className="text-sm font-semibold text-foreground">
            Network topology
          </span>
          <span className="ml-2 text-xs text-foreground-400">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} connected
          </span>
        </div>
        <NetworkMapFlow agents={agents} peerjsRunning={peerjs.running} />
      </div>
    </div>
  );
}
