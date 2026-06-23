import { AlertTriangle } from "lucide-react";
import { formatBytes } from "@vaultysclaw/shared";
import type {
  ConnectedAgentRow,
  NetworkLogEntry,
  PeerjsState,
  TransportStats,
} from "@/lib/contracts";
import { StatBox } from "./StatBox";
import { TrafficChart } from "./TrafficChart";
import { AgentsTable } from "./AgentsTable";
import { LogPanel } from "./LogPanel";
import { PeerjsPanel, PeerjsControlAction } from "./PeerjsPanel";

export function PeerjsTab({
  data,
  stats,
  agents,
  logs,
  onAction,
}: {
  data: PeerjsState;
  stats: TransportStats | undefined;
  agents: ConnectedAgentRow[];
  logs: NetworkLogEntry[];
  onAction: (
    action: PeerjsControlAction,
    serverUrl?: string | null
  ) => Promise<void>;
}) {
  const running = data.running;
  return (
    <div className="space-y-5">
      {/* Control card */}
      <PeerjsPanel data={data} onAction={onAction} />

      {/* Not running banner */}
      {!running && (
        <div className="flex items-center gap-2.5 bg-warning-50 border border-warning-300 rounded-xl px-4 py-3 text-sm text-warning-700">
          <AlertTriangle size={15} className="shrink-0" />
          PeerJS relay is not running. Start it above to accept WebRTC agent
          connections.
        </div>
      )}

      {/* Stat boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatBox
          label="Active agents"
          value={stats?.activeAgents ?? 0}
          disabled={!running}
        />
        <StatBox
          label="Pending"
          value={stats?.pendingConnections ?? 0}
          disabled={!running}
        />
        <StatBox
          label="Total conn."
          value={stats?.connectionsTotal ?? 0}
          disabled={!running}
        />
        <StatBox
          label="Messages in"
          value={(stats?.messagesIn ?? 0).toLocaleString()}
          disabled={!running}
        />
        <StatBox
          label="Messages out"
          value={(stats?.messagesOut ?? 0).toLocaleString()}
          disabled={!running}
        />
        <StatBox
          label="Data transferred"
          value={formatBytes((stats?.bytesIn ?? 0) + (stats?.bytesOut ?? 0))}
          disabled={!running}
        />
      </div>

      {/* Chart */}
      <TrafficChart stats={stats} color="secondary" />

      {/* Table */}
      <AgentsTable agents={agents} transport="peerjs" />

      {/* Log panel */}
      <LogPanel logs={logs} />
    </div>
  );
}
