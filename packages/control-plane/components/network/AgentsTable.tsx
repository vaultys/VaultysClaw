import { shortDid, timeAgo } from "@vaultysclaw/shared";
import type { ConnectedAgentRow, NetworkTransport } from "@/lib/contracts";

export function AgentsTable({
  agents,
  transport,
}: {
  agents: ConnectedAgentRow[];
  transport: NetworkTransport;
}) {
  const filtered = agents.filter((a) => a.transport === transport);

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-foreground">
            Live connections
          </span>
          <span className="ml-2 text-xs text-foreground-400">
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground-400">
          <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse inline-block" />
          Auto-refreshes every 5s
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-foreground-500">
          No {transport === "ws" ? "WebSocket" : "WebRTC"} agents connected
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
              <th className="px-5 py-3">Agent</th>
              <th className="px-5 py-3">DID</th>
              <th className="px-5 py-3">Connected</th>
              <th className="px-5 py-3">Last heartbeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filtered.map((agent) => (
              <tr
                key={agent.id}
                className="hover:bg-background-200/30 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-foreground">
                  {agent.name}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-foreground-500">
                  <span title={agent.id}>{shortDid(agent.id)}</span>
                </td>
                <td className="px-5 py-3 text-xs text-foreground-500">
                  {timeAgo(agent.connectedAt)}
                </td>
                <td className="px-5 py-3 text-xs text-foreground-500">
                  {timeAgo(agent.lastHeartbeat)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
