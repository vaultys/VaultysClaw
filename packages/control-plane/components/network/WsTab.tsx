import { useState } from "react";
import { Wifi, Check, Loader2, RotateCcw } from "lucide-react";
import { formatBytes } from "@vaultysclaw/shared";
import type {
  ConnectedAgentRow,
  NetworkLogEntry,
  TransportStats,
} from "@/lib/contracts";
import { StatBox } from "./StatBox";
import { TrafficChart } from "./TrafficChart";
import { AgentsTable } from "./AgentsTable";
import { LogPanel } from "./LogPanel";
import { useConfirm } from "@/components/shared/ConfirmContext";

export function WsTab({
  stats,
  agents,
  logs,
  onRestartWs,
}: {
  stats: TransportStats | undefined;
  agents: ConnectedAgentRow[];
  logs: NetworkLogEntry[];
  onRestartWs: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [restarting, setRestarting] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);

  async function handleRestart() {
    if (
      !(await confirm({
        title: "Restart WebSocket",
        message:
          "Restart the WebSocket server? All agents will be disconnected.",
        variant: "danger",
      }))
    )
      return;
    setRestarting(true);
    try {
      await onRestartWs();
      setSuccessBanner(true);
      setTimeout(() => setSuccessBanner(false), 3000);
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Success banner */}
      {successBanner && (
        <div className="flex items-center gap-2 bg-success-50 border border-success-300 rounded-xl px-4 py-3 text-sm text-success-700">
          <Check size={14} className="shrink-0" />
          WebSocket server restarted successfully.
        </div>
      )}

      {/* Status card */}
      <div className="rounded-xl border bg-primary-50/60 border-primary-300 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary-100 border border-primary-300">
            <Wifi size={18} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">WebSocket</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-primary-100 text-primary-700 border-primary-300">
                Always on
              </span>
            </div>
            <p className="text-xs text-foreground-500 mt-0.5">
              TCP on port 8080 — always running
            </p>
          </div>
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background-200 border border-neutral-200 text-warning-600 hover:border-warning-400 hover:text-warning-700 disabled:opacity-50 transition-colors"
          >
            {restarting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Restart WS
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatBox label="Active agents" value={stats?.activeAgents ?? 0} />
          <StatBox label="Pending" value={stats?.pendingConnections ?? 0} />
          <StatBox label="Total conn." value={stats?.connectionsTotal ?? 0} />
          <StatBox
            label="Messages in"
            value={(stats?.messagesIn ?? 0).toLocaleString()}
          />
          <StatBox
            label="Messages out"
            value={(stats?.messagesOut ?? 0).toLocaleString()}
          />
          <StatBox
            label="Data transferred"
            value={formatBytes((stats?.bytesIn ?? 0) + (stats?.bytesOut ?? 0))}
          />
        </div>
      </div>

      {/* Chart */}
      <TrafficChart stats={stats} color="primary" />

      {/* Table */}
      <AgentsTable agents={agents} transport="ws" />

      {/* Log panel */}
      <LogPanel logs={logs} />
    </div>
  );
}
